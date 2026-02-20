/**
 * High-level hook that orchestrates the full agent connection lifecycle:
 *
 *  1. Reads the stored session token from secure storage (expo-secure-store).
 *  2. Opens a WebSocket to the relay.
 *  3. Handles all inbound messages and dispatches to the agent store.
 *  4. Exposes `pair`, `sendChat`, `startTask`, `fetchRepos`, `disconnect`.
 *
 * Security: The session token is stored in expo-secure-store (backed by
 * iOS Keychain / Android Keystore). It never touches AsyncStorage.
 */
import { useEffect, useRef, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { randomUUID } from 'expo-crypto';
import { useWebSocket } from './useWebSocket';
import { useAgentStore } from '../store/agentStore';
import type { InboundMessage } from '../types/protocol';

const SESSION_TOKEN_KEY = 'agent_session_token';
const RELAY_URL_KEY = 'agent_relay_url';

export interface AgentConnectionActions {
  /** Exchange a pairing code for a session token. */
  pair: (relayUrl: string, pairingCode: string) => Promise<void>;
  /** Send a chat message to the agent. */
  sendChat: (text: string) => void;
  /** Hand off the current chat context as an autonomous background task. */
  startTask: (context: string) => void;
  /** Request the list of GitHub repos from the agent. */
  fetchRepos: () => void;
  /** Disconnect and clear stored credentials. */
  disconnect: () => Promise<void>;
}

export function useAgentConnection(): AgentConnectionActions {
  const { state, dispatch } = useAgentStore();

  // Build the authenticated relay URL (null until we have a session)
  const relayWsUrl = state.relayUrl && state.sessionToken
    ? `${state.relayUrl}?type=mobile&sessionToken=${state.sessionToken}`
    : null;

  const { send, lastMessage } = useWebSocket(relayWsUrl);

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
  useEffect(() => {
    if (!lastMessage) return;
    void handleInbound(lastMessage);
  // handleInbound is stable (defined below with useCallback)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage]);

  const handleInbound = useCallback(
    async (msg: InboundMessage): Promise<void> => {
      switch (msg.type) {
        case 'session_ok': {
          // This branch is handled inside `pair()` via a one-shot WebSocket
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
          // Could be task log or chat chunk — route by whether task is active
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
          // Fire a local push notification
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
          // If repos haven't loaded yet, this error is from the repo fetch — stop the spinner
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
            const msg = JSON.parse(event.data as string) as { type: string; sessionToken?: string; message?: string };
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
    (text: string): void => {
      if (!state.sessionToken || !state.selectedRepo) return;

      const msgId = randomUUID();
      dispatch({ type: 'CHAT_USER_MESSAGE', id: msgId, text });

      send({
        type: 'chat_message',
        sessionId: state.sessionToken,
        text,
        repoFullName: state.selectedRepo.fullName,
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
    await SecureStore.deleteItemAsync(RELAY_URL_KEY);
    dispatch({ type: 'SESSION_CLOSED' });
  }, [dispatch]);

  return { pair, sendChat, startTask, fetchRepos, disconnect };
}
