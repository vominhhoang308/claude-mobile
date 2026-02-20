// Mobile-side protocol types — mirrors the agent/relay types exactly.
// Kept separate so the mobile bundle has no Node.js dependency.

export interface AgentRegisterMessage {
  type: 'agent_register';
  agentToken: string;
  version: string;
}

export interface RegisterOkMessage {
  type: 'register_ok';
  pairingCode: string;
}

export interface MobileConnectMessage {
  type: 'mobile_connect';
  pairingCode: string;
}

export interface SessionOkMessage {
  type: 'session_ok';
  sessionToken: string;
}

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

/** Messages the mobile app sends to the relay/agent */
export type OutboundMessage =
  | MobileConnectMessage
  | ChatMessageMessage
  | TaskStartMessage
  | RepoListRequestMessage
  | PingMessage;

/** Messages the mobile app receives from the relay/agent */
export type InboundMessage =
  | SessionOkMessage
  | StreamChunkMessage
  | StreamEndMessage
  | TaskDoneMessage
  | RepoListResultMessage
  | PongMessage
  | ErrorMessage;
