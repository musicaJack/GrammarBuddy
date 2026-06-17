import { useCallback, useEffect, useState } from "react";
import { WrapUpPanel } from "./components/WrapUpPanel";
import type { NewsHistoryDetail, NewsHistorySummary, WrapUpPayload } from "./types";
import { withBase } from "./utils/basePath";

function formatWhen(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function NewsHistoryApp({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<NewsHistorySummary[]>([]);
  const [selected, setSelected] = useState<NewsHistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(withBase("/api/news/history"));
      if (!resp.ok) throw new Error("Could not load history");
      const data = (await resp.json()) as { sessions: NewsHistorySummary[] };
      setSessions(data.sessions ?? []);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(withBase(`/api/news/history/${encodeURIComponent(id)}`));
      if (!resp.ok) throw new Error("Could not load practice detail");
      const data = (await resp.json()) as NewsHistoryDetail;
      setSelected(data);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBack = () => {
    if (selected) {
      setSelected(null);
      return;
    }
    onBack();
  };

  const wrapUp = selected?.wrap_up as WrapUpPayload | undefined;

  return (
    <div className="app-shell app-shell--news app-shell--history">
      <div className="history-layout">
        <header className="history-header">
          <button type="button" className="side-btn side-btn--next" onClick={handleBack}>
            <span className="side-btn__icon">←</span>
            <span className="side-btn__label">{selected ? "列表" : "返回"}</span>
          </button>
          <div className="history-header__text">
            <h1 className="history-header__title">练习历史</h1>
            <p className="history-header__sub">News Chat · 每次总结自动保存</p>
          </div>
        </header>

        {error ? <p className="history-error">{error}</p> : null}

        {loading && !selected ? (
          <p className="history-empty">加载中…</p>
        ) : null}

        {!selected && !loading ? (
          <div className="history-list">
            {sessions.length === 0 ? (
              <p className="history-empty">还没有练习记录。完成一次听新闻对话后会出现在这里。</p>
            ) : (
              sessions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="history-card"
                  onClick={() => void openDetail(item.id)}
                >
                  <p className="history-card__title">{item.article_title}</p>
                  {item.topic_summary ? (
                    <p className="history-card__summary">{item.topic_summary}</p>
                  ) : null}
                  <p className="history-card__meta">
                    {formatWhen(item.saved_at)} · Turn {item.turn_count}/{item.min_turns}
                    {item.article_source ? ` · ${item.article_source}` : ""}
                  </p>
                </button>
              ))
            )}
          </div>
        ) : null}

        {selected && wrapUp ? (
          <div className="history-detail">
            <WrapUpPanel
              wrapUp={wrapUp}
              header={{
                title: selected.article?.title,
                subtitle: selected.article?.source,
                meta: `${formatWhen(selected.saved_at)} · Turn ${selected.turn_count}/${selected.min_turns}`,
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
