import { useCallback, useEffect, useRef, useState } from "react";
import { ClimbingStairsLoader } from "./components/ClimbingStairsLoader";
import { ConversationTranscript } from "./components/ConversationTranscript";
import { WrapUpPanel } from "./components/WrapUpPanel";
import { MicLevelMeter } from "./components/MicLevelMeter";
import { RoundScreen } from "./components/RoundScreen";
import { SidePowerButton } from "./components/SideControls";
import { useAudioCapture, micAccessHint, type MicLevelStatus } from "./hooks/useAudioCapture";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useWebSocket } from "./hooks/useWebSocket";
import { buildClientPayload } from "./utils/clientInfo";
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
  isPlaybackPaused,
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
  isPlaybackPaused: boolean;
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
    if (isPlaybackPaused) {
      return (
        <>
          <p className="screen-title">📰 News</p>
          <p className="screen-sub screen-sub--lesson">{article?.title}</p>
          <p className="screen-title">⏸ Paused</p>
          <p className="tap-hint">点圆屏继续播报</p>
        </>
      );
    }
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
    if (isPlaybackPaused) {
      return (
        <>
          <p className="screen-title">Question</p>
          <p className="screen-title">⏸ Paused</p>
          <p className="tap-hint">点圆屏继续播报</p>
        </>
      );
    }
    return (
      <>
        <p className="screen-title">Question</p>
        <div className="mic-circle practice">🔊</div>
        <p className="screen-sub">请看右侧文字稿</p>
      </>
    );
  }

  if (uiState === "OPEN_QUESTION" && !isAiSpeaking) {
    if (isPlaybackPaused) {
      return (
        <>
          <p className="screen-title">Question</p>
          <p className="screen-title">⏸ Paused</p>
          <p className="tap-hint">点圆屏继续播报</p>
        </>
      );
    }
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
    if (isPlaybackPaused) {
      return (
        <>
          <p className="screen-title">⏸ Paused</p>
          <p className="tap-hint">点圆屏继续播报</p>
        </>
      );
    }
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
    if (isPlaybackPaused) {
      return (
        <>
          <p className="screen-title">Summary</p>
          <p className="screen-title">⏸ Paused</p>
          <p className="tap-hint">点圆屏继续播报</p>
        </>
      );
    }
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
        <p className="tap-hint">总结已保存 · 右侧查看 · 首页可查历史</p>
      </>
    );
  }

  return null;
}

export function NewsApp({
  onBack,
  deviceMode = false,
}: {
  onBack: () => void;
  deviceMode?: boolean;
}) {
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

  const { enqueue, runAfterIdle, stop: stopAudio, pause: pausePlayback, resume: resumePlayback, unlock: unlockAudio, isPlaying, isPaused: isPlaybackPaused } =
    useAudioPlayer();

  const micActive = uiState === "LISTENING" && !isPlaying;
  const {
    level: micLevel,
    bars: micBars,
    status: micStatus,
    micReady,
    acquireMic,
    finishRecording,
    resumeRecording,
  } = useAudioCapture({
    listening: micActive,
    sessionActive: sessionReady,
  });
  finishRecordingRef.current = finishRecording;
  resumeRecordingRef.current = resumeRecording;
  const micReadyRef = useRef(micReady);
  const micStatusRef = useRef(micStatus);
  micReadyRef.current = micReady;
  micStatusRef.current = micStatus;
  const acquireMicRef = useRef(acquireMic);
  acquireMicRef.current = acquireMic;

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

  const startSession = useCallback(async () => {
    void unlockAudio();
    audioEnabledRef.current = true;
    setErrorMessage("");
    const micOk = await acquireMicRef.current();
    if (!micOk) {
      setErrorMessage(micAccessHint());
      return;
    }
    setTranscript([]);
    setWrapUp(null);
    sendRef.current({
      type: "control",
      payload: {
        action: "start_session",
        activity_type: "news",
        grade: 3,
        ...buildClientPayload(),
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

  useEffect(() => {
    if (uiState !== "LISTENING") return;
    if (micStatus === "pending") {
      setListenHint("Tap the round screen to enable mic");
    } else if (micStatus !== "denied") {
      setListenHint("Tap the round screen to submit");
    }
  }, [uiState, micStatus]);

  const handleTap = useCallback(async () => {
    void unlockAudio();
    if (!connected) {
      setErrorMessage("Connecting…");
      return;
    }

    const state = uiStateRef.current;
    const ttsPlaybackPhase =
      state === "BROADCAST" ||
      state === "OPEN_QUESTION" ||
      state === "WRAP_UP" ||
      state === "THINKING";

    if (isPlaybackPaused) {
      void resumePlayback();
      return;
    }

    if (state === "LISTENING") {
      if (
        !micReadyRef.current ||
        micStatusRef.current === "pending" ||
        micStatusRef.current === "denied"
      ) {
        const ok = await acquireMicRef.current();
        if (!ok) {
          setErrorMessage(micAccessHint());
          return;
        }
        setListenHint("Tap the round screen to submit");
        return;
      }
      void submitRecording();
      return;
    }

    if (ttsPlaybackPhase && isPlaying) {
      pausePlayback();
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
    isPlaybackPaused,
    isPlaying,
    pausePlayback,
    resumePlayback,
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
      isPlaybackPaused ||
      uiState === "BROADCAST" ||
      uiState === "OPEN_QUESTION" ||
      uiState === "WRAP_UP" ||
      uiState === "THINKING" ||
      !sessionReady ||
      !!errorMessage);

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

  const toggleRef = useRef(handleToggle);
  toggleRef.current = handleToggle;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button")) return;

      if (deviceMode && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        toggleRef.current();
        return;
      }

      if (e.code !== "Space" && e.key !== " ") return;
      if (!interactive) return;
      e.preventDefault();
      handleTapRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deviceMode, interactive]);

  const handleBack = () => {
    stopSession();
    onBack();
  };

  return (
    <div className={`app-shell app-shell--news${deviceMode ? " app-shell--device" : ""}`}>
      <div className={`app-layout app-layout--news${deviceMode ? " app-layout--device" : ""}`}>
        {!deviceMode ? (
          <SidePowerButton
            running={running}
            disabled={!connected}
            onToggle={handleToggle}
          />
        ) : null}
        <div className={`app-stage app-stage--news${deviceMode ? " app-stage--device" : ""}`}>
          <RoundScreen
            ref={roundScreenRef}
            responsive={deviceMode}
            shape={deviceMode ? "panel" : "round"}
            size={deviceMode ? undefined : 360}
            onTap={handleTap}
            interactive={interactive}
          >
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
              isPlaybackPaused={isPlaybackPaused}
              loadingLabel={loadingLabel}
            />
          </RoundScreen>
          {!deviceMode ? (
            <ConversationTranscript
              entries={transcript}
              speakingId={speakingId}
              speakingWordIndex={speakingWordIndex}
              turnCount={turnCount}
              minTurns={minTurns}
              phaseLabel={phaseLabel(phase, uiState)}
              pendingUser={asrPending}
            />
          ) : null}
        </div>
        {!deviceMode ? (
          <button type="button" className="side-btn side-btn--next" onClick={handleBack}>
            <span className="side-btn__icon">←</span>
            <span className="side-btn__label">返回</span>
          </button>
        ) : null}
      </div>
      {!deviceMode && wrapUp && uiState === "COMPLETE" ? (
        <WrapUpPanel
          wrapUp={wrapUp}
          header={
            article
              ? {
                  title: article.title,
                  subtitle: article.source,
                  meta: `Turn ${turnCount}/${minTurns}`,
                }
              : undefined
          }
        />
      ) : null}
      {deviceMode ? (
        <div className="app-footer-row">
          <button type="button" className="back-link" onClick={handleBack}>
            ← 返回主界面
          </button>
          <span className="device-key-hint">BtnA/Space 主操作 · P 开/停</span>
        </div>
      ) : null}
    </div>
  );
}
