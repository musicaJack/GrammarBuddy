import type { ReactNode } from "react";
import type { Highlight } from "../types";

function highlightWords(sentence: string, words: string[], className: string): ReactNode {
  if (!words.length) return sentence;
  const parts: ReactNode[] = [];
  let remaining = sentence;
  const sorted = [...words].sort((a, b) => b.length - a.length);

  while (remaining.length > 0) {
    let matched = false;
    for (const word of sorted) {
      const idx = remaining.toLowerCase().indexOf(word.toLowerCase());
      if (idx >= 0) {
        if (idx > 0) parts.push(remaining.slice(0, idx));
        parts.push(
          <span key={`${word}-${parts.length}`} className={className}>
            {remaining.slice(idx, idx + word.length)}
          </span>,
        );
        remaining = remaining.slice(idx + word.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      parts.push(remaining);
      break;
    }
  }
  return parts;
}

interface Props {
  asrText: string;
  correctSentence: string;
  highlight?: Highlight;
  tip?: string;
}

export function HighlightedFeedback({
  asrText,
  correctSentence,
  highlight,
  tip,
}: Props) {
  return (
    <div className="feedback-block">
      <div className="feedback-row wrong-row">
        <span className="icon">✕</span>
        <p>
          {highlightWords(asrText, highlight?.wrong ?? [], "hl-wrong")}
        </p>
      </div>
      <div className="feedback-row correct-row">
        <span className="icon">✓</span>
        <p>
          {highlightWords(
            correctSentence,
            highlight?.correct ?? [],
            "hl-correct",
          )}
        </p>
      </div>
      {tip && (
        <div className="tip-row">
          <span className="icon">💡</span>
          <p>{tip}</p>
        </div>
      )}
    </div>
  );
}
