import { useCallback, useRef, useState } from "react";

export type AudioProgress = {
  wordIndex: number;
  wordCount: number;
};

type AudioItem = {
  data?: string;
  url?: string;
  text?: string;
  format?: string;
  onEnd?: () => void;
  onProgress?: (progress: AudioProgress) => void;
};

function mimeType(format?: string): string {
  const f = (format ?? "wav").toLowerCase();
  if (f.includes("mp3") || f === "mpeg") return "audio/mpeg";
  if (f.includes("ogg")) return "audio/ogg";
  if (f.includes("webm")) return "audio/webm";
  return "audio/wav";
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<AudioItem[]>([]);
  const playingRef = useRef(false);
  const onIdleRef = useRef<(() => void) | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const playGenerationRef = useRef(0);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const isStopped = useCallback(
    (generation: number) => generation !== playGenerationRef.current,
    [],
  );

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const stopActiveSource = useCallback(() => {
    const source = activeSourceRef.current;
    if (!source) return;
    try {
      source.stop(0);
      source.disconnect();
    } catch {
      /* already stopped */
    }
    activeSourceRef.current = null;
  }, []);

  const stopActiveElement = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.ontimeupdate = null;
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.load();
    audioRef.current = null;
  }, []);

  const flushIdle = useCallback(() => {
    const cb = onIdleRef.current;
    onIdleRef.current = null;
    cb?.();
  }, []);

  const ensureContext = useCallback(async (): Promise<AudioContext | null> => {
    const Ctx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }, []);

  const startProgressTimer = useCallback(
    (item: AudioItem, getRatio: () => number, generation: number) => {
      clearProgressTimer();
      const total = wordCount(item.text ?? "");
      if (!item.onProgress || total === 0) return;

      progressTimerRef.current = window.setInterval(() => {
        if (isStopped(generation)) return;
        const ratio = Math.min(Math.max(getRatio(), 0), 1);
        const wordIndex = Math.min(total - 1, Math.floor(ratio * total));
        item.onProgress?.({ wordIndex, wordCount: total });
      }, 60);
    },
    [clearProgressTimer, isStopped],
  );

  const playWithWebAudio = useCallback(
    async (
      item: AudioItem,
      bytes: ArrayBuffer,
      generation: number,
    ): Promise<boolean> => {
      if (isStopped(generation)) return false;
      const ctx = await ensureContext();
      if (!ctx || isStopped(generation)) return false;
      try {
        const buffer = await ctx.decodeAudioData(bytes.slice(0));
        if (isStopped(generation)) return false;
        await new Promise<void>((resolve) => {
          if (isStopped(generation)) {
            resolve();
            return;
          }
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          activeSourceRef.current = source;
          const startAt = ctx.currentTime;
          startProgressTimer(
            item,
            () => (ctx.currentTime - startAt) / buffer.duration,
            generation,
          );
          source.onended = () => {
            if (activeSourceRef.current === source) {
              activeSourceRef.current = null;
            }
            clearProgressTimer();
            resolve();
          };
          source.start(0);
        });
        return !isStopped(generation);
      } catch {
        clearProgressTimer();
        return false;
      }
    },
    [clearProgressTimer, ensureContext, isStopped, startProgressTimer],
  );

  const playWithElement = useCallback(
    (item: AudioItem, src: string, generation: number): Promise<boolean> =>
      new Promise((resolve) => {
        if (isStopped(generation)) {
          resolve(false);
          return;
        }
        const audio = new Audio();
        audio.preload = "auto";
        audioRef.current = audio;

        const finish = (ok: boolean) => {
          audio.onended = null;
          audio.onerror = null;
          audio.ontimeupdate = null;
          if (audioRef.current === audio) {
            audioRef.current = null;
          }
          clearProgressTimer();
          resolve(ok && !isStopped(generation));
        };

        startProgressTimer(
          item,
          () => (audio.duration ? audio.currentTime / audio.duration : 0),
          generation,
        );
        audio.ontimeupdate = () => {
          if (isStopped(generation) || !audio.duration) return;
          const total = wordCount(item.text ?? "");
          if (item.onProgress && total > 0) {
            const ratio = audio.currentTime / audio.duration;
            item.onProgress({
              wordIndex: Math.min(total - 1, Math.floor(ratio * total)),
              wordCount: total,
            });
          }
        };
        audio.onended = () => finish(true);
        audio.onerror = () => finish(false);

        const tryPlay = () => {
          void audio
            .play()
            .then(() => undefined)
            .catch(() => finish(false));
        };

        audio.addEventListener("canplaythrough", tryPlay, { once: true });
        audio.addEventListener("error", () => finish(false), { once: true });
        audio.src = src;
        audio.load();
      }),
    [clearProgressTimer, isStopped, startProgressTimer],
  );

  const playItem = useCallback(
    async (item: AudioItem, generation: number): Promise<boolean> => {
      if (isStopped(generation)) return false;
      await ensureContext();

      if (item.data) {
        const mime = mimeType(item.format);
        const dataSrc = `data:${mime};base64,${item.data}`;
        const elementOk = await playWithElement(item, dataSrc, generation);
        if (elementOk) return true;
        if (isStopped(generation)) return false;
        const bytes = base64ToBytes(item.data);
        return playWithWebAudio(item, bytes.buffer, generation);
      }
      if (item.url) {
        try {
          const resp = await fetch(item.url);
          if (resp.ok && !isStopped(generation)) {
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            try {
              const ok = await playWithElement(item, blobUrl, generation);
              if (ok) return true;
            } finally {
              URL.revokeObjectURL(blobUrl);
            }
          }
        } catch {
          /* fall through */
        }
        if (isStopped(generation)) return false;
        return playWithElement(item, item.url, generation);
      }
      if (item.text && "speechSynthesis" in window) {
        if (isStopped(generation)) return false;
        const total = wordCount(item.text);
        await new Promise<void>((resolve) => {
          if (isStopped(generation)) {
            resolve();
            return;
          }
          const u = new SpeechSynthesisUtterance(item.text);
          u.lang = "en-US";
          u.onboundary = (ev) => {
            if (isStopped(generation)) return;
            if (ev.name !== "word" || !item.onProgress || total === 0) return;
            const spoken = item.text!.slice(0, ev.charIndex + ev.charLength);
            const idx = wordCount(spoken) - 1;
            item.onProgress({ wordIndex: Math.max(0, idx), wordCount: total });
          };
          u.onend = () => resolve();
          u.onerror = () => resolve();
          speechSynthesis.speak(u);
        });
        return !isStopped(generation);
      }
      return false;
    },
    [ensureContext, isStopped, playWithElement, playWithWebAudio],
  );

  const playNext = useCallback(
    async (generation: number) => {
      if (isStopped(generation)) {
        return;
      }

      const next = queueRef.current.shift();
      if (!next) {
        playingRef.current = false;
        setIsPlaying(false);
        clearProgressTimer();
        flushIdle();
        return;
      }

      playingRef.current = true;
      setIsPlaying(true);
      const ok = await playItem(next, generation);
      if (isStopped(generation) || !playingRef.current) {
        return;
      }
      if (ok) {
        next.onEnd?.();
      } else if (next.text && "speechSynthesis" in window) {
        await playItem(
          { ...next, url: undefined, data: undefined },
          generation,
        );
        if (!isStopped(generation) && playingRef.current) {
          next.onEnd?.();
        }
      }
      if (isStopped(generation) || !playingRef.current) {
        return;
      }
      void playNext(generation);
    },
    [clearProgressTimer, flushIdle, isStopped, playItem],
  );

  const enqueue = useCallback(
    (item: AudioItem) => {
      queueRef.current.push(item);
      if (!playingRef.current) {
        const generation = playGenerationRef.current;
        void (async () => {
          await ensureContext();
          if (isStopped(generation)) {
            return;
          }
          void playNext(generation);
        })();
      }
    },
    [ensureContext, isStopped, playNext],
  );

  const runAfterIdle = useCallback((fn: () => void) => {
    if (!playingRef.current && queueRef.current.length === 0) {
      fn();
      return;
    }
    onIdleRef.current = fn;
  }, []);

  const unlock = useCallback(async () => {
    await ensureContext();
  }, [ensureContext]);

  const stop = useCallback(() => {
    playGenerationRef.current += 1;
    queueRef.current = [];
    playingRef.current = false;
    setIsPlaying(false);
    clearProgressTimer();
    onIdleRef.current = null;
    stopActiveSource();
    stopActiveElement();
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
  }, [clearProgressTimer, stopActiveElement, stopActiveSource]);

  return { enqueue, runAfterIdle, stop, unlock, isPlaying };
};
