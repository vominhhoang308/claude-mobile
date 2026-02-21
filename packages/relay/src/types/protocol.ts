// Shared protocol types for relay ↔ agent and relay ↔ mobile communication.
// The relay only forwards these messages — it never reads their content.

// ─── Agent → Relay ────────────────────────────────────────────────────────────

export interface AgentRegisterMessage {
  type: 'agent_register';
  agentToken: string;
  version: string;
}

// ─── Relay → Agent ────────────────────────────────────────────────────────────

export interface RegisterOkMessage {
  type: 'register_ok';
  pairingCode: string;
}

// ─── Mobile → Relay (pairing handshake) ──────────────────────────────────────

export interface MobileConnectMessage {
  type: 'mobile_connect';
  pairingCode: string;
}

export interface InvalidatePairingMessage {
  type: 'invalidate_pairing';
  sessionId: string;
}

// ─── Relay → Mobile (pairing handshake) ──────────────────────────────────────

export interface SessionOkMessage {
  type: 'session_ok';
  sessionToken: string;
}

// ─── Mobile → Agent (forwarded by relay) ─────────────────────────────────────

export interface ChatMessageMessage {
  type: 'chat_message';
  sessionId: string;
  text: string;
  repoFullName?: string;
}

export interface TaskStartMessage {
  type: 'task_start';
  sessionId: string;
  context: string;
  repoFullName: string;
  baseBranch: string;
}

export interface RepoListRequestMessage {
  type: 'repo_list';
  sessionId: string;
}

export interface PingMessage {
  type: 'ping';
  sessionId: string;
}

// ─── Agent → Mobile (forwarded by relay) ─────────────────────────────────────

export interface StreamChunkMessage {
  type: 'stream_chunk';
  sessionId: string;
  text: string;
}

export interface StreamEndMessage {
  type: 'stream_end';
  sessionId: string;
}

export interface TaskDoneMessage {
  type: 'task_done';
  sessionId: string;
  prUrl: string;
  prTitle: string;
}

export interface Repository {
  id: number;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  private: boolean;
  updatedAt: string;
}

export interface RepoListResultMessage {
  type: 'repo_list_result';
  sessionId: string;
  repos: Repository[];
}

export interface PongMessage {
  type: 'pong';
  sessionId: string;
}

export interface ErrorMessage {
  type: 'error';
  sessionId?: string;
  message: string;
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type RelayMessage =
  | AgentRegisterMessage
  | RegisterOkMessage
  | MobileConnectMessage
  | InvalidatePairingMessage
  | SessionOkMessage
  | ChatMessageMessage
  | TaskStartMessage
  | RepoListRequestMessage
  | PingMessage
  | StreamChunkMessage
  | StreamEndMessage
  | TaskDoneMessage
  | RepoListResultMessage
  | PongMessage
  | ErrorMessage;
