import { useEffect, useState } from "react";

export type MicLevelStatus = "idle" | "active" | "silent" | "denied";

const BAR_COUNT = 9;
const SIGNAL_THRESHOLD = 10;
const SILENT_FRAMES = 120;

function peakOf(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

export function useMicLevel(active: boolean) {
  const [level, setLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 8),
  );
  const [status, setStatus] = useState<MicLevelStatus>("idle");

  useEffect(() => {
    if (!active) {
      setLevel(0);
      setBars(Array.from({ length: BAR_COUNT }, () => 8));
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let silentFrames = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (cancelled) return;

        ctx = new AudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);

        const freq = new Uint8Array(analyser.frequencyBinCount);
        const time = new Uint8Array(analyser.fftSize);

        const tick = () => {
          if (cancelled) return;

          analyser.getByteFrequencyData(freq);
          analyser.getByteTimeDomainData(time);

          let sumSq = 0;
          for (let i = 0; i < time.length; i++) {
            const v = (time[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / time.length);
          const rmsLevel = Math.min(100, Math.round(rms * 400));

          const usable = freq.slice(0, Math.floor(freq.length * 0.6));
          const chunk = Math.max(1, Math.floor(usable.length / BAR_COUNT));
          const nextBars = Array.from({ length: BAR_COUNT }, (_, i) => {
            const start = i * chunk;
            let s = 0;
            for (let j = start; j < start + chunk && j < usable.length; j++) {
              s += usable[j];
            }
            const avg = s / chunk;
            return Math.max(8, Math.min(100, Math.round((avg / 255) * 100)));
          });
          setBars(nextBars);

          const barPeak = peakOf(nextBars);
          const displayLevel = Math.max(rmsLevel, barPeak);
          setLevel(displayLevel);

          if (displayLevel >= SIGNAL_THRESHOLD) {
            silentFrames = 0;
            setStatus("active");
          } else {
            silentFrames += 1;
            setStatus(silentFrames >= SILENT_FRAMES ? "silent" : "active");
          }

          raf = requestAnimationFrame(tick);
        };

        tick();
      } catch {
        if (!cancelled) {
          setStatus("denied");
          setLevel(0);
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [active]);

  return { level, bars, status };
}
