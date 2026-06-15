import { useEffect } from "react";

type Props = {
  deviceMode?: boolean;
  onSelectGrammar: () => void;
  onSelectNews: () => void;
  onSelectNewsHistory: () => void;
};

export function ThemeHome({
  deviceMode = false,
  onSelectGrammar,
  onSelectNews,
  onSelectNewsHistory,
}: Props) {
  useEffect(() => {
    if (!deviceMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        onSelectGrammar();
      }
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        onSelectNews();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deviceMode, onSelectGrammar, onSelectNews]);

  return (
    <div className={`theme-home${deviceMode ? " theme-home--device" : ""}`}>
      <h1 className="theme-home__title">GrammarBuddy</h1>
      <p className="theme-home__subtitle">Choose a learning theme</p>
      <div className="theme-home__cards">
        <button type="button" className="theme-card" onClick={onSelectGrammar}>
          <span className="theme-card__icon">📚</span>
          <span className="theme-card__name">语法时态</span>
          <span className="theme-card__desc">Grammar tenses · 3 topics</span>
          {deviceMode ? <span className="theme-card__key">BtnA</span> : null}
        </button>
        <button type="button" className="theme-card theme-card--news" onClick={onSelectNews}>
          <span className="theme-card__icon">📰</span>
          <span className="theme-card__name">听新闻对话</span>
          <span className="theme-card__desc">News · 3-turn chat</span>
          {deviceMode ? <span className="theme-card__key">BtnB</span> : null}
        </button>
      </div>
      {!deviceMode ? (
        <button type="button" className="theme-history-link" onClick={onSelectNewsHistory}>
          📋 查看练习历史
        </button>
      ) : (
        <p className="theme-home__device-hint">A 语法 · B 新闻 · 历史请用桌面浏览器查看</p>
      )}
    </div>
  );
}
