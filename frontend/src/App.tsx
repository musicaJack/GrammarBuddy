import { useState } from "react";
import { GrammarApp } from "./GrammarApp";
import { NewsApp } from "./NewsApp";
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

  return (
    <ThemeHome
      onSelectGrammar={() => setTheme("grammar")}
      onSelectNews={() => setTheme("news")}
    />
  );
}
