/**
 * useWebSocket unit tests.
 *
 * Uses a global WebSocket stub to verify connection, message handling,
 * and disconnection lifecycle without a real network.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { InboundMessage } from '../../types/protocol';

// ─── WebSocket stub ───────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(msg: InboundMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  simulateError(): void {
    this.onerror?.();
  }
}

// Inject stub before tests
beforeAll(() => {
  (global as unknown as Record<string, unknown>).WebSocket = MockWebSocket;
});

afterAll(() => {
  delete (global as unknown as Record<string, unknown>).WebSocket;
});

beforeEach(() => {
  MockWebSocket.instances = [];
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useWebSocket', () => {
  it('starts disconnected when url is null', () => {
    const { result } = renderHook(() => useWebSocket(null));
    expect(result.current.isConnected).toBe(false);
  });

  it('opens a WebSocket when url is provided', () => {
    renderHook(() => useWebSocket('wss://relay.test'));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('wss://relay.test');
  });

  it('sets isConnected=true on open', () => {
    const { result } = renderHook(() => useWebSocket('wss://relay.test'));
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);
  });

  it('sets isConnected=false on close', () => {
    const { result } = renderHook(() => useWebSocket('wss://relay.test'));
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });
    act(() => {
      MockWebSocket.instances[0].close();
    });
    expect(result.current.isConnected).toBe(false);
  });

  it('sets error on onerror', () => {
    const { result } = renderHook(() => useWebSocket('wss://relay.test'));
    act(() => {
      MockWebSocket.instances[0].simulateError();
    });
    expect(result.current.error).toBeTruthy();
  });

  it('updates lastMessage on incoming message', () => {
    const { result } = renderHook(() => useWebSocket('wss://relay.test'));
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    const msg: InboundMessage = { type: 'stream_chunk', sessionId: 'abc', text: 'hello' };
    act(() => {
      MockWebSocket.instances[0].simulateMessage(msg);
    });

    expect(result.current.lastMessage).toEqual(msg);
  });

  it('send() sends serialised JSON when connected', () => {
    const { result } = renderHook(() => useWebSocket('wss://relay.test'));
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      result.current.send({ type: 'ping', sessionId: 'abc' });
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'ping', sessionId: 'abc' });
  });

  it('send() returns false when not connected', () => {
    const { result } = renderHook(() => useWebSocket('wss://relay.test'));
    // Not open yet
    let ok = false;
    act(() => {
      ok = result.current.send({ type: 'ping', sessionId: 'abc' });
    });
    expect(ok).toBe(false);
  });

  it('closes old WebSocket and opens new one when url changes', () => {
    const { rerender } = renderHook(({ url }: { url: string }) => useWebSocket(url), {
      initialProps: { url: 'wss://relay1.test' },
    });

    rerender({ url: 'wss://relay2.test' });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[0].closed).toBe(true);
    expect(MockWebSocket.instances[1].url).toBe('wss://relay2.test');
  });

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket('wss://relay.test'));
    unmount();
    expect(MockWebSocket.instances[0].closed).toBe(true);
  });
});
