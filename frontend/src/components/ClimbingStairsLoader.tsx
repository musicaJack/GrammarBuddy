type Props = {
  label?: string;
};

export function ClimbingStairsLoader({ label = "Preparing voice…" }: Props) {
  return (
    <div className="climb-loader" aria-hidden="true">
      <div className="climb-loader__scene">
        <div className="climb-loader__stairs">
          <span className="climb-loader__step climb-loader__step--1" />
          <span className="climb-loader__step climb-loader__step--2" />
          <span className="climb-loader__step climb-loader__step--3" />
          <span className="climb-loader__step climb-loader__step--4" />
        </div>
        <span className="climb-loader__climber">🧒</span>
      </div>
      <p className="climb-loader__label">{label}</p>
    </div>
  );
}
