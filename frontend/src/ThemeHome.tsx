type Props = {
  onSelectGrammar: () => void;
  onSelectNews: () => void;
};

export function ThemeHome({ onSelectGrammar, onSelectNews }: Props) {
  return (
    <div className="theme-home">
      <h1 className="theme-home__title">GrammarBuddy</h1>
      <p className="theme-home__subtitle">Choose a learning theme</p>
      <div className="theme-home__cards">
        <button type="button" className="theme-card" onClick={onSelectGrammar}>
          <span className="theme-card__icon">📚</span>
          <span className="theme-card__name">语法时态</span>
          <span className="theme-card__desc">Grammar tenses · 3 topics</span>
        </button>
        <button type="button" className="theme-card theme-card--news" onClick={onSelectNews}>
          <span className="theme-card__icon">📰</span>
          <span className="theme-card__name">听新闻对话</span>
          <span className="theme-card__desc">News · 3-turn chat</span>
        </button>
      </div>
    </div>
  );
}
