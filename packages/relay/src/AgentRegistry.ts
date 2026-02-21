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
  // pairingCode → agentToken
  private pairingCodes = new Map<string, string>();
  // agentToken → stable pairing code (survives agent WS drops)
  private agentCodes = new Map<string, string>();
  // sessionToken → agentToken  (UUID, valid for life of mobile session)
  private sessions = new Map<string, string>();
  // sessionToken → pairing code that created it (for invalidation lookup)
  private sessionToPairingCode = new Map<string, string>();
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
        // Validate session before accepting mobile reconnect
        if (!this.sessions.has(sessionToken)) {
          server.send(JSON.stringify({ type: 'error', message: 'Session expired — reconnect' }));
          server.close(4001, 'Session expired');
          return new Response(null, { status: 101, webSocket: client });
        }
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
        // Reuse the existing code if one was already assigned to this agent
        let pairingCode = this.agentCodes.get(agentToken);
        if (!pairingCode) {
          pairingCode = this.generatePairingCode();
          this.agentCodes.set(agentToken, pairingCode);
          this.pairingCodes.set(pairingCode, agentToken);
        }
        this.agents.set(agentToken, { ws, pairingCode, connectedAt: Date.now() });
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
      this.agents.delete(agentToken);
      // agentCodes and pairingCodes intentionally kept — agent may reconnect
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

      // Handle pairing invalidation before forwarding
      if (msg.type === 'invalidate_pairing') {
        const agentToken = this.sessions.get(sessionToken);
        // Remove session
        this.sessions.delete(sessionToken);
        if (this.mobileConnections.get(sessionToken) === ws) {
          this.mobileConnections.delete(sessionToken);
        }
        // Revoke old pairing code and issue a fresh one for the agent
        const oldCode = this.sessionToPairingCode.get(sessionToken);
        this.sessionToPairingCode.delete(sessionToken);
        if (agentToken && oldCode) {
          this.pairingCodes.delete(oldCode);
          this.agentCodes.delete(agentToken);
          const newCode = this.generatePairingCode();
          this.agentCodes.set(agentToken, newCode);
          this.pairingCodes.set(newCode, agentToken);
          // Notify agent of its new code (if currently connected)
          const agentEntry = this.agents.get(agentToken);
          if (agentEntry) {
            agentEntry.ws.send(JSON.stringify({ type: 'register_ok', pairingCode: newCode }));
          }
        }
        ws.close(1000, 'Pairing invalidated');
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
      // Only clean up the connection pointer, not the session itself.
      // Sessions are kept alive so the mobile can auto-re-pair on reconnect.
      if (this.mobileConnections.get(sessionToken) === ws) {
        this.mobileConnections.delete(sessionToken);
      }
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
      this.sessionToPairingCode.set(sessionToken, msg.pairingCode);
      this.mobileConnections.set(sessionToken, ws);
      ws.send(JSON.stringify({ type: 'session_ok', sessionToken }));
      // Pairing code is now multi-use — intentionally NOT deleted
    });
  }

  private generatePairingCode(): string {
    // 6-digit numeric code
    return String(Math.floor(100_000 + Math.random() * 900_000));
  }
}
