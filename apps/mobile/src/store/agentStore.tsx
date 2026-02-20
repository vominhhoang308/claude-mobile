/**
 * Global state for the connected agent session.
 *
 * Uses React Context + useReducer — no external state-management library
 * required, keeping the dependency graph lean (Principle II).
 */
import React, { createContext, useContext, useReducer } from 'react';
import type { Repository } from '../types/protocol';

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

interface AgentContextValue {
  state: AgentState;
  dispatch: React.Dispatch<AgentAction>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AgentContext.Provider value={{ state, dispatch }}>{children}</AgentContext.Provider>;
}

export function useAgentStore(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgentStore must be used within <AgentProvider>');
  return ctx;
}
