/**
 * Global state for the connected agent session.
 *
 * The singleton WebSocket connection lives here in AgentProvider so that
 * navigating between screens never closes or re-opens the connection.
 * Previously, every screen called useAgentConnection() → useWebSocket(),
 * which opened a fresh WebSocket per screen and deleted the relay session
 * whenever a screen unmounted.
 *
 * Uses React Context + useReducer — no external state-management library.
 */
import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { randomUUID } from 'expo-crypto';
import { useWebSocket } from '../hooks/useWebSocket';
import { doPair } from '../hooks/useAgentConnection';
import type { Repository, InboundMessage, OutboundMessage } from '../types/protocol';

const SESSION_TOKEN_KEY = 'agent_session_token';
const RELAY_URL_KEY = 'agent_relay_url';
const PAIRING_CODE_KEY = 'agent_pairing_code';

// ─── State ────────────────────────────────────────────────────────────────────

export interface AgentState {
  /** Whether we have an active WebSocket connection with a valid session token */
  isConnected: boolean;

  relayUrl: string | null;
  sessionToken: string | null;

  /** Fetched from the agent */
  repositories: Repository[];
  /** True once the agent has responded to our repo_list request (even if empty or errored) */
  reposFetched: boolean;
  /** Repo the user has opened */
  selectedRepo: Repository | null;

  /** Chat messages for the current session */
  chatMessages: ChatMessage[];

  /** Active background task */
  task: TaskState | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** True while the assistant is still streaming */
  isStreaming: boolean;
}

export interface TaskState {
  id: string;
  /** Accumulated log output */
  logs: string;
  /** Set when the task is complete */
  prUrl: string | null;
  prTitle: string | null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type AgentAction =
  | { type: 'SESSION_ESTABLISHED'; sessionToken: string; relayUrl: string }
  | { type: 'SESSION_CLOSED' }
  | { type: 'REPOS_LOADED'; repos: Repository[] }
  | { type: 'REPOS_FETCH_DONE' }
  | { type: 'REPO_SELECTED'; repo: Repository }
  | { type: 'CHAT_USER_MESSAGE'; id: string; text: string }
  | { type: 'CHAT_ASSISTANT_START'; id: string }
  | { type: 'CHAT_ASSISTANT_CHUNK'; id: string; chunk: string }
  | { type: 'CHAT_ASSISTANT_END'; id: string }
  | { type: 'TASK_STARTED'; id: string }
  | { type: 'TASK_LOG_CHUNK'; chunk: string }
  | { type: 'TASK_DONE'; prUrl: string; prTitle: string }
  | { type: 'TASK_RESET' };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'SESSION_ESTABLISHED':
      return {
        ...state,
        isConnected: true,
        sessionToken: action.sessionToken,
        relayUrl: action.relayUrl,
        // Reset repo state so fetchRepos fires again on the new session
        repositories: [],
        reposFetched: false,
      };

    case 'SESSION_CLOSED':
      return { ...state, isConnected: false, sessionToken: null };

    case 'REPOS_LOADED':
      return { ...state, repositories: action.repos, reposFetched: true };

    case 'REPOS_FETCH_DONE':
      return { ...state, reposFetched: true };

    case 'REPO_SELECTED':
      return { ...state, selectedRepo: action.repo, chatMessages: [] };

    case 'CHAT_USER_MESSAGE':
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          { id: action.id, role: 'user', text: action.text, isStreaming: false },
        ],
      };

    case 'CHAT_ASSISTANT_START':
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          { id: action.id, role: 'assistant', text: '', isStreaming: true },
        ],
      };

    case 'CHAT_ASSISTANT_CHUNK':
      return {
        ...state,
        chatMessages: state.chatMessages.map((msg) =>
          msg.id === action.id ? { ...msg, text: msg.text + action.chunk } : msg
        ),
      };

    case 'CHAT_ASSISTANT_END':
      return {
        ...state,
        chatMessages: state.chatMessages.map((msg) =>
          msg.id === action.id ? { ...msg, isStreaming: false } : msg
        ),
      };

    case 'TASK_STARTED':
      return { ...state, task: { id: action.id, logs: '', prUrl: null, prTitle: null } };

    case 'TASK_LOG_CHUNK':
      if (!state.task) return state;
      return { ...state, task: { ...state.task, logs: state.task.logs + action.chunk } };

    case 'TASK_DONE':
      if (!state.task) return state;
      return {
        ...state,
        task: { ...state.task, prUrl: action.prUrl, prTitle: action.prTitle },
      };

    case 'TASK_RESET':
      return { ...state, task: null };

    default:
      return state;
  }
}

// ─── Context + Provider ───────────────────────────────────────────────────────

const initialState: AgentState = {
  isConnected: false,
  relayUrl: null,
  sessionToken: null,
  repositories: [],
  reposFetched: false,
  selectedRepo: null,
  chatMessages: [],
  task: null,
};

export interface AgentContextValue {
  state: AgentState;
  dispatch: React.Dispatch<AgentAction>;
  /** Send a message over the singleton session WebSocket. Returns false if not connected. */
  send: (msg: OutboundMessage) => boolean;
  /** True when the session WebSocket is open and ready. */
  isConnected: boolean;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Singleton WebSocket ─────────────────────────────────────────────────────
  // Opened once in the provider (never per-screen), so navigation never drops it.
  const relayWsUrl =
    state.relayUrl && state.sessionToken
      ? `${state.relayUrl}?type=mobile&sessionToken=${state.sessionToken}`
      : null;

  const { send, lastMessage, isConnected } = useWebSocket(relayWsUrl);

  // Track the current streaming assistant message ID
  const streamingIdRef = useRef<string | null>(null);

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [sessionToken, relayUrl] = await Promise.all([
        SecureStore.getItemAsync(SESSION_TOKEN_KEY),
        SecureStore.getItemAsync(RELAY_URL_KEY),
      ]);
      if (sessionToken && relayUrl) {
        dispatch({ type: 'SESSION_ESTABLISHED', sessionToken, relayUrl });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle incoming messages ────────────────────────────────────────────────
  const handleInbound = useCallback(
    async (msg: InboundMessage): Promise<void> => {
      switch (msg.type) {
        case 'session_ok': {
          // Handled inside pair() via a one-shot WebSocket; safe to ignore here.
          break;
        }

        case 'repo_list_result': {
          dispatch({ type: 'REPOS_LOADED', repos: msg.repos });
          break;
        }

        case 'stream_chunk': {
          if (streamingIdRef.current === null) {
            // First chunk — start a new assistant message
            const id = randomUUID();
            streamingIdRef.current = id;
            dispatch({ type: 'CHAT_ASSISTANT_START', id });
          }
          // Route to task log or chat depending on whether a task is active
          if (state.task !== null) {
            dispatch({ type: 'TASK_LOG_CHUNK', chunk: msg.text });
          } else {
            dispatch({
              type: 'CHAT_ASSISTANT_CHUNK',
              id: streamingIdRef.current,
              chunk: msg.text,
            });
          }
          break;
        }

        case 'stream_end': {
          if (streamingIdRef.current !== null) {
            dispatch({ type: 'CHAT_ASSISTANT_END', id: streamingIdRef.current });
            streamingIdRef.current = null;
          }
          break;
        }

        case 'task_done': {
          dispatch({ type: 'TASK_DONE', prUrl: msg.prUrl, prTitle: msg.prTitle });
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'PR ready',
              body: msg.prTitle,
              data: { prUrl: msg.prUrl },
            },
            trigger: null, // fire immediately
          });
          break;
        }

        case 'error': {
          // Session expired — try to auto-re-pair with the stored pairing code
          if (msg.message === 'Session expired — reconnect') {
            await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
            const [pairingCode, relayUrl] = await Promise.all([
              SecureStore.getItemAsync(PAIRING_CODE_KEY),
              SecureStore.getItemAsync(RELAY_URL_KEY),
            ]);
            if (pairingCode && relayUrl) {
              try {
                const sessionToken = await doPair(relayUrl, pairingCode);
                await SecureStore.setItemAsync(SESSION_TOKEN_KEY, sessionToken);
                dispatch({ type: 'SESSION_ESTABLISHED', sessionToken, relayUrl });
              } catch {
                await SecureStore.deleteItemAsync(PAIRING_CODE_KEY);
                dispatch({ type: 'SESSION_CLOSED' });
              }
            } else {
              dispatch({ type: 'SESSION_CLOSED' });
            }
            break;
          }
          // If repos haven't loaded yet, stop the spinner
          if (!state.reposFetched) {
            dispatch({ type: 'REPOS_FETCH_DONE' });
          }
          // Surface the error as an assistant message so it's visible in chat
          const errId = randomUUID();
          dispatch({ type: 'CHAT_ASSISTANT_START', id: errId });
          dispatch({ type: 'CHAT_ASSISTANT_CHUNK', id: errId, chunk: `Error: ${msg.message}` });
          dispatch({ type: 'CHAT_ASSISTANT_END', id: errId });
          break;
        }

        default:
          break;
      }
    },
    [dispatch, state.task, state.reposFetched]
  );

  useEffect(() => {
    if (!lastMessage) return;
    void handleInbound(lastMessage);
  // handleInbound is stable across the deps it uses (dispatch + state slices)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage]);

  return (
    <AgentContext.Provider value={{ state, dispatch, send, isConnected }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgentStore(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgentStore must be used within <AgentProvider>');
  return ctx;
}
