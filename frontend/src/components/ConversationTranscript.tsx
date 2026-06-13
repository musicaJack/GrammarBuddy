import { useEffect, useRef } from "react";
import { HighlightedText } from "./HighlightedText";
import type { TranscriptEntry } from "../types";

type Props = {
  entries: TranscriptEntry[];
  speakingId: string | null;
  speakingWordIndex: number | null;
  turnCount: number;
  minTurns: number;
  phaseLabel: string;
  pendingUser: boolean;
};

export function ConversationTranscript({
  entries,
  speakingId,
  speakingWordIndex,
  turnCount,
  minTurns,
  phaseLabel,
  pendingUser,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, pendingUser, speakingId]);

  return (
    <aside className="conversation-transcript" aria-label="Conversation transcript">
      <header className="conversation-transcript__header">
        <p className="conversation-transcript__title">News Chat</p>
        <p className="conversation-transcript__meta">
          {phaseLabel} · Turn {turnCount}/{minTurns}
        </p>
      </header>
      <div className="conversation-transcript__scroll">
        {entries.length === 0 ? (
          <p className="conversation-transcript__empty">
            English transcript will appear here as you listen and speak.
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={`transcript-bubble transcript-bubble--${entry.role}`}
            >
              <span className="transcript-bubble__label">
                {entry.role === "assistant" ? "🤖 AI" : "🎤 You"}
              </span>
              {entry.role === "assistant" && speakingId === entry.id ? (
                <HighlightedText
                  text={entry.text}
                  activeWordIndex={speakingWordIndex}
                  className="transcript-bubble__text"
                />
              ) : (
                <p className="transcript-bubble__text">{entry.text}</p>
              )}
            </div>
          ))
        )}
        {pendingUser ? (
          <div className="transcript-bubble transcript-bubble--user transcript-bubble--pending">
            <span className="transcript-bubble__label">🎤 You</span>
            <p className="transcript-bubble__text">…</p>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
    </aside>
  );
}
