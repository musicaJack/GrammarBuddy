import { useEffect, useState } from "react";
import { PROTOCOL_VERSION, WEB_CLIENT_VERSION } from "../utils/clientInfo";

type VersionInfo = {
  protocol_version: string;
  backend_version: string;
};

export function DeviceModeBadge({ deviceMode }: { deviceMode: boolean }) {
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceMode) return;
    fetch("/api/version")
      .then((r) => r.json())
      .then((data: VersionInfo) => {
        setBackendVersion(data.backend_version ?? null);
      })
      .catch(() => {
        setBackendVersion(null);
      });
  }, [deviceMode]);

  if (!deviceMode) return null;

  return (
    <div className="device-badge" aria-label="Device preview mode">
      <span>Device</span>
      <span className="device-badge__meta">
        web {WEB_CLIENT_VERSION} · proto {PROTOCOL_VERSION}
        {backendVersion ? ` · api ${backendVersion}` : ""}
      </span>
    </div>
  );
}
