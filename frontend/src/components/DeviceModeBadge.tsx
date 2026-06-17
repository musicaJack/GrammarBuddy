import { useEffect, useState } from "react";
import { PROTOCOL_VERSION, WEB_CLIENT_VERSION } from "../utils/clientInfo";
import { withBase } from "../utils/basePath";

type VersionInfo = {
  protocol_version: string;
  backend_version: string;
};

export function DeviceModeBadge({
  deviceMode,
  compact = false,
}: {
  deviceMode: boolean;
  compact?: boolean;
}) {
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceMode) return;
    fetch(withBase("/api/version"))
      .then((r) => r.json())
      .then((data: VersionInfo) => {
        setBackendVersion(data.backend_version ?? null);
      })
      .catch(() => {
        setBackendVersion(null);
      });
  }, [deviceMode]);

  if (!deviceMode) return null;

  const meta = `web ${WEB_CLIENT_VERSION} · proto ${PROTOCOL_VERSION}${
    backendVersion ? ` · api ${backendVersion}` : ""
  }`;

  return (
    <div
      className={`device-badge${compact ? " device-badge--compact" : ""}`}
      aria-label="Device preview mode"
      title={compact ? meta : undefined}
    >
      <span>{compact ? "Preview" : "Device"}</span>
      {!compact ? <span className="device-badge__meta">{meta}</span> : null}
    </div>
  );
}
