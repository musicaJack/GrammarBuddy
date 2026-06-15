export function isDeviceMode(): boolean {
  if (typeof window === "undefined") return false;
  const value = new URLSearchParams(window.location.search).get("device");
  return value === "1" || value === "true";
}
