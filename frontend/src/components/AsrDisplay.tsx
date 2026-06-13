type Props = {
  text: string;
  pending?: boolean;
};

export function AsrDisplay({ text, pending = false }: Props) {
  const showText = text.trim().length > 0;

  return (
    <section className="asr-display" aria-label="语音识别结果">
      <p className="asr-display__label">你说的话（ASR）</p>
      <div className="asr-display__box">
        {pending && !showText ? (
          <p className="asr-display__placeholder asr-display__placeholder--active">
            正在识别…
          </p>
        ) : showText ? (
          <p className="asr-display__text">{text}</p>
        ) : (
          <p className="asr-display__placeholder">
            说完并点圆屏后，识别的英文会显示在这里
          </p>
        )}
      </div>
    </section>
  );
}
