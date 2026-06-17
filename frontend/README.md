# GrammarBuddy Frontend

React + Vite web client: round-screen grammar simulator for PC and mobile browsers. Connects to the Python backend over WebSocket for live grammar practice, TTS playback, and browser-based ASR.

## Prerequisites

Start the backend on port 8000 (see [backend/README.md](../backend/README.md)). For frontend-only testing, the backend can listen on `127.0.0.1`; API and WebSocket traffic is proxied through Vite.

## Install

```powershell
cd frontend
npm install
```

## Run (development)

```powershell
npm run dev
```

Open locally:

```text
https://localhost:5173
```

On first visit, accept the self-signed certificate warning in your browser.

## Mobile / tablet (same Wi‑Fi)

After `npm run dev`, use the **Network** URL from the terminal (HTTPS required for microphone access):

```text
https://192.168.x.x:5173
```

Round-screen device preview (matches StopWatch layout):

```text
https://192.168.x.x:5173/?device=1
```

### HTTPS and microphone

- Dev server uses `@vitejs/plugin-basic-ssl` (self-signed certificate).
- Mobile browsers block `getUserMedia` on plain `http://` LAN URLs; HTTPS is required for ASR.
- On the phone, tap through the untrusted-certificate prompt once, then allow microphone when prompted.
- Allow inbound TCP **5173** in Windows Firewall (same idea as backend port 8000).

### Troubleshooting HTTPS on mobile

| Symptom | Cause | Fix |
|--------|--------|-----|
| `http://` works; round screen says use HTTPS | Expected — mic needs a secure context | Use the **https://** URL from the terminal |
| `https://…:5173` — “site can’t provide a secure connection” | Port 5173 is still serving an **old HTTP-only** `npm run dev` | Stop all Node/Vite processes, run `npm run dev` again; use only the **https://** URL Vite prints |
| Certificate warning | Self-signed dev cert | Tap **Advanced → Continue** (wording varies by browser) |
| Port already in use | Another dev server on 5173 | End the old process, then `npm run dev` (`strictPort` is enabled — Vite will not silently switch ports) |

On Windows, find what holds 5173:

```powershell
netstat -ano | findstr :5173
taskkill /PID <pid> /F
```

Then restart:

```powershell
npm run dev
```

The terminal must show `https://` (not `http://`) for both Local and Network lines.

### Proxy

`vite.config.ts` proxies `/api`, `/health`, and `/ws` to `http://127.0.0.1:8000`. The phone only needs reachability to the PC on port **5173**; the backend does not need to be exposed to the LAN for web-only testing.

## Other scripts

```powershell
npm run build    # production build → dist/
npm run preview  # serve dist/ over HTTPS on the LAN
```

## Device mode

Append `?device=1` (or `?device=true`) to hide desktop chrome and use the round-screen UI. Keyboard shortcuts in device mode: **Space** / BtnA — primary action; **B** — next lesson; **P** — start/stop session.

## Stack

- React 18 + TypeScript
- Vite 5 with `@vitejs/plugin-basic-ssl`
- WebSocket session protocol (shared with StopWatch firmware)
- Browser `MediaRecorder` + backend ASR over WebSocket
