import { useCallback, useEffect, useRef, useState } from "react";
import { HighlightedFeedback } from "./components/HighlightedFeedback";
import { MicLevelMeter } from "./components/MicLevelMeter";
import { RoundScreen } from "./components/RoundScreen";
import { useAudioCapture, type MicLevelStatus } from "./hooks/useAudioCapture";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { AsrDisplay } from "./components/AsrDisplay";
import { SideNextButton, SidePowerButton } from "./components/SideControls";
import { RepeatCuePanel } from "./components/RepeatCuePanel";
import { useWebSocket } from "./hooks/useWebSocket";
import type { GrammarPayload, LessonSummary, UIState, WSMessage } from "./types";

const FALLBACK_LESSONS: LessonSummary[] = [
  {
    id: "present_simple",
    display_name: "一般现在时",
    display_name_en: "Present Simple",
  },
  {
    id: "present_continuous",
    display_name: "现在进行时",
    display_name_en: "Present Continuous",
  },
  {
    id: "past_simple",
    display_name: "一般过去时",
    display_name_en: "Past Simple",
  },
];

function ScreenContent({
  uiState,
  currentQuestion,
  grammar,
  errorMessage,
  listenHint,
  feedbackHint,
  lessonLabel,
  roundNumber,
  totalRounds,
  micLevel,
  micBars,
  micStatus,
  repeatTarget,
}: {
  uiState: UIState;
  currentQuestion: string;
  grammar: GrammarPayload | null;
  errorMessage: string;
  listenHint: string;
  feedbackHint: string;
  lessonLabel: string;
  roundNumber: number;
  totalRounds: number;
  micLevel: number;
  micBars: number[];
  micStatus: MicLevelStatus;
  repeatTarget: string;
}) {
  if (errorMessage) {
    return (
      <>
        <p className="screen-title">Oops</p>
        <p className="screen-sub screen-sub--error">{errorMessage}</p>
        <p className="tap-hint">Tap to try again</p>
      </>
    );
  }

  if (uiState === "HOME") {
    return (
      <>
        <div className="progress-ring" />
        <p className="screen-title">Let's Learn!</p>
        <p className="screen-sub">{lessonLabel || "Tap to start"}</p>
        <p className="tap-hint">或点左侧红色按钮开始</p>
      </>
    );
  }

  if (uiState === "ASKING") {
    return (
      <>
        <p className="round-badge">
          第 {roundNumber}/{totalRounds} 题
        </p>
        <p className="screen-title screen-title--accent">Question</p>
        <p className="screen-sub screen-sub--lesson">{lessonLabel}</p>
        <p className="practice-sentence">{currentQuestion}</p>
        <div className="mic-circle practice">🔊</div>
      </>
    );
  }

  if (uiState === "LISTENING") {
    const micScale = 1 + micLevel / 400;
    const repeating = repeatTarget.length > 0;
    return (
      <>
        <p className="screen-title">{repeating ? "Repeat" : "Your turn"}</p>
        <p className="screen-sub">{repeating ? "Say it aloud" : "Speak now"}</p>
        {repeating ? (
          repeatTarget.length <= 55 ? (
            <p className="repeat-inline">{repeatTarget}</p>
          ) : (
            <p className="repeat-inline repeat-inline--hint">请看右侧完整句子 →</p>
          )
        ) : null}
        <div
          className="mic-circle listening"
          style={{ transform: `scale(${micScale.toFixed(2)})` }}
        >
          🎤
        </div>
        <MicLevelMeter level={micLevel} bars={micBars} status={micStatus} />
        <p className="asr-preview asr-preview--muted">
          {repeating
            ? "照着右侧句子读，说完点圆屏或按空格"
            : "请用英语回答，说完点圆屏结束"}
        </p>
        <p className="tap-hint">{listenHint}</p>
      </>
    );
  }

  if (uiState === "THINKING") {
    return (
      <>
        <p className="screen-title">Thinking...</p>
        <p className="screen-sub">Checking your sentence</p>
        <div className="thinking-dots">
          <span />
          <span />
          <span />
        </div>
      </>
    );
  }

  if (uiState === "FEEDBACK" && grammar) {
    const tip =
      grammar.teaching?.kid_explanation ||
      grammar.teaching?.simple_explanation ||
      "";
    return (
      <>
        <HighlightedFeedback
          asrText={grammar.asr_text || ""}
          correctSentence={
            grammar.correction?.correct_sentence || grammar.asr_text || ""
          }
          highlight={grammar.correction?.highlight}
          tip={tip}
        />
        <p className="tap-hint">{feedbackHint}</p>
      </>
    );
  }

  if (uiState === "PRACTICE" && grammar) {
    const sentence =
      repeatTarget ||
      grammar.correction?.correct_sentence ||
      grammar.asr_text ||
      "";
    const compact = sentence.length <= 55;
    return (
      <>
        <p className="screen-title screen-title--accent">Repeat after me</p>
        {compact ? (
          <p className="practice-sentence practice-sentence--compact">{sentence}</p>
        ) : (
          <p className="repeat-inline repeat-inline--hint">请看右侧完整句子 →</p>
        )}
        <div className="mic-circle practice">🔊</div>
        <p className="tap-hint">听完后自动开始跟读</p>
      </>
    );
  }

  if (uiState === "PRACTICE_SUCCESS") {
    return (
      <>
        <div className="star">⭐</div>
        <p className="screen-title">Great job!</p>
        <p className="screen-sub">You did it!</p>
        {roundNumber < totalRounds ? (
          <p className="screen-sub">下一题马上开始…</p>
        ) : null}
      </>
    );
  }

  if (uiState === "SCENARIO_COMPLETE") {
    return (
      <>
        <div className="star">🎉</div>
        <p className="screen-title">情景完成！</p>
        <p className="screen-sub">{lessonLabel}</p>
        <p className="screen-sub">已完成 {totalRounds} 道题</p>
        <p className="tap-hint">点右侧「下一情景」继续</p>
      </>
    );
  }

  return (
    <>
      <div className="progress-ring" />
      <p className="screen-title">Let's Learn!</p>
      <p className="screen-sub">Tap to start</p>
    </>
  );
}

function repeatSentenceFromGrammar(grammar: GrammarPayload | null): string {
  return (
    grammar?.correction?.correct_sentence?.trim() ||
    grammar?.asr_text?.trim() ||
    ""
  );
}

function isRecoverableSpeechError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("speech") ||
    lower.includes("empty speech") ||
    lower.includes("asr") ||
    lower.includes("recognition") ||
    lower.includes("transcript") ||
    lower.includes("internalerror")
  );
}

function dataUrlByteSize(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  if (idx < 0) return 0;
  return Math.floor((dataUrl.length - idx - 1) * 0.75);
}

const MIN_AUDIO_BYTES = 1500;

export function GrammarApp({ onBack }: { onBack: () => void }) {
  const [uiState, setUiState] = useState<UIState>("HOME");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [grammar, setGrammar] = useState<GrammarPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [listenHint, setListenHint] = useState("说完点圆屏结束");
  const [feedbackHint, setFeedbackHint] = useState("点圆屏继续");
  const [continuing, setContinuing] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [asrPending, setAsrPending] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lessons, setLessons] = useState<LessonSummary[]>(FALLBACK_LESSONS);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [lessonLabel, setLessonLabel] = useState(FALLBACK_LESSONS[0].display_name);
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(5);
  const [repeatTarget, setRepeatTarget] = useState("");

  const sessionIdRef = useRef<string | null>(null);
  const sendRef = useRef<(msg: WSMessage) => boolean>(() => false);
  const startListeningRef = useRef<() => void>(() => {});
  const uiStateRef = useRef<UIState>("HOME");
  const finishRecordingRef = useRef<
    (options?: { resume?: boolean }) => Promise<string | null>
  >(async () => null);
  const resumeRecordingRef = useRef<() => void>(() => {});
  const roundScreenRef = useRef<HTMLDivElement>(null);
  const grammarRef = useRef<GrammarPayload | null>(null);
  const audioEnabledRef = useRef(true);

  const { enqueue, runAfterIdle, stop: stopAudio, unlock: unlockAudio } =
    useAudioPlayer();

  const micActive = uiState === "LISTENING";
  const {
    level: micLevel,
    bars: micBars,
    status: micStatus,
    finishRecording,
    resumeRecording,
  } = useAudioCapture(micActive);
  finishRecordingRef.current = finishRecording;
  resumeRecordingRef.current = resumeRecording;

  const currentLessonId = lessons[lessonIndex]?.id ?? "present_simple";
  const nextLessonIndex = (lessonIndex + 1) % Math.max(lessons.length, 1);
  const nextLessonName = lessons[nextLessonIndex]?.display_name ?? "";

  useEffect(() => {
    fetch("/api/lessons")
      .then((r) => r.json())
      .then((data: { lessons?: LessonSummary[] }) => {
        if (data.lessons?.length) {
          setLessons(data.lessons);
          const idx = data.lessons.findIndex((l) => l.id === currentLessonId);
          if (idx >= 0) {
            setLessonIndex(idx);
            setLessonLabel(data.lessons[idx].display_name);
          } else {
            setLessonLabel(data.lessons[0].display_name);
          }
        }
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  const resetSession = useCallback(() => {
    sessionIdRef.current = null;
    setSessionReady(false);
    setGrammar(null);
    setErrorMessage("");
    setSubmitting(false);
    setRecognizedText("");
    setAsrPending(false);
    setRoundNumber(1);
    setTotalRounds(5);
    setRepeatTarget("");
    setUiState("HOME");
  }, []);

  const startSession = useCallback(
    (lessonId?: string) => {
      void unlockAudio();
      audioEnabledRef.current = true;
      setErrorMessage("");
      sendRef.current({
        type: "control",
        payload: {
          action: "start_session",
          grade: 3,
          lesson_id: lessonId ?? currentLessonId,
        },
      });
    },
    [currentLessonId, unlockAudio],
  );

  const stopSession = useCallback(() => {
    audioEnabledRef.current = false;
    stopAudio();
    void finishRecordingRef.current({ resume: false });
    const sid = sessionIdRef.current;
    if (sid) {
      sendRef.current({
        type: "control",
        session_id: sid,
        payload: { action: "stop_session", session_id: sid },
      });
    } else {
      resetSession();
    }
  }, [resetSession, stopAudio]);

  const switchToNextLesson = useCallback(() => {
    if (lessons.length === 0) return;
    const nextIdx = (lessonIndex + 1) % lessons.length;
    const nextLesson = lessons[nextIdx];
    setLessonIndex(nextIdx);
    setLessonLabel(nextLesson.display_name);
    stopAudio();
    void unlockAudio();

    const sid = sessionIdRef.current;
    if (sid && sessionReady) {
      sendRef.current({
        type: "control",
        session_id: sid,
        payload: {
          action: "switch_lesson",
          session_id: sid,
          lesson_id: nextLesson.id,
        },
      });
    } else {
      resetSession();
      startSession(nextLesson.id);
    }
  }, [lessonIndex, lessons, resetSession, sessionReady, startSession, stopAudio, unlockAudio]);

  const beginListening = useCallback(() => {
    const state = uiStateRef.current;
    if (
      state === "THINKING" ||
      state === "PRACTICE_SUCCESS" ||
      state === "FEEDBACK" ||
      state === "SCENARIO_COMPLETE" ||
      state === "HOME"
    ) {
      return;
    }

    const sid = sessionIdRef.current;
    if (!sid) return;
    setListenHint("说完点圆屏结束");
    setAsrPending(false);
    const ok = sendRef.current({
      type: "control",
      session_id: sid,
      payload: { action: "start_listening", session_id: sid },
    });
    if (!ok) {
      setListenHint("连接中…");
    }
    setUiState("LISTENING");
  }, []);

  const scheduleListen = useCallback(() => {
    runAfterIdle(() => {
      window.setTimeout(() => {
        beginListening();
      }, 500);
    });
  }, [beginListening, runAfterIdle]);

  startListeningRef.current = scheduleListen;

  const submitRecording = useCallback(async () => {
    if (submitting || uiStateRef.current !== "LISTENING") return;
    const sid = sessionIdRef.current;
    if (!sid) return;

    setSubmitting(true);
    setAsrPending(true);
    setListenHint("正在识别…");

    try {
      const audioDataUrl = await finishRecordingRef.current({ resume: false });
      if (!audioDataUrl || dataUrlByteSize(audioDataUrl) < MIN_AUDIO_BYTES) {
        setListenHint("录音太短，请用英语再说一次");
        setAsrPending(false);
        resumeRecordingRef.current();
        return;
      }

      setUiState("THINKING");
      const ok = sendRef.current({
        type: "asr",
        session_id: sid,
        payload: {
          action: "asr_final",
          audio_base64: audioDataUrl,
        },
      });
      if (!ok) {
        setErrorMessage("网络断开，请稍候再试");
        setUiState("LISTENING");
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

  const enqueueTts = useCallback(
    (msg: WSMessage) => {
      if (msg.payload.data_base64) {
        enqueue({
          data: String(msg.payload.data_base64),
          format: String(msg.payload.format ?? "wav"),
        });
      } else if (msg.payload.url) {
        enqueue({
          url: String(msg.payload.url),
          format: String(msg.payload.format ?? "wav"),
        });
      } else if (msg.payload.text) {
        enqueue({ text: String(msg.payload.text), format: "text_fallback" });
      }
    },
    [enqueue],
  );

  const handleWsMessage = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "error") {
        const message = String(msg.payload.message ?? "Something went wrong");
        if (isRecoverableSpeechError(message)) {
          setErrorMessage("");
          setSubmitting(false);
          setAsrPending(false);
          setListenHint("识别失败，请用英语再说一次");
          setUiState("LISTENING");
          return;
        }
        setErrorMessage(message);
        setSessionReady(false);
        sessionIdRef.current = null;
        setUiState("HOME");
        stopAudio();
        return;
      }

      if (msg.type === "control") {
        const action = msg.payload.action as string;

        if (action === "session_started") {
          sessionIdRef.current = String(msg.payload.session_id);
          setSessionReady(true);
          setErrorMessage("");
          if (msg.payload.lesson) {
            const lesson = msg.payload.lesson as LessonSummary;
            setLessonLabel(lesson.display_name);
            const idx = lessons.findIndex((l) => l.id === lesson.id);
            if (idx >= 0) setLessonIndex(idx);
          }
          if (msg.payload.current_question) {
            setCurrentQuestion(String(msg.payload.current_question));
          }
          if (msg.payload.round_number) {
            setRoundNumber(Number(msg.payload.round_number));
          }
          if (msg.payload.total_rounds) {
            setTotalRounds(Number(msg.payload.total_rounds));
          }
        }

        if (action === "session_stopped") {
          resetSession();
          return;
        }

        if (action === "scenario_complete") {
          setRepeatTarget("");
          setUiState("SCENARIO_COMPLETE");
          if (msg.payload.round_number) {
            setRoundNumber(Number(msg.payload.round_number));
          }
          if (msg.payload.total_rounds) {
            setTotalRounds(Number(msg.payload.total_rounds));
          }
          if (msg.payload.lesson) {
            const lesson = msg.payload.lesson as LessonSummary;
            setLessonLabel(lesson.display_name);
          }
          return;
        }

        if (action === "ask_question") {
          if (msg.payload.current_question) {
            setCurrentQuestion(String(msg.payload.current_question));
          }
          if (msg.payload.round_number) {
            setRoundNumber(Number(msg.payload.round_number));
          }
          if (msg.payload.total_rounds) {
            setTotalRounds(Number(msg.payload.total_rounds));
          }
          setUiState("ASKING");
          setGrammar(null);
          setRepeatTarget("");
          setRecognizedText("");
          setAsrPending(false);
        }

        if (action === "asr_transcript" && msg.payload.text) {
          setRecognizedText(String(msg.payload.text).trim());
          setAsrPending(false);
        }

        if (action === "ui_state" && msg.payload.ui_state) {
          const next = msg.payload.ui_state as UIState;
          setUiState(next);
          if (next === "LISTENING") {
            setSubmitting(false);
            setListenHint("说完点圆屏结束");
          }
          if (next === "PRACTICE") {
            setContinuing(false);
            const target = repeatSentenceFromGrammar(grammarRef.current);
            if (target) setRepeatTarget(target);
          }
        }

        if (action === "phase_complete" && msg.payload.next === "listen") {
          startListeningRef.current();
        }

        if (action === "phase_complete" && msg.payload.next === "continue") {
          setContinuing(false);
          setFeedbackHint("看清了吗？点圆屏继续跟读");
        }
      }

      if (msg.type === "gpt") {
        const payload = msg.payload as unknown as GrammarPayload;
        setGrammar(payload);
        setUiState(payload.ui_state);
        if (payload.ui_state === "PRACTICE") {
          const target = repeatSentenceFromGrammar(payload);
          if (target) setRepeatTarget(target);
        }
        if (payload.ui_state === "PRACTICE_SUCCESS") {
          setRepeatTarget("");
        }
        if (payload.asr_text) {
          setRecognizedText(payload.asr_text.trim());
          setAsrPending(false);
        }
        if (payload.ui_state === "FEEDBACK") {
          setContinuing(false);
          setFeedbackHint("点圆屏继续");
        }
      }

      if (msg.type === "tts") {
        if (!audioEnabledRef.current) return;
        enqueueTts(msg);
      }
    },
    [enqueueTts, lessons, resetSession, stopAudio],
  );

  const { connected, send } = useWebSocket(handleWsMessage);
  sendRef.current = send;

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  useEffect(() => {
    grammarRef.current = grammar;
  }, [grammar]);

  useEffect(() => {
    if (uiState !== "LISTENING" || micStatus !== "denied") return;
    setErrorMessage("请允许浏览器使用麦克风");
    setSessionReady(false);
    setUiState("HOME");
  }, [uiState, micStatus]);

  const handleTap = useCallback(() => {
    void unlockAudio();

    if (!connected) {
      setErrorMessage("正在连接服务器…");
      return;
    }

    if (uiStateRef.current === "LISTENING") {
      void submitRecording();
      return;
    }

    if (uiStateRef.current === "FEEDBACK") {
      const sid = sessionIdRef.current;
      if (!sid || continuing) return;
      setContinuing(true);
      setFeedbackHint("准备跟读…");
      send({
        type: "control",
        session_id: sid,
        payload: { action: "continue_after_feedback", session_id: sid },
      });
      return;
    }

    if (errorMessage) {
      setErrorMessage("");
      stopAudio();
      resetSession();
      startSession();
      return;
    }

    if (!sessionReady) {
      startSession();
    }
  }, [
    connected,
    continuing,
    errorMessage,
    resetSession,
    send,
    sessionReady,
    startSession,
    stopAudio,
    submitRecording,
    unlockAudio,
  ]);

  const handleTapRef = useRef(handleTap);
  handleTapRef.current = handleTap;

  const interactive =
    connected &&
    !submitting &&
    !continuing &&
    (!sessionReady ||
      !!errorMessage ||
      uiState === "LISTENING" ||
      uiState === "FEEDBACK");

  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  const focusRoundScreen = useCallback(() => {
    window.requestAnimationFrame(() => {
      roundScreenRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!interactive) return;
    focusRoundScreen();
  }, [interactive, uiState, focusRoundScreen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (target?.closest("button")) return;
      if (!interactiveRef.current) return;
      e.preventDefault();
      handleTapRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const running = sessionReady && uiState !== "HOME";

  const handleToggleSession = () => {
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

  const showRepeatCue =
    repeatTarget.length > 0 &&
    (uiState === "PRACTICE" ||
      uiState === "LISTENING" ||
      uiState === "THINKING");
  const repeatCuePhase: "practice" | "listening" | "thinking" =
    uiState === "PRACTICE"
      ? "practice"
      : uiState === "THINKING"
        ? "thinking"
        : "listening";

  return (
    <div className="app-shell">
      <div className="app-layout">
        <SidePowerButton
          running={running}
          disabled={!connected}
          onToggle={handleToggleSession}
        />
        <div className="app-stage">
          <RoundScreen ref={roundScreenRef} onTap={handleTap} interactive={interactive}>
            <ScreenContent
              uiState={uiState}
              currentQuestion={currentQuestion}
              grammar={grammar}
              errorMessage={errorMessage}
              listenHint={listenHint}
              feedbackHint={feedbackHint}
              lessonLabel={lessonLabel}
              roundNumber={roundNumber}
              totalRounds={totalRounds}
              micLevel={micLevel ?? 0}
              micBars={micBars ?? []}
              micStatus={micStatus ?? "idle"}
              repeatTarget={repeatTarget}
            />
          </RoundScreen>
          {showRepeatCue ? (
            <RepeatCuePanel sentence={repeatTarget} phase={repeatCuePhase} />
          ) : null}
        </div>
        <SideNextButton
          disabled={!connected}
          nextLessonName={nextLessonName}
          onNextLesson={switchToNextLesson}
        />
      </div>
      <div className="app-footer-row">
        <button type="button" className="back-link" onClick={() => {
          if (running) stopSession();
          onBack();
        }}>
          ← 返回主界面
        </button>
        <AsrDisplay text={recognizedText} pending={asrPending} />
      </div>
    </div>
  );
}
