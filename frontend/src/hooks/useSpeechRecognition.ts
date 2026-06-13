import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechResultItem {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: { results: SpeechResultItem[]; resultIndex: number }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface SpeechOptions {
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  onEnd?: (reason: "auto" | "finish") => void;
  onError?: (message: string) => void;
}

export function useSpeechRecognition({
  onResult,
  onInterim,
  onEnd,
  onError,
}: SpeechOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const listeningRef = useRef(false);
  const latestTranscriptRef = useRef("");
  const sentRef = useRef(false);
  const finishRequestedRef = useRef(false);
  const onResultRef = useRef(onResult);
  const onInterimRef = useRef(onInterim);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onInterimRef.current = onInterim;
  onEndRef.current = onEnd;
  onErrorRef.current = onError;

  const emitResult = useCallback((text: string | undefined) => {
    const trimmed = (text ?? "").trim();
    if (!trimmed || sentRef.current) return false;
    sentRef.current = true;
    latestTranscriptRef.current = "";
    onResultRef.current(trimmed);
    return true;
  }, []);

  useEffect(() => {
    const SR =
      (window as Window & { SpeechRecognition?: SpeechRecognitionConstructor })
        .SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor })
        .webkitSpeechRecognition;
    setSupported(!!SR);
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = true;

    rec.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript;
      }
      const trimmed = combined.trim();
      latestTranscriptRef.current = trimmed;
      if (trimmed) {
        onInterimRef.current?.(trimmed);
      }
    };

    rec.onend = () => {
      listeningRef.current = false;
      setListening(false);
      const reason = finishRequestedRef.current ? "finish" : "auto";
      finishRequestedRef.current = false;
      if (latestTranscriptRef.current && !sentRef.current) {
        emitResult(latestTranscriptRef.current);
      }
      onEndRef.current?.(reason);
    };

    rec.onerror = (event) => {
      listeningRef.current = false;
      setListening(false);
      const code = event.error ?? "unknown";
      const reason = finishRequestedRef.current ? "finish" : "auto";
      finishRequestedRef.current = false;
      if (code !== "aborted" && code !== "no-speech") {
        onErrorRef.current?.(code);
      }
      onEndRef.current?.(reason);
    };

    recognitionRef.current = rec;
  }, []);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || listeningRef.current) return;
    sentRef.current = false;
    finishRequestedRef.current = false;
    latestTranscriptRef.current = "";
    listeningRef.current = true;
    setListening(true);
    try {
      rec.start();
    } catch {
      // start() throws if already started; recover on next tap
      listeningRef.current = false;
      setListening(false);
    }
  }, []);

  const finish = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || !listeningRef.current) return;
    finishRequestedRef.current = true;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const cancel = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.abort();
    } catch {
      /* ignore */
    }
    listeningRef.current = false;
    setListening(false);
    latestTranscriptRef.current = "";
  }, []);

  return { listening, supported, start, finish, cancel };
}
