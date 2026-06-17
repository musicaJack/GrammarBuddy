import { useEffect, useRef } from "react";

export type ChatEntry = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type Props = {
  entries: ChatEntry[];
  pendingUser?: boolean;
  pendingUserText?: string;
  speakingEntryId?: string | null;
};

export function RoundChatLog({
  entries,
  pendingUser = false,
  pendingUserText = "",
  speakingEntryId = null,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, pendingUser, pendingUserText]);

  return (
    <div
      className="round-chat-log"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="round-chat-log__scroll">
        {entries.length === 0 ? (
          <p className="round-chat-log__empty">对话将显示在这里</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={`round-chat-bubble round-chat-bubble--${entry.role}${
                speakingEntryId === entry.id ? " round-chat-bubble--speaking" : ""
              }`}
            >
              <span className="round-chat-bubble__label">
                {entry.role === "assistant" ? "AI" : "You"}
              </span>
              <p className="round-chat-bubble__text">{entry.text}</p>
            </div>
          ))
        )}
        {pendingUser ? (
          <div className="round-chat-bubble round-chat-bubble--user round-chat-bubble--pending">
            <span className="round-chat-bubble__label">You</span>
            <p className="round-chat-bubble__text">
              {pendingUserText.trim() || "…"}
            </p>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
