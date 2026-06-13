type PowerProps = {
  running: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export function SidePowerButton({
  running,
  disabled = false,
  onToggle,
}: PowerProps) {
  return (
    <button
      type="button"
      className={`side-btn side-btn--power${running ? " side-btn--power-on" : ""}`}
      disabled={disabled}
      onClick={onToggle}
      aria-label={running ? "停止" : "开始"}
    >
      <span className="side-btn__icon">{running ? "■" : "●"}</span>
      <span className="side-btn__label">{running ? "停止" : "开始"}</span>
    </button>
  );
}

type NextProps = {
  disabled?: boolean;
  nextLessonName?: string;
  onNextLesson: () => void;
};

export function SideNextButton({
  disabled = false,
  nextLessonName,
  onNextLesson,
}: NextProps) {
  return (
    <button
      type="button"
      className="side-btn side-btn--next"
      disabled={disabled}
      onClick={onNextLesson}
      aria-label="下一个情景"
    >
      <span className="side-btn__icon">▶</span>
      <span className="side-btn__label">下一情景</span>
      {nextLessonName ? (
        <span className="side-btn__hint">{nextLessonName}</span>
      ) : null}
    </button>
  );
}
