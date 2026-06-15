import { useEffect, useMemo, useState } from "react";
import { DeviceModeBadge } from "./components/DeviceModeBadge";
import { GrammarApp } from "./GrammarApp";
import { NewsApp } from "./NewsApp";
import { NewsHistoryApp } from "./NewsHistoryApp";
import { ThemeHome } from "./ThemeHome";
import type { AppTheme } from "./types";
import { isDeviceMode } from "./utils/deviceMode";

export default function App() {
  const deviceMode = useMemo(() => isDeviceMode(), []);
  const [theme, setTheme] = useState<AppTheme>("home");

  useEffect(() => {
    if (deviceMode && theme === "newsHistory") {
      setTheme("home");
    }
  }, [deviceMode, theme]);

  if (theme === "grammar") {
    return (
      <>
        <DeviceModeBadge deviceMode={deviceMode} />
        <GrammarApp deviceMode={deviceMode} onBack={() => setTheme("home")} />
      </>
    );
  }

  if (theme === "news") {
    return (
      <>
        <DeviceModeBadge deviceMode={deviceMode} />
        <NewsApp deviceMode={deviceMode} onBack={() => setTheme("home")} />
      </>
    );
  }

  if (theme === "newsHistory") {
    return <NewsHistoryApp onBack={() => setTheme("home")} />;
  }

  return (
    <>
      <DeviceModeBadge deviceMode={deviceMode} />
      <ThemeHome
        deviceMode={deviceMode}
        onSelectGrammar={() => setTheme("grammar")}
        onSelectNews={() => setTheme("news")}
        onSelectNewsHistory={() => setTheme("newsHistory")}
      />
    </>
  );
}
