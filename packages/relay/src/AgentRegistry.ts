import type { RelayMessage } from './types/protocol';

interface AgentEntry {
  ws: WebSocket;
  pairingCode: string;
  connectedAt: number;
}

/**
 * Durable Object that maintains in-memory registries of connected agents and
 * mobile clients. Forwards messages bidirectionally between them.
 *
 * Uses the legacy ws.accept() API (not hibernation) so that in-memory Maps
 * survive across the lifetime of the DO instance. The DO stays resident as long
 * as at least one WebSocket connection is open.
 */
export class AgentRegistry {
  // agentToken → AgentEntry
  private agents = new Map<string, AgentEntry>();
  // pairingCode → agentToken  (6-digit code valid until mobile pairs)
  private pairingCodes = new Map<string, string>();
  // sessionToken → agentToken  (UUID, valid for life of mobile session)
  private sessions = new Map<string, string>();
  // sessionToken → mobile WebSocket
  private mobileConnections = new Map<string, WebSocket>();

  constructor(
    // state is unused in legacy mode but required by the DO constructor signature
    _state: DurableObjectState,
    _env: unknown
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const clientKind = url.searchParams.get('type'); // 'agent' | 'mobile'

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Legacy accept — keeps the DO alive and Maps in memory
    server.accept();

    if (clientKind === 'agent') {
      const agentToken = url.searchParams.get('agentToken');
      if (!agentToken) {
        server.close(4000, 'Missing agentToken');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.handleAgentConnection(server, agentToken);
    } else {
      const sessionToken = url.searchParams.get('sessionToken');
      if (sessionToken) {
        this.mobileConnections.set(sessionToken, server);
        this.handleMobileConnection(server, sessionToken);
      } else {
        this.handleMobilePairingConnection(server);
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── Private handlers ────────────────────────────────────────────────────────

  private handleAgentConnection(ws: WebSocket, agentToken: string): void {
    ws.addEventListener('message', (event) => {
      const data = event.data;
      if (typeof data !== 'string') return;
      let msg: RelayMessage;
      try {
        msg = JSON.parse(data) as RelayMessage;
      } catch {
        return;
      }

      if (msg.type === 'agent_register') {
        const existingEntry = this.agents.get(agentToken);
        if (existingEntry) {
          this.pairingCodes.delete(existingEntry.pairingCode);
        }
        const pairingCode = this.generatePairingCode();
        this.agents.set(agentToken, { ws, pairingCode, connectedAt: Date.now() });
        this.pairingCodes.set(pairingCode, agentToken);
        ws.send(JSON.stringify({ type: 'register_ok', pairingCode }));
        return;
      }

      // Forward message from agent to the correct mobile session
      if ('sessionId' in msg && msg.sessionId) {
        const mobileWs = this.mobileConnections.get(msg.sessionId);
        mobileWs?.send(JSON.stringify(msg));
      }
    });

    ws.addEventListener('close', () => {
      const entry = this.agents.get(agentToken);
      if (entry) {
        this.pairingCodes.delete(entry.pairingCode);
        this.agents.delete(agentToken);
      }
    });

    ws.addEventListener('error', (event) => {
      console.error('[AgentRegistry] Agent WebSocket error:', event);
    });
  }

  private handleMobileConnection(ws: WebSocket, sessionToken: string): void {
    ws.addEventListener('message', (event) => {
      const data = event.data;
      if (typeof data !== 'string') return;
      let msg: RelayMessage;
      try {
        msg = JSON.parse(data) as RelayMessage;
      } catch {
        return;
      }

      const agentToken = this.sessions.get(sessionToken);
      if (!agentToken) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session expired — reconnect' }));
        return;
      }

      const agentEntry = this.agents.get(agentToken);
      if (!agentEntry) {
        ws.send(JSON.stringify({ type: 'error', message: 'Agent disconnected' }));
        return;
      }

      // Stamp sessionId so the agent can route its replies back to this session
      agentEntry.ws.send(JSON.stringify({ ...msg, sessionId: sessionToken }));
    });

    ws.addEventListener('close', () => {
      this.mobileConnections.delete(sessionToken);
      this.sessions.delete(sessionToken);
    });
  }

  private handleMobilePairingConnection(ws: WebSocket): void {
    ws.addEventListener('message', (event) => {
      const data = event.data;
      if (typeof data !== 'string') return;
      let msg: RelayMessage;
      try {
        msg = JSON.parse(data) as RelayMessage;
      } catch {
        return;
      }

      if (msg.type !== 'mobile_connect') return;

      const agentToken = this.pairingCodes.get(msg.pairingCode);
      if (!agentToken) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired pairing code' }));
        return;
      }

      const sessionToken = crypto.randomUUID();
      this.sessions.set(sessionToken, agentToken);
      this.mobileConnections.set(sessionToken, ws);
      ws.send(JSON.stringify({ type: 'session_ok', sessionToken }));

      // Pairing code is single-use
      this.pairingCodes.delete(msg.pairingCode);
    });
  }

  private generatePairingCode(): string {
    // 6-digit numeric code
    return String(Math.floor(100_000 + Math.random() * 900_000));
  }
}
