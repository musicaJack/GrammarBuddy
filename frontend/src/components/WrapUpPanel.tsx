import type { WrapUpPayload } from "../types";

type Props = {
  wrapUp: WrapUpPayload;
  header?: {
    title?: string;
    subtitle?: string;
    meta?: string;
  };
};

export function WrapUpPanel({ wrapUp, header }: Props) {
  return (
    <div className="wrap-up-panel">
      {header ? (
        <header className="wrap-up-panel__header">
          {header.title ? (
            <h2 className="wrap-up-panel__title">{header.title}</h2>
          ) : null}
          {header.subtitle ? (
            <p className="wrap-up-panel__subtitle">{header.subtitle}</p>
          ) : null}
          {header.meta ? (
            <p className="wrap-up-panel__meta">{header.meta}</p>
          ) : null}
        </header>
      ) : null}

      {wrapUp.topic_summary ? (
        <section className="wrap-up-panel__section">
          <h3>Topic</h3>
          <p>{wrapUp.topic_summary}</p>
        </section>
      ) : null}

      {wrapUp.logic_flow?.length ? (
        <section className="wrap-up-panel__section">
          <h3>Story flow</h3>
          <ol className="wrap-up-panel__flow">
            {wrapUp.logic_flow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {wrapUp.grammar_points?.length ? (
        <section className="wrap-up-panel__section">
          <h3>Grammar</h3>
          <ul>
            {wrapUp.grammar_points.map((g) => (
              <li key={`${g.issue}-${g.example}`}>
                <strong>{g.issue}</strong>: {g.example} → {g.fix}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {wrapUp.vocabulary?.length ? (
        <section className="wrap-up-panel__section">
          <h3>Words</h3>
          <p>{wrapUp.vocabulary.join(", ")}</p>
        </section>
      ) : null}

      {wrapUp.overall_feedback ? (
        <section className="wrap-up-panel__section">
          <h3>Feedback</h3>
          <p>{wrapUp.overall_feedback}</p>
        </section>
      ) : null}
    </div>
  );
}
