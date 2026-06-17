import { forwardRef, type ReactNode } from "react";

interface Props {
  size?: number;
  responsive?: boolean;
  shape?: "round" | "panel";
  compact?: boolean;
  children: ReactNode;
  onTap?: () => void;
  interactive?: boolean;
}

export const RoundScreen = forwardRef<HTMLDivElement, Props>(function RoundScreen(
  {
    size = 360,
    responsive = false,
    shape = "round",
    compact = false,
    children,
    onTap,
    interactive = false,
  },
  ref,
) {
  const shellStyle =
    responsive || size === undefined
      ? undefined
      : { width: size, height: size };

  const shellClass = [
    "round-shell",
    responsive && shape === "panel" ? "round-shell--panel" : "",
    responsive && shape === "panel" && compact ? "round-shell--panel-compact" : "",
    responsive && shape === "round" ? "round-shell--responsive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass} style={shellStyle}>
      <div
        ref={ref}
        className={`round-screen${interactive ? " round-screen--tap" : ""}`}
        onPointerUp={
          interactive
            ? (e) => {
                e.preventDefault();
                onTap?.();
              }
            : undefined
        }
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onTap?.();
                }
              }
            : undefined
        }
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : -1}
      >
        {children}
      </div>
    </div>
  );
});
