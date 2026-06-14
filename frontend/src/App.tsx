import { useState } from "react";
import { GrammarApp } from "./GrammarApp";
import { NewsApp } from "./NewsApp";
import { NewsHistoryApp } from "./NewsHistoryApp";
import { ThemeHome } from "./ThemeHome";
import type { AppTheme } from "./types";

export default function App() {
  const [theme, setTheme] = useState<AppTheme>("home");

  if (theme === "grammar") {
    return <GrammarApp onBack={() => setTheme("home")} />;
  }

  if (theme === "news") {
    return <NewsApp onBack={() => setTheme("home")} />;
  }

  if (theme === "newsHistory") {
    return <NewsHistoryApp onBack={() => setTheme("home")} />;
  }

  return (
    <ThemeHome
      onSelectGrammar={() => setTheme("grammar")}
      onSelectNews={() => setTheme("news")}
      onSelectNewsHistory={() => setTheme("newsHistory")}
    />
  );
}
