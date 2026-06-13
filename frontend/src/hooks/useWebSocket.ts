import { useCallback, useEffect, useRef, useState } from "react";
import type { WSMessage } from "../types";

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/session`;
}

export function useWebSocket(onMessage: (msg: WSMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<WSMessage[]>([]);
  const reconnectTimerRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const flushQueue = useCallback((ws: WebSocket) => {
    while (queueRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
      const msg = queueRef.current.shift()!;
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      flushQueue(ws);
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (reconnectTimerRef.current === null) {
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, 800);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WSMessage;
        onMessageRef.current(msg);
      } catch {
        console.error("Invalid WS message", ev.data);
      }
    };
  }, [flushQueue]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((msg: WSMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    queueRef.current.push(msg);
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      connect();
    }
    return false;
  }, [connect]);

  return { connected, send };
}
