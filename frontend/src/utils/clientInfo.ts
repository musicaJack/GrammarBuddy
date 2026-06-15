/** Align with shared/version/compatibility.json */
export const PROTOCOL_VERSION = "1.0.0";
export const WEB_CLIENT_VERSION = "0.3.1";

export function buildClientPayload() {
  return {
    client_type: "web_simulator" as const,
    client_version: WEB_CLIENT_VERSION,
    protocol_version: PROTOCOL_VERSION,
  };
}
