import { useCallback, useEffect, useRef, useState } from "react";
import { ClimbingStairsLoader } from "./components/ClimbingStairsLoader";
import { ConversationTranscript } from "./components/ConversationTranscript";
import { MicLevelMeter } from "./components/MicLevelMeter";
import { RoundScreen } from "./components/RoundScreen";
import { SidePowerButton } from "./components/SideControls";
import { useAudioCapture, type MicLevelStatus } from "./hooks/useAudioCapture";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useWebSocket } from "./hooks/useWebSocket";
import type {
  NewsArticle,
  NewsUIState,
  TranscriptEntry,
  WrapUpPayload,
  WSMessage,
} from "./types";
import { isLastTtsSegment, resolveTtsAudioUrl } from "./utils/ttsAudio";

const MIN_AUDIO_BYTES = 1500;

function dataUrlByteSize(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  if (idx < 0) return 0;
  return Math.floor((dataUrl.length - idx - 1) * 0.75);
}

function phaseLabel(phase: string, uiState: NewsUIState): string {
  if (uiState === "PAUSED") return "Paused";
  const map: Record<string, string> = {
    fetch: "Finding news",
    broadcast: "Listen",
    open_question: "Question",
    dialogue: "Chat",
    wrap_up: "Summary",
    complete: "Done",
  };
  return map[phase] || phase;
}

function loadingLabelFor(uiState: NewsUIState): string {
  if (uiState === "FETCHING") return "Fetching today's news…";
  if (uiState === "THINKING") return "Thinking…";
  if (uiState === "WRAP_UP") return "Building summary…";
  return "Preparing voice…";
}

function NewsScreenContent({
  uiState,
  article,
  errorMessage,
  wrapUp,
  turnCount,
  minTurns,
  micLevel,
  micBars,
  micStatus,
  listenHint,
  isAiSpeaking,
  isTtsLoading,
  loadingLabel,
}: {
  uiState: NewsUIState;
  article: NewsArticle | null;
  errorMessage: string;
  wrapUp: WrapUpPayload | null;
  turnCount: number;
  minTurns: number;
  micLevel: number;
  micBars: number[];
  micStatus: MicLevelStatus;
  listenHint: string;
  isAiSpeaking: boolean;
  isTtsLoading: boolean;
  loadingLabel: string;
}) {
  if (errorMessage) {
    return (
      <>
        <p className="screen-title">Oops</p>
        <p className="screen-sub screen-sub--error">{errorMessage}</p>
        <p className="tap-hint">Tap to retry</p>
      </>
    );
  }

  if (uiState === "HOME") {
    return (
      <>
        <div className="progress-ring" />
        <p className="screen-title">News Chat</p>
        <p className="screen-sub">Listen · Talk · Learn</p>
        <p className="tap-hint">点圆屏或左侧按钮开始</p>
      </>
    );
  }

  if (uiState === "FETCHING") {
    return (
      <>
        <p className="screen-title">Finding news…</p>
        <ClimbingStairsLoader label={loadingLabel} />
      </>
    );
  }

  if (uiState === "BROADCAST") {
    return (
      <>
        <p className="screen-title">📰 News</p>
        <p className="screen-sub screen-sub--lesson">{article?.title}</p>
        {isTtsLoading && !isAiSpeaking ? (
          <ClimbingStairsLoader label={loadingLabel} />
        ) : (
          <div className="mic-circle practice">🔊</div>
        )}
        {!isTtsLoading && isAiSpeaking ? (
          <p className="screen-sub">请看右侧文字稿</p>
        ) : null}
        <p className="tap-hint">点圆屏暂停 / 继续</p>
      </>
    );
  }

  if (uiState === "OPEN_QUESTION" && isAiSpeaking) {
    return (
      <>
        <p className="screen-title">Question</p>
        <div className="mic-circle practice">🔊</div>
        <p className="screen-sub">请看右侧文字稿</p>
      </>
    );
  }

  if (uiState === "OPEN_QUESTION") {
    return (
      <>
        <p className="screen-title">Question</p>
        {isTtsLoading && !isAiSpeaking ? (
          <ClimbingStairsLoader label={loadingLabel} />
        ) : (
          <>
            <p className="screen-sub">Listen to the AI</p>
            <div className="mic-circle practice">🔊</div>
          </>
        )}
      </>
    );
  }

  if (isAiSpeaking && (uiState === "THINKING" || uiState === "WRAP_UP")) {
    return (
      <>
        <p className="screen-title">{uiState === "WRAP_UP" ? "Summary" : "AI speaking"}</p>
        <div className="mic-circle practice">🔊</div>
        <p className="screen-sub">请看右侧文字稿</p>
      </>
    );
  }

  if (uiState === "LISTENING") {
    const micScale = 1 + micLevel / 400;
    return (
      <>
        <p className="round-badge">
          Turn {turnCount}/{minTurns}
        </p>
        <p className="screen-title">Your turn</p>
        <p className="screen-sub">Speak in English</p>
        <div
          className="mic-circle listening"
          style={{ transform: `scale(${micScale.toFixed(2)})` }}
        >
          🎤
        </div>
        <MicLevelMeter level={micLevel} bars={micBars} status={micStatus} />
        <p className="tap-hint">{listenHint}</p>
      </>
    );
  }

  if (uiState === "THINKING") {
    return (
      <>
        <p className="screen-title">Thinking…</p>
        <ClimbingStairsLoader label={loadingLabel} />
      </>
    );
  }

  if (uiState === "PAUSED") {
    return (
      <>
        <p className="screen-title">⏸ Paused</p>
        <p className="screen-sub">Tap to continue</p>
      </>
    );
  }

  if (uiState === "WRAP_UP" && wrapUp) {
    return (
      <>
        <p className="screen-title">Summary</p>
        {isTtsLoading && !isAiSpeaking ? (
          <ClimbingStairsLoader label={loadingLabel} />
        ) : (
          <>
            <p className="practice-sentence practice-sentence--compact">
              {wrapUp.topic_summary}
            </p>
            <div className="mic-circle practice">🔊</div>
          </>
        )}
      </>
    );
  }

  if (uiState === "COMPLETE") {
    return (
      <>
        <div className="star">🎉</div>
        <p className="screen-title">Well done!</p>
        <p className="screen-sub">You finished {turnCount} turns</p>
        <p className="tap-hint">See summary on the right →</p>
      </>
    );
  }

  return null;
}

export function NewsApp({ onBack }: { onBack: () => void }) {
  const [uiState, setUiState] = useState<NewsUIState>("HOME");
  const [phase, setPhase] = useState("fetch");
  const [turnCount, setTurnCount] = useState(0);
  const [minTurns, setMinTurns] = useState(3);
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speakingWordIndex, setSpeakingWordIndex] = useState<number | null>(null);
  const [wrapUp, setWrapUp] = useState<WrapUpPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [asrPending, setAsrPending] = useState(false);
  const [listenHint, setListenHint] = useState("说完点圆屏提交");
  const [ttsLoading, setTtsLoading] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const sendRef = useRef<(msg: WSMessage) => boolean>(() => false);
  const uiStateRef = useRef<NewsUIState>("HOME");
  const finishRecordingRef = useRef<
    (options?: { resume?: boolean }) => Promise<string | null>
  >(async () => null);
  const resumeRecordingRef = useRef<() => void>(() => {});
  const roundScreenRef = useRef<HTMLDivElement>(null);
  const startListeningRef = useRef<() => void>(() => {});
  const pausedRef = useRef(false);
  const audioEnabledRef = useRef(true);

  const { enqueue, runAfterIdle, stop: stopAudio, unlock: unlockAudio, isPlaying } =
    useAudioPlayer();

  const micActive = uiState === "LISTENING" && !isPlaying;
  const {
    level: micLevel,
    bars: micBars,
    status: micStatus,
    finishRecording,
    resumeRecording,
  } = useAudioCapture(micActive);
  finishRecordingRef.current = finishRecording;
  resumeRecordingRef.current = resumeRecording;

  const resetLocal = useCallback(() => {
    sessionIdRef.current = null;
    setSessionReady(false);
    setUiState("HOME");
    setPhase("fetch");
    setTurnCount(0);
    setArticle(null);
    setTranscript([]);
    setSpeakingId(null);
    setSpeakingWordIndex(null);
    setWrapUp(null);
    setErrorMessage("");
    setSubmitting(false);
    setAsrPending(false);
    setTtsLoading(false);
    pausedRef.current = false;
  }, []);

  const sendContinueNews = useCallback((step: string) => {
    const sid = sessionIdRef.current;
    if (!sid || pausedRef.current || !audioEnabledRef.current || !step) return;
    sendRef.current({
      type: "control",
      session_id: sid,
      payload: {
        action: "continue_news",
        news_step: step,
        session_id: sid,
      },
    });
  }, []);

  const stopSession = useCallback(() => {
    audioEnabledRef.current = false;
    stopAudio();
    setSpeakingId(null);
    setSpeakingWordIndex(null);
    setTtsLoading(false);
    void finishRecordingRef.current({ resume: false });
    const sid = sessionIdRef.current;
    if (sid) {
      sendRef.current({
        type: "control",
        session_id: sid,
        payload: { action: "stop_session", session_id: sid },
      });
    } else {
      resetLocal();
    }
  }, [resetLocal, stopAudio]);

  const startSession = useCallback(() => {
    void unlockAudio();
    audioEnabledRef.current = true;
    setErrorMessage("");
    setTranscript([]);
    setWrapUp(null);
    sendRef.current({
      type: "control",
      payload: {
        action: "start_session",
        activity_type: "news",
        grade: 3,
      },
    });
  }, [unlockAudio]);

  const focusRoundScreen = useCallback(() => {
    window.requestAnimationFrame(() => {
      roundScreenRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const beginListening = useCallback(() => {
    if (
      uiStateRef.current === "PAUSED" ||
      uiStateRef.current === "FETCHING" ||
      uiStateRef.current === "HOME" ||
      uiStateRef.current === "COMPLETE" ||
      uiStateRef.current === "WRAP_UP"
    ) {
      return;
    }
    const sid = sessionIdRef.current;
    if (!sid) return;
    sendRef.current({
      type: "control",
      session_id: sid,
      payload: { action: "start_listening", session_id: sid },
    });
    setUiState("LISTENING");
    setListenHint("说完点圆屏提交");
    setTtsLoading(false);
    focusRoundScreen();
  }, [focusRoundScreen]);

  const scheduleListen = useCallback(() => {
    runAfterIdle(() => {
      window.setTimeout(() => beginListening(), 500);
    });
  }, [beginListening, runAfterIdle]);

  startListeningRef.current = scheduleListen;

  const pauseSession = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid || uiStateRef.current === "PAUSED") return;
    stopAudio();
    setSpeakingId(null);
    setSpeakingWordIndex(null);
    pausedRef.current = true;
    sendRef.current({
      type: "control",
      session_id: sid,
      payload: { action: "pause_session", session_id: sid },
    });
    setUiState("PAUSED");
  }, [stopAudio]);

  const resumeSession = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    pausedRef.current = false;
    sendRef.current({
      type: "control",
      session_id: sid,
      payload: { action: "resume_session", session_id: sid },
    });
  }, []);

  const submitRecording = useCallback(async () => {
    if (submitting || uiStateRef.current !== "LISTENING") return;
    const sid = sessionIdRef.current;
    if (!sid) return;

    setSubmitting(true);
    setAsrPending(true);
    setListenHint("Recognizing…");

    try {
      const audioDataUrl = await finishRecordingRef.current({ resume: false });
      if (!audioDataUrl || dataUrlByteSize(audioDataUrl) < MIN_AUDIO_BYTES) {
        setListenHint("Recording too short — try again");
        setAsrPending(false);
        resumeRecordingRef.current();
        return;
      }
      setUiState("THINKING");
      setTtsLoading(true);
      sendRef.current({
        type: "asr",
        session_id: sid,
        payload: { action: "asr_final", audio_base64: audioDataUrl },
      });
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

  const enqueueTts = useCallback(
    async (msg: WSMessage) => {
      await unlockAudio();
      const field = String(msg.payload.field ?? "");
      const entryId = msg.payload.entry_id as string | undefined;
      const segmentText = String(
        msg.payload.segment_text ?? msg.payload.text ?? "",
      );
      const wordOffset = Number(msg.payload.word_offset ?? 0);
      const lastSegment = isLastTtsSegment(msg.payload);

      if (entryId) setSpeakingId(entryId);

      const onDone = () => {
        if (!lastSegment) return;
        setSpeakingId(null);
        setSpeakingWordIndex(null);
        if (field === "news_broadcast") {
          sendContinueNews("open_question");
        }
      };

      const item = {
        text: segmentText || undefined,
        onEnd: onDone,
        onProgress: entryId
          ? (p: { wordIndex: number }) =>
              setSpeakingWordIndex(wordOffset + p.wordIndex)
          : undefined,
      };

      let queued = false;
      if (msg.payload.data_base64) {
        enqueue({
          ...item,
          data: String(msg.payload.data_base64),
          format: String(msg.payload.format ?? "wav"),
        });
        queued = true;
      } else if (msg.payload.url) {
        enqueue({
          ...item,
          url: resolveTtsAudioUrl(String(msg.payload.url)),
          format: String(msg.payload.format ?? "wav"),
        });
        queued = true;
      } else if (msg.payload.text) {
        enqueue({
          ...item,
          text: segmentText,
          format: "text_fallback",
        });
        queued = true;
      }

      if (queued) {
        setTtsLoading(false);
      } else {
        setTtsLoading(false);
        console.error("TTS message had no playable audio", field);
        if (field === "news_broadcast" && lastSegment) {
          sendContinueNews("open_question");
        }
      }
    },
    [enqueue, sendContinueNews, unlockAudio],
  );

  const handleWsMessage = useCallback(
    (msg: WSMessage) => {
      const msgSessionId =
        msg.session_id ?? (msg.payload.session_id as string | undefined);
      if (
        msgSessionId &&
        sessionIdRef.current &&
        msgSessionId !== sessionIdRef.current
      ) {
        return;
      }

      if (msg.type === "error") {
        setErrorMessage(String(msg.payload.message ?? "Something went wrong"));
        setAsrPending(false);
        return;
      }

      if (msg.type === "control") {
        const action = msg.payload.action as string;

        if (action === "session_started") {
          sessionIdRef.current = String(msg.payload.session_id);
          setSessionReady(true);
          setErrorMessage("");
          if (msg.payload.min_turns) {
            setMinTurns(Number(msg.payload.min_turns));
          }
        }

        if (action === "session_stopped") {
          resetLocal();
          return;
        }

        if (action === "news_ready" && msg.payload.article) {
          setArticle(msg.payload.article as NewsArticle);
        }

        if (action === "phase_changed") {
          if (msg.payload.phase) setPhase(String(msg.payload.phase));
          if (msg.payload.turn_count !== undefined) {
            setTurnCount(Number(msg.payload.turn_count));
          }
          if (msg.payload.min_turns !== undefined) {
            setMinTurns(Number(msg.payload.min_turns));
          }
        }

        if (action === "transcript_append" && msg.payload.entry) {
          const entry = msg.payload.entry as TranscriptEntry;
          setTranscript((prev) => {
            if (prev.some((e) => e.id === entry.id)) return prev;
            return [...prev, entry];
          });
          if (entry.role === "assistant") {
            setTtsLoading(true);
          }
        }

        if (action === "transcript_speaking" && msg.payload.entry_id) {
          setSpeakingId(String(msg.payload.entry_id));
        }

        if (action === "ui_state" && msg.payload.ui_state) {
          const next = msg.payload.ui_state as NewsUIState;
          if (next === "LISTENING") {
            setUiState("LISTENING");
            setTtsLoading(false);
            setListenHint("说完点圆屏提交");
          } else {
            setUiState(next);
          }
          if (
            next === "FETCHING" ||
            next === "BROADCAST" ||
            next === "OPEN_QUESTION" ||
            next === "THINKING" ||
            next === "WRAP_UP"
          ) {
            setTtsLoading(true);
          }
          if (msg.payload.phase) setPhase(String(msg.payload.phase));
          if (msg.payload.turn_count !== undefined) {
            setTurnCount(Number(msg.payload.turn_count));
          }
          if (msg.payload.paused === false) pausedRef.current = false;
        }

        if (action === "asr_transcript") {
          setAsrPending(false);
        }

        if (action === "phase_complete" && msg.payload.next === "listen") {
          startListeningRef.current();
        }
      }

      if (msg.type === "gpt" && msg.payload.wrap_up) {
        setWrapUp(msg.payload.wrap_up as WrapUpPayload);
        setUiState("WRAP_UP");
      }

      if (msg.type === "tts") {
        if (!audioEnabledRef.current) return;
        enqueueTts(msg);
      }
    },
    [enqueueTts, resetLocal],
  );

  const { connected, send } = useWebSocket(handleWsMessage);
  sendRef.current = send;

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  useEffect(() => {
    if (isPlaying) {
      setTtsLoading(false);
    }
  }, [isPlaying]);

  const isTtsLoading = ttsLoading && !isPlaying;
  const loadingLabel = loadingLabelFor(uiState);

  const handleTap = useCallback(() => {
    void unlockAudio();
    if (!connected) {
      setErrorMessage("Connecting…");
      return;
    }

    if (uiStateRef.current === "PAUSED") {
      resumeSession();
      return;
    }

    if (uiStateRef.current === "LISTENING") {
      void submitRecording();
      return;
    }

    if (
      uiStateRef.current === "BROADCAST" ||
      uiStateRef.current === "OPEN_QUESTION" ||
      uiStateRef.current === "WRAP_UP"
    ) {
      pauseSession();
      return;
    }

    if (isPlaying) {
      pauseSession();
      return;
    }

    if (errorMessage) {
      setErrorMessage("");
      startSession();
      return;
    }

    if (!sessionReady) {
      startSession();
    }
  }, [
    connected,
    errorMessage,
    isPlaying,
    pauseSession,
    resumeSession,
    startSession,
    submitRecording,
    unlockAudio,
  ]);

  const handleTapRef = useRef(handleTap);
  handleTapRef.current = handleTap;

  const interactive =
    connected &&
    !submitting &&
    (uiState === "LISTENING" ||
      uiState === "PAUSED" ||
      uiState === "BROADCAST" ||
      uiState === "OPEN_QUESTION" ||
      uiState === "WRAP_UP" ||
      !sessionReady ||
      !!errorMessage);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button")) return;
      if (!interactive) return;
      e.preventDefault();
      handleTapRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [interactive]);

  const running = sessionReady && uiState !== "HOME";
  const isAiSpeaking = isPlaying;

  useEffect(() => {
    if (uiState === "LISTENING" && !isPlaying) {
      focusRoundScreen();
    }
  }, [uiState, isPlaying, focusRoundScreen]);

  const handleToggle = () => {
    if (running) {
      stopSession();
      return;
    }
    startSession();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    focusRoundScreen();
  };

  const handleBack = () => {
    stopSession();
    onBack();
  };

  return (
    <div className="app-shell app-shell--news">
      <div className="app-layout app-layout--news">
        <SidePowerButton
          running={running}
          disabled={!connected}
          onToggle={handleToggle}
        />
        <div className="app-stage app-stage--news">
          <RoundScreen ref={roundScreenRef} onTap={handleTap} interactive={interactive}>
            <NewsScreenContent
              uiState={uiState}
              article={article}
              errorMessage={errorMessage}
              wrapUp={wrapUp}
              turnCount={turnCount}
              minTurns={minTurns}
              micLevel={micLevel ?? 0}
              micBars={micBars ?? []}
              micStatus={micStatus ?? "idle"}
              listenHint={listenHint}
              isAiSpeaking={isAiSpeaking}
              isTtsLoading={isTtsLoading}
              loadingLabel={loadingLabel}
            />
          </RoundScreen>
          <ConversationTranscript
            entries={transcript}
            speakingId={speakingId}
            speakingWordIndex={speakingWordIndex}
            turnCount={turnCount}
            minTurns={minTurns}
            phaseLabel={phaseLabel(phase, uiState)}
            pendingUser={asrPending}
          />
        </div>
        <button type="button" className="side-btn side-btn--next" onClick={handleBack}>
          <span className="side-btn__icon">←</span>
          <span className="side-btn__label">返回</span>
        </button>
      </div>
      {wrapUp && uiState === "COMPLETE" ? (
        <div className="wrap-up-panel">
          {wrapUp.grammar_points?.length ? (
            <section>
              <h3>Grammar</h3>
              <ul>
                {wrapUp.grammar_points.map((g) => (
                  <li key={g.issue}>
                    <strong>{g.issue}</strong>: {g.example} → {g.fix}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {wrapUp.vocabulary?.length ? (
            <section>
              <h3>Words</h3>
              <p>{wrapUp.vocabulary.join(", ")}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
