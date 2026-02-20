/**
 * Low-level WebSocket hook.
 *
 * Manages a single WebSocket connection to a URL. When the URL changes (or
 * goes null) the existing socket is closed and a new one is opened.
 *
 * Returns:
 *  - `isConnected`  — true when the socket is in the OPEN state
 *  - `lastMessage`  — the most recently received parsed message (any type)
 *  - `send(msg)`    — serialises and sends a message; no-op if not connected
 *  - `error`        — last error string, or null
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import type { InboundMessage, OutboundMessage } from '../types/protocol';

interface WebSocketState {
  isConnected: boolean;
  lastMessage: InboundMessage | null;
  error: string | null;
}

interface UseWebSocketReturn extends WebSocketState {
  send: (msg: OutboundMessage) => boolean;
}

export function useWebSocket(url: string | null): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    lastMessage: null,
    error: null,
  });

  const send = useCallback((msg: OutboundMessage): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!url) {
      wsRef.current?.close();
      wsRef.current = null;
      setState({ isConnected: false, lastMessage: null, error: null });
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, isConnected: true, error: null }));
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, isConnected: false }));
    };

    ws.onerror = () => {
      setState((s) => ({ ...s, error: 'WebSocket connection error', isConnected: false }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as InboundMessage;
        setState((s) => ({ ...s, lastMessage: msg }));
      } catch {
        // Ignore malformed frames
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url]);

  return { ...state, send };
}
