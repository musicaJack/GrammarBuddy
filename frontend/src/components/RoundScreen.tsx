import { forwardRef, type ReactNode } from "react";

interface Props {
  size?: number;
  children: ReactNode;
  onTap?: () => void;
  interactive?: boolean;
}

export const RoundScreen = forwardRef<HTMLDivElement, Props>(function RoundScreen(
  { size = 360, children, onTap, interactive = false },
  ref,
) {
  return (
    <div className="round-shell" style={{ width: size, height: size }}>
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
