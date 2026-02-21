/**
 * High-level hook that exposes agent actions to screens.
 *
 * The WebSocket connection, session restoration, and inbound-message handling
 * have been lifted into AgentProvider (agentStore.tsx) so that a single
 * connection is shared across all screens. Navigation between screens no
 * longer closes the WebSocket or drops the relay session.
 *
 * This hook only exposes:
 *   pair, sendChat, startTask, fetchRepos, disconnect, isConnected
 */
import { useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { useAgentStore } from '../store/agentStore';

const SESSION_TOKEN_KEY = 'agent_session_token';
const RELAY_URL_KEY = 'agent_relay_url';
const PAIRING_CODE_KEY = 'agent_pairing_code';

export interface AgentConnectionActions {
  /** Exchange a pairing code for a session token. */
  pair: (relayUrl: string, pairingCode: string) => Promise<void>;
  /** Send a chat message to the agent. Changes are committed to `branchName` if provided. */
  sendChat: (text: string, branchName: string) => void;
  /** Hand off the current chat context as an autonomous background task. */
  startTask: (context: string) => void;
  /** Request the list of GitHub repos from the agent. */
  fetchRepos: () => void;
  /** Clear the session token only. Pairing code is kept so auto-reconnect still works. */
  disconnectOnly: () => Promise<void>;
  /** Send invalidate_pairing to the relay, then clear both session token and pairing code. */
  disconnect: () => Promise<void>;
  /** True when the session WebSocket is open and ready to send messages. */
  isConnected: boolean;
}

/** Low-level pairing: opens one-shot WS and returns the sessionToken. */
export async function doPair(relayUrl: string, pairingCode: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(`${relayUrl}?type=mobile`);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Pairing timed out'));
    }, 15_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'mobile_connect', pairingCode }));
    };

    ws.onmessage = (event) => {
      clearTimeout(timeout);
      const msg = JSON.parse(event.data as string) as {
        type: string;
        sessionToken?: string;
        message?: string;
      };
      if (msg.type === 'session_ok' && msg.sessionToken) {
        ws.close();
        resolve(msg.sessionToken);
      } else {
        ws.close();
        reject(new Error(msg.message ?? 'Pairing failed'));
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      ws.close();
      reject(new Error('Could not connect to relay'));
    };
  });
}

export function useAgentConnection(): AgentConnectionActions {
  const { state, dispatch, send, isConnected } = useAgentStore();

  // ── Public actions ──────────────────────────────────────────────────────────

  const pair = useCallback(
    async (relayUrl: string, pairingCode: string): Promise<void> => {
      const sessionToken = await doPair(relayUrl, pairingCode);
      await SecureStore.setItemAsync(SESSION_TOKEN_KEY, sessionToken);
      await SecureStore.setItemAsync(RELAY_URL_KEY, relayUrl);
      await SecureStore.setItemAsync(PAIRING_CODE_KEY, pairingCode);
      dispatch({ type: 'SESSION_ESTABLISHED', sessionToken, relayUrl });
    },
    [dispatch]
  );

  const sendChat = useCallback(
    (text: string, branchName: string): void => {
      if (!state.sessionToken || !state.selectedRepo) return;

      const msgId = randomUUID();
      dispatch({ type: 'CHAT_USER_MESSAGE', id: msgId, text });

      send({
        type: 'chat_message',
        sessionId: state.sessionToken,
        text,
        repoFullName: state.selectedRepo.fullName,
        branchName,
      });
    },
    [send, dispatch, state.sessionToken, state.selectedRepo]
  );

  const startTask = useCallback(
    (context: string): void => {
      if (!state.sessionToken || !state.selectedRepo) return;

      const taskId = randomUUID();
      dispatch({ type: 'TASK_STARTED', id: taskId });

      send({
        type: 'task_start',
        sessionId: state.sessionToken,
        context,
        repoFullName: state.selectedRepo.fullName,
        baseBranch: state.selectedRepo.defaultBranch,
      });
    },
    [send, dispatch, state.sessionToken, state.selectedRepo]
  );

  const fetchRepos = useCallback((): void => {
    if (!state.sessionToken) return;
    send({ type: 'repo_list', sessionId: state.sessionToken });
  }, [send, state.sessionToken]);

  const disconnectOnly = useCallback(async (): Promise<void> => {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    dispatch({ type: 'SESSION_CLOSED' });
  }, [dispatch]);

  const disconnect = useCallback(async (): Promise<void> => {
    if (state.sessionToken && isConnected) {
      send({ type: 'invalidate_pairing', sessionId: state.sessionToken });
    }
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    await SecureStore.deleteItemAsync(PAIRING_CODE_KEY);
    dispatch({ type: 'SESSION_CLOSED' });
  }, [dispatch, send, state.sessionToken, isConnected]);

  return { pair, sendChat, startTask, fetchRepos, disconnectOnly, disconnect, isConnected };
}
