/** Resolve DashScope OSS URLs through our backend proxy (avoids browser CORS). */
export function resolveTtsAudioUrl(raw: string): string {
  if (!raw || raw.startsWith("/api/tts/proxy")) {
    return raw;
  }
  try {
    const host = new URL(raw).hostname;
    if (host.includes("dashscope-result")) {
      return `/api/tts/proxy?url=${encodeURIComponent(raw)}`;
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
