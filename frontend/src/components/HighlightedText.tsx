type Props = {
  text: string;
  activeWordIndex: number | null;
  className?: string;
};

function tokenize(text: string): { type: "word" | "space"; value: string }[] {
  const parts = text.match(/\S+|\s+/g) ?? [];
  return parts.map((value) => ({
    type: /^\s+$/.test(value) ? "space" : "word",
    value,
  }));
}

export function HighlightedText({ text, activeWordIndex, className = "" }: Props) {
  const tokens = tokenize(text);
  let wordIdx = 0;

  return (
    <p className={`highlighted-text ${className}`.trim()}>
      {tokens.map((token, i) => {
        if (token.type === "space") {
          return token.value;
        }
        const idx = wordIdx++;
        let cls = "highlighted-text__word";
        if (activeWordIndex !== null) {
          if (idx === activeWordIndex) cls += " highlighted-text__word--active";
          else if (idx < activeWordIndex) cls += " highlighted-text__word--done";
        }
        return (
          <span key={i} className={cls}>
            {token.value}
          </span>
        );
      })}
    </p>
  );
}

export function countWords(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}
