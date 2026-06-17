/** Resolve DashScope OSS URLs through our backend proxy (avoids browser CORS). */
import { withBase } from "./basePath";

export function resolveTtsAudioUrl(raw: string): string {
  const proxyPrefix = withBase("/api/tts/proxy");
  if (!raw || raw.startsWith(proxyPrefix) || raw.startsWith("/api/tts/proxy")) {
    return raw.startsWith("/api/tts/proxy") ? withBase(raw) : raw;
  }
  try {
    const host = new URL(raw).hostname;
    if (host.includes("dashscope-result")) {
      return `${proxyPrefix}?url=${encodeURIComponent(raw)}`;
    }
  } catch {
    /* not a URL */
  }
  return raw;
}

export function isLastTtsSegment(payload: Record<string, unknown>): boolean {
  if (payload.is_last_segment === true) return true;
  if (payload.is_last_segment === false) return false;
  const index = payload.segment_index;
  const total = payload.segment_total;
  if (typeof index === "number" && typeof total === "number") {
    return index >= total - 1;
  }
  return true;
}
