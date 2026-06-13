type Props = {
  sentence: string;
  phase: "practice" | "listening" | "thinking";
};

const PHASE_HINT: Record<Props["phase"], string> = {
  practice: "听示范，准备跟读",
  listening: "请照着读，说完按空格",
  thinking: "正在检查跟读…",
};

export function RepeatCuePanel({ sentence, phase }: Props) {
  return (
    <aside className="repeat-cue" aria-label="跟读句子">
      <p className="repeat-cue__label">Repeat after me</p>
      <p className="repeat-cue__sentence">{sentence}</p>
      <p className="repeat-cue__hint">{PHASE_HINT[phase]}</p>
    </aside>
  );
}
