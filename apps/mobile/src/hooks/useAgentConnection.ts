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

export interface AgentConnectionActions {
  /** Exchange a pairing code for a session token. */
  pair: (relayUrl: string, pairingCode: string) => Promise<void>;
  /** Send a chat message to the agent. Changes are committed to `branchName` if provided. */
  sendChat: (text: string, branchName: string) => void;
  /** Hand off the current chat context as an autonomous background task. */
  startTask: (context: string) => void;
  /** Request the list of GitHub repos from the agent. */
  fetchRepos: () => void;
  /** Disconnect and clear stored credentials. */
  disconnect: () => Promise<void>;
  /** True when the session WebSocket is open and ready to send messages. */
  isConnected: boolean;
}

export function useAgentConnection(): AgentConnectionActions {
  const { state, dispatch, send, isConnected } = useAgentStore();

  // ── Public actions ──────────────────────────────────────────────────────────

  const pair = useCallback(
    async (relayUrl: string, pairingCode: string): Promise<void> => {
      // Use a one-shot WebSocket just for pairing (no session token yet)
      const pairingUrl = `${relayUrl}?type=mobile`;
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(pairingUrl);

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Pairing timed out'));
        }, 15_000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'mobile_connect', pairingCode }));
        };

        ws.onmessage = async (event) => {
          clearTimeout(timeout);
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              sessionToken?: string;
              message?: string;
            };
            if (msg.type === 'session_ok' && msg.sessionToken) {
              await SecureStore.setItemAsync(SESSION_TOKEN_KEY, msg.sessionToken);
              await SecureStore.setItemAsync(RELAY_URL_KEY, relayUrl);
              dispatch({
                type: 'SESSION_ESTABLISHED',
                sessionToken: msg.sessionToken,
                relayUrl,
              });
              ws.close();
              resolve();
            } else if (msg.type === 'error') {
              ws.close();
              reject(new Error(msg.message ?? 'Pairing failed'));
            }
          } catch (err) {
            ws.close();
            reject(err);
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          ws.close();
          reject(new Error('Could not connect to relay'));
        };
      });
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

  const disconnect = useCallback(async (): Promise<void> => {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    dispatch({ type: 'SESSION_CLOSED' });
  }, [dispatch]);

  return { pair, sendChat, startTask, fetchRepos, disconnect, isConnected };
}
