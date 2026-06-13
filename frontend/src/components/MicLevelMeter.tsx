import type { MicLevelStatus } from "../hooks/useAudioCapture";

const SIGNAL_THRESHOLD = 10;

function peakOf(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

type Props = {
  level?: number;
  bars?: number[];
  status?: MicLevelStatus;
};

export function MicLevelMeter({
  level = 0,
  bars = [],
  status = "idle",
}: Props) {
  const safeBars = bars ?? [];
  const peak = Math.max(level, peakOf(safeBars));

  if (status === "denied") {
    return (
      <p className="mic-status mic-status--error">无法访问麦克风，请检查浏览器权限</p>
    );
  }

  const label =
    peak >= SIGNAL_THRESHOLD
      ? "麦克风正常 · 正在收音…"
      : status === "silent"
        ? "音量较低，请靠近麦克风说话"
        : "请对着麦克风说话";

  return (
    <div className="mic-level-wrap">
      <div className="mic-level-bars" aria-hidden>
        {safeBars.map((h, i) => (
          <div
            key={i}
            className="mic-level-bar"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mic-level-track">
        <div
          className="mic-level-fill"
          style={{ width: `${Math.max(4, peak)}%` }}
        />
      </div>
      <p className="mic-status">{label}</p>
    </div>
  );
}
