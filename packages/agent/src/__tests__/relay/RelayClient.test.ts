/**
 * Tests for RelayClient reconnect logic and message routing.
 * The WebSocket is stubbed so no real network connection is made.
 */

import { RelayClient } from '../../relay/RelayClient';
import type { AgentMessage } from '../../types/protocol';

// ─── Stub ─────────────────────────────────────────────────────────────────────

interface MockWsInstance {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code: number; reason: Buffer }) => void) | null;
  onerror: ((err: Error) => void) | null;
  readyState: number;
  sent: string[];
  on(event: string, fn: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

let lastWsInstance: MockWsInstance | null = null;

const OPEN = 1;
const CLOSED = 3;

jest.mock('ws', () => {
  const instances: MockWsInstance[] = [];

  const MockWs = jest.fn((_url: string) => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const instance: MockWsInstance = {
      readyState: OPEN,
      sent: [],
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      on(event: string, fn: (...args: unknown[]) => void) {
        listeners[event] ??= [];
        listeners[event].push(fn);
      },
      send(data: string) {
        this.sent.push(data);
      },
      close(code = 1000, reason = '') {
        this.readyState = CLOSED;
        for (const fn of listeners['close'] ?? []) {
          fn(code, Buffer.from(reason));
        }
      },
    };

    // Helper to fire 'open'
    (instance as unknown as Record<string, unknown>)._fireOpen = () => {
      for (const fn of listeners['open'] ?? []) fn();
    };

    // Helper to fire 'message'
    (instance as unknown as Record<string, unknown>)._fireMessage = (data: string) => {
      for (const fn of listeners['message'] ?? []) fn(data);
    };

    instances.push(instance);
    lastWsInstance = instance;
    return instance;
  });

  // Use literals here — `jest.mock()` factories are hoisted before const declarations
  (MockWs as unknown as Record<string, number>).OPEN = 1;
  (MockWs as unknown as Record<string, number>).CLOSED = 3;

  return MockWs;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RelayClient', () => {
  beforeEach(() => {
    lastWsInstance = null;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('connect()', () => {
    it('sends agent_register on open', () => {
      const client = new RelayClient('wss://relay.test', 'agent-token-1');
      client.connect();

      expect(lastWsInstance).not.toBeNull();
      // Fire the open event
      (lastWsInstance as unknown as Record<string, () => void>)._fireOpen();

      const sent = lastWsInstance!.sent;
      expect(sent).toHaveLength(1);
      const msg = JSON.parse(sent[0]) as AgentMessage;
      expect(msg.type).toBe('agent_register');
    });

    it('does not create a second WS if already connected', () => {
      const WebSocket = jest.requireMock('ws') as jest.Mock;
      const client = new RelayClient('wss://relay.test', 'agent-token-2');
      client.connect();
      client.connect();
      expect(WebSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('send()', () => {
    it('returns true and sends when connected', () => {
      const client = new RelayClient('wss://relay.test', 'token');
      client.connect();
      (lastWsInstance as unknown as Record<string, () => void>)._fireOpen();

      const ok = client.send({ type: 'ping', sessionId: 'test' });
      expect(ok).toBe(true);
      expect(lastWsInstance!.sent.at(-1)).toContain('ping');
    });

    it('returns false when not connected', () => {
      const client = new RelayClient('wss://relay.test', 'token');
      // Not connected yet
      const ok = client.send({ type: 'ping', sessionId: 'test' });
      expect(ok).toBe(false);
    });
  });

  describe('onMessage()', () => {
    it('calls handler for incoming messages', () => {
      const client = new RelayClient('wss://relay.test', 'token');
      const received: AgentMessage[] = [];
      client.onMessage((msg) => { received.push(msg); });
      client.connect();
      (lastWsInstance as unknown as Record<string, () => void>)._fireOpen();

      const payload: AgentMessage = { type: 'pong', sessionId: 'abc' };
      (lastWsInstance as unknown as Record<string, (d: string) => void>)._fireMessage(
        JSON.stringify(payload)
      );

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(payload);
    });

    it('unsubscribe stops future calls', () => {
      const client = new RelayClient('wss://relay.test', 'token');
      const received: AgentMessage[] = [];
      const unsub = client.onMessage((msg) => { received.push(msg); });
      client.connect();
      (lastWsInstance as unknown as Record<string, () => void>)._fireOpen();

      unsub();

      (lastWsInstance as unknown as Record<string, (d: string) => void>)._fireMessage(
        JSON.stringify({ type: 'pong', sessionId: 'abc' })
      );

      expect(received).toHaveLength(0);
    });
  });

  describe('disconnect()', () => {
    it('closes the WebSocket and marks as shut down', () => {
      const client = new RelayClient('wss://relay.test', 'token');
      client.connect();
      (lastWsInstance as unknown as Record<string, () => void>)._fireOpen();

      const ws = lastWsInstance!;
      client.disconnect();

      expect(ws.readyState).toBe(CLOSED);
      expect(client.isConnected).toBe(false);
    });
  });
});
