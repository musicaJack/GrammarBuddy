/** App mount path without trailing slash, e.g. "" or "/GrammarBuddy". */
export function appBasePath(): string {
  const base = import.meta.env.BASE_URL || "/";
  if (base === "/") return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/** Prefix an absolute path with the Vite base (production: /GrammarBuddy). */
export function withBase(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = appBasePath();
  if (!base) return normalized;
  return `${base}${normalized}`;
}

export function wsSessionUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${withBase("/ws/session")}`;
}
