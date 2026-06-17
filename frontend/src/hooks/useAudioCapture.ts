import { useCallback, useEffect, useRef, useState } from "react";

export type MicLevelStatus =
  | "idle"
  | "pending"
  | "active"
  | "silent"
  | "denied";

const BAR_COUNT = 9;
const SIGNAL_THRESHOLD = 10;
const SILENT_FRAMES = 120;

type UseAudioCaptureOptions = {
  /** True while LISTENING — runs recorder and level meter. */
  listening: boolean;
  /** True while a session is open — keeps the mic stream alive between turns. */
  sessionActive: boolean;
};

function peakOf(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function micAccessHint(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "请使用 https:// 地址访问以启用麦克风";
  }
  return "请允许浏览器使用麦克风（可在浏览器设置中开启）";
}

export function useAudioCapture({
  listening,
  sessionActive,
}: UseAudioCaptureOptions) {
  const [level, setLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 8),
  );
  const [status, setStatus] = useState<MicLevelStatus>("idle");
  const [recording, setRecording] = useState(false);
  const [micReady, setMicReady] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("audio/webm");
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  }, []);

  const startRecorder = useCallback((stream: MediaStream) => {
    stopRecorder();
    const mimeType = pickMimeType();
    mimeTypeRef.current = mimeType || "audio/webm";
    try {
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      return recorder;
    } catch {
      setStatus("denied");
      setRecording(false);
      return null;
    }
  }, [stopRecorder]);

  const releaseMic = useCallback(() => {
    stopRecorder();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMicReady(false);
    setLevel(0);
    setBars(Array.from({ length: BAR_COUNT }, () => 8));
    setStatus("idle");
  }, [stopRecorder]);

  const acquireMic = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) {
      setMicReady(true);
      if (listeningRef.current) {
        startRecorder(streamRef.current);
      }
      setStatus("active");
      return true;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("denied");
      setMicReady(false);
      return false;
    }

    if (!window.isSecureContext) {
      setStatus("denied");
      setMicReady(false);
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      setMicReady(true);
      if (listeningRef.current) {
        const recorder = startRecorder(stream);
        if (!recorder) return false;
      }
      setStatus("active");
      return true;
    } catch {
      setStatus("denied");
      setMicReady(false);
      return false;
    }
  }, [startRecorder]);

  const finishRecording = useCallback(
    async (options?: { resume?: boolean }): Promise<string | null> => {
      const resume = options?.resume ?? true;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        return null;
      }

      return new Promise((resolve) => {
        const onStop = async () => {
          recorder.removeEventListener("stop", onStop);
          const chunks = chunksRef.current;
          chunksRef.current = [];
          let dataUrl: string | null = null;
          if (chunks.length > 0) {
            try {
              const blob = new Blob(chunks, { type: mimeTypeRef.current });
              dataUrl = await blobToDataUrl(blob);
            } catch {
              dataUrl = null;
            }
          }

          if (resume && listeningRef.current && streamRef.current) {
            startRecorder(streamRef.current);
          } else {
            setRecording(false);
          }
          resolve(dataUrl);
        };
        recorder.addEventListener("stop", onStop);
        recorder.stop();
      });
    },
    [startRecorder],
  );

  const resumeRecording = useCallback(() => {
    if (listeningRef.current && streamRef.current) {
      startRecorder(streamRef.current);
    }
  }, [startRecorder]);

  useEffect(() => {
    if (!sessionActive) {
      releaseMic();
    }
  }, [sessionActive, releaseMic]);

  useEffect(() => {
    if (!listening || !micReady || !streamRef.current) {
      stopRecorder();
      if (sessionActive && !micReady) {
        setStatus("pending");
      } else if (!sessionActive) {
        setStatus("idle");
      }
      setLevel(0);
      setBars(Array.from({ length: BAR_COUNT }, () => 8));
      return;
    }

    const stream = streamRef.current;
    startRecorder(stream);

    let cancelled = false;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let silentFrames = 0;

    (async () => {
      try {
        ctx = new AudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        if (cancelled) return;

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
          const rmsLevel = Math.min(
            100,
            Math.round(Math.sqrt(sumSq / time.length) * 400),
          );

          const usable = freq.slice(0, Math.floor(freq.length * 0.6));
          const chunk = Math.max(1, Math.floor(usable.length / BAR_COUNT));
          const nextBars = Array.from({ length: BAR_COUNT }, (_, i) => {
            const start = i * chunk;
            let s = 0;
            for (let j = start; j < start + chunk && j < usable.length; j++) {
              s += usable[j];
            }
            return Math.max(
              8,
              Math.min(100, Math.round((s / chunk / 255) * 100)),
            );
          });
          setBars(nextBars);

          const displayLevel = Math.max(rmsLevel, peakOf(nextBars));
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
      stopRecorder();
      void ctx?.close();
    };
  }, [listening, micReady, sessionActive, startRecorder, stopRecorder]);

  return {
    level,
    bars,
    status,
    recording,
    micReady,
    acquireMic,
    releaseMic,
    finishRecording,
    resumeRecording,
  };
}
