import WebSocket from 'ws';
import type { AgentMessage, AgentRegisterMessage } from '../types/protocol';

export type MessageHandler = (msg: AgentMessage) => void | Promise<void>;

const RECONNECT_DELAY_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const AGENT_VERSION = '0.1.0';

/**
 * Persistent WebSocket client that keeps the agent connected to the relay.
 * Automatically reconnects on disconnect (unless explicitly shut down).
 */
export class RelayClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;
  private readonly handlers = new Set<MessageHandler>();

  constructor(
    private readonly relayUrl: string,
    private readonly agentToken: string
  ) {}

  /** Register a handler for incoming messages. Returns an unsubscribe function. */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  connect(): void {
    if (this.ws) return;
    this.doConnect();
  }

  send(msg: AgentMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  disconnect(): void {
    this.isShuttingDown = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, 'Agent shutting down');
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private doConnect(): void {
    const url = `${this.relayUrl}?type=agent&agentToken=${encodeURIComponent(this.agentToken)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      console.log('[relay] Connected');
      const reg: AgentRegisterMessage = {
        type: 'agent_register',
        agentToken: this.agentToken,
        version: AGENT_VERSION,
      };
      ws.send(JSON.stringify(reg));
      this.startHeartbeat();
    });

    ws.on('message', (data) => {
      let msg: AgentMessage;
      try {
        msg = JSON.parse(data.toString()) as AgentMessage;
      } catch {
        return;
      }
      for (const handler of this.handlers) {
        void Promise.resolve(handler(msg));
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[relay] Disconnected (${code} ${reason.toString()})`);
      this.stopHeartbeat();
      this.ws = null;
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    });

    ws.on('error', (err) => {
      // 'close' fires immediately after 'error', so just log here
      console.error('[relay] Error:', err.message);
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', sessionId: '__heartbeat__' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    console.log(`[relay] Reconnecting in ${RECONNECT_DELAY_MS}ms…`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, RECONNECT_DELAY_MS);
  }
}
