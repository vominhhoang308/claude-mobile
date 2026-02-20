/**
 * Unit tests for the AgentRegistry pairing and routing logic.
 *
 * We test the state-machine logic directly without spinning up a real Worker,
 * using lightweight WS stubs.
 */

import { AgentRegistry } from '../AgentRegistry';

// ─── Stubs ────────────────────────────────────────────────────────────────────

interface SentMessage {
  raw: string;
  parsed: unknown;
}

class StubWebSocket {
  sent: SentMessage[] = [];
  closed = false;
  private attachment: unknown = null;

  send(data: string): void {
    this.sent.push({ raw: data, parsed: JSON.parse(data) as unknown });
  }

  close(_code?: number, _reason?: string): void {
    this.closed = true;
  }

  serializeAttachment(data: unknown): void {
    this.attachment = data;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }

  lastMessage(): unknown {
    return this.sent.at(-1)?.parsed ?? null;
  }
}

// Minimal DurableObjectState stub
const makeState = () =>
  ({
    acceptWebSocket: (_ws: unknown) => undefined,
    // add other methods if needed
  }) as unknown as DurableObjectState;

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeRegistry(): AgentRegistry {
  return new AgentRegistry(makeState(), {});
}

function agentWs(agentToken: string): StubWebSocket {
  const ws = new StubWebSocket();
  ws.serializeAttachment({ kind: 'agent', agentToken });
  return ws;
}

function mobileWs(): StubWebSocket {
  const ws = new StubWebSocket();
  ws.serializeAttachment({ kind: 'mobile_pending' });
  return ws;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentRegistry', () => {
  describe('agent registration', () => {
    it('responds with register_ok and a 6-digit pairing code', () => {
      const registry = makeRegistry();
      const ws = agentWs('token-1');

      registry.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'agent_register', agentToken: 'token-1', version: '0.1.0' })
      );

      const reply = ws.lastMessage() as { type: string; pairingCode: string };
      expect(reply.type).toBe('register_ok');
      expect(reply.pairingCode).toMatch(/^\d{6}$/);
    });

    it('re-registers an already-connected agent with a fresh pairing code', () => {
      const registry = makeRegistry();
      const ws = agentWs('token-1');
      const regMsg = JSON.stringify({
        type: 'agent_register',
        agentToken: 'token-1',
        version: '0.1.0',
      });

      registry.webSocketMessage(ws as unknown as WebSocket, regMsg);
      const first = (ws.lastMessage() as { pairingCode: string }).pairingCode;

      registry.webSocketMessage(ws as unknown as WebSocket, regMsg);
      const second = (ws.lastMessage() as { pairingCode: string }).pairingCode;

      // Codes can differ (they're random)
      expect(second).toMatch(/^\d{6}$/);
      // Old code is gone — cannot pair with old code
      const mobile = mobileWs();
      registry.webSocketMessage(
        mobile as unknown as WebSocket,
        JSON.stringify({ type: 'mobile_connect', pairingCode: first })
      );
      const mobileReply = mobile.lastMessage() as { type: string };
      expect(mobileReply.type).toBe('error');
    });
  });

  describe('mobile pairing', () => {
    function setupPairedMobile(): {
      registry: AgentRegistry;
      agentSocket: StubWebSocket;
      mobileSocket: StubWebSocket;
      sessionToken: string;
      pairingCode: string;
    } {
      const registry = makeRegistry();
      const agentSocket = agentWs('agent-1');

      registry.webSocketMessage(
        agentSocket as unknown as WebSocket,
        JSON.stringify({ type: 'agent_register', agentToken: 'agent-1', version: '0.1.0' })
      );
      const pairingCode = (agentSocket.lastMessage() as { pairingCode: string }).pairingCode;

      const mobileSocket = mobileWs();
      registry.webSocketMessage(
        mobileSocket as unknown as WebSocket,
        JSON.stringify({ type: 'mobile_connect', pairingCode })
      );
      const sessionOk = mobileSocket.lastMessage() as { type: string; sessionToken: string };
      expect(sessionOk.type).toBe('session_ok');

      return {
        registry,
        agentSocket,
        mobileSocket,
        sessionToken: sessionOk.sessionToken,
        pairingCode,
      };
    }

    it('issues a UUID session token on valid pairing code', () => {
      const { sessionToken } = setupPairedMobile();
      expect(sessionToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('pairing code is single-use', () => {
      const { registry, pairingCode } = setupPairedMobile();

      const secondMobile = mobileWs();
      registry.webSocketMessage(
        secondMobile as unknown as WebSocket,
        JSON.stringify({ type: 'mobile_connect', pairingCode })
      );
      const reply = secondMobile.lastMessage() as { type: string };
      expect(reply.type).toBe('error');
    });

    it('rejects invalid pairing codes', () => {
      const registry = makeRegistry();
      const mobile = mobileWs();
      registry.webSocketMessage(
        mobile as unknown as WebSocket,
        JSON.stringify({ type: 'mobile_connect', pairingCode: '000000' })
      );
      const reply = mobile.lastMessage() as { type: string };
      expect(reply.type).toBe('error');
    });
  });

  describe('message forwarding', () => {
    it('forwards mobile → agent messages with sessionId stamped', () => {
      const registry = makeRegistry();
      const agentSocket = agentWs('agent-1');

      registry.webSocketMessage(
        agentSocket as unknown as WebSocket,
        JSON.stringify({ type: 'agent_register', agentToken: 'agent-1', version: '0.1.0' })
      );
      const { pairingCode } = agentSocket.lastMessage() as { pairingCode: string };

      const mobileSocket = mobileWs();
      registry.webSocketMessage(
        mobileSocket as unknown as WebSocket,
        JSON.stringify({ type: 'mobile_connect', pairingCode })
      );
      const { sessionToken } = mobileSocket.lastMessage() as { sessionToken: string };

      // Upgrade attachment to 'mobile'
      mobileSocket.serializeAttachment({ kind: 'mobile', sessionToken });

      // Mobile sends a chat message
      registry.webSocketMessage(
        mobileSocket as unknown as WebSocket,
        JSON.stringify({ type: 'chat_message', sessionId: sessionToken, text: 'hello' })
      );

      // Agent should receive it
      const forwarded = agentSocket.lastMessage() as { type: string; sessionId: string; text: string };
      expect(forwarded.type).toBe('chat_message');
      expect(forwarded.text).toBe('hello');
      expect(forwarded.sessionId).toBe(sessionToken);
    });

    it('forwards agent → mobile messages by sessionId', () => {
      const registry = makeRegistry();
      const agentSocket = agentWs('agent-1');

      registry.webSocketMessage(
        agentSocket as unknown as WebSocket,
        JSON.stringify({ type: 'agent_register', agentToken: 'agent-1', version: '0.1.0' })
      );
      const { pairingCode } = agentSocket.lastMessage() as { pairingCode: string };

      const mobileSocket = mobileWs();
      registry.webSocketMessage(
        mobileSocket as unknown as WebSocket,
        JSON.stringify({ type: 'mobile_connect', pairingCode })
      );
      const { sessionToken } = mobileSocket.lastMessage() as { sessionToken: string };
      mobileSocket.serializeAttachment({ kind: 'mobile', sessionToken });

      // Agent sends a stream chunk back
      registry.webSocketMessage(
        agentSocket as unknown as WebSocket,
        JSON.stringify({ type: 'stream_chunk', sessionId: sessionToken, text: 'Running...' })
      );

      const received = mobileSocket.lastMessage() as { type: string; text: string };
      expect(received.type).toBe('stream_chunk');
      expect(received.text).toBe('Running...');
    });
  });
});
