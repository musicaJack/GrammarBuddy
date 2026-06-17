import { useCallback, useRef, useState } from "react";
import type { ChatEntry } from "../components/RoundChatLog";

export function useChatLog() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const idRef = useRef(0);

  const nextId = () => {
    idRef.current += 1;
    return `chat-${idRef.current}`;
  };

  const append = useCallback((role: ChatEntry["role"], text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setEntries((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === role && last.text === trimmed) {
        return prev;
      }
      return [...prev, { id: nextId(), role, text: trimmed }];
    });
  }, []);

  const appendAssistant = useCallback((text: string) => append("assistant", text), [append]);
  const appendUser = useCallback((text: string) => append("user", text), [append]);

  const reset = useCallback(() => {
    setEntries([]);
    idRef.current = 0;
  }, []);

  return { entries, appendAssistant, appendUser, reset };
}
