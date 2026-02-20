# WebSocket Protocol Contract

All communication uses JSON-encoded text frames over WebSocket (no binary frames).

**Implemented in**: `packages/relay/src/types/protocol.ts`, `packages/agent/src/types/protocol.ts`, `apps/mobile/src/types/protocol.ts`

---

## Connection model

```
Mobile App ──WS──► Relay (Cloudflare DO) ──WS──► Agent (Node.js daemon)
           ◄──────                        ◄──────
```

The relay is a transparent forwarder. It adds `sessionId` to messages forwarded from mobile→agent for routing, and uses `sessionId` to route agent→mobile replies.

---

## Phase 1 — Agent Registration

### Agent connects

```
GET wss://relay.example.com/?type=agent&agentToken=<UUID>
Upgrade: websocket
```

### Agent → Relay: `agent_register`

Sent immediately after the WebSocket opens.

```jsonc
{
  "type": "agent_register",
  "agentToken": "550e8400-e29b-41d4-a716-446655440000",
  "version": "0.1.0"
}
```

### Relay → Agent: `register_ok`

```jsonc
{
  "type": "register_ok",
  "pairingCode": "482910"   // 6-digit numeric, single-use
}
```

---

## Phase 2 — Mobile Pairing

### Mobile connects (before session)

```
GET wss://relay.example.com/?type=mobile
Upgrade: websocket
```

### Mobile → Relay: `mobile_connect`

```jsonc
{
  "type": "mobile_connect",
  "pairingCode": "482910"
}
```

### Relay → Mobile: `session_ok`

```jsonc
{
  "type": "session_ok",
  "sessionToken": "7c9e6679-7425-40de-944b-e07fc1f90ae7"   // UUID v4
}
```

Mobile persists `sessionToken` in `expo-secure-store`. The pairing code is now invalid.

### Error response (invalid code)

```jsonc
{
  "type": "error",
  "message": "Invalid or expired pairing code"
}
```

---

## Phase 3 — Authenticated Mobile Connection

### Mobile reconnects (after pairing)

```
GET wss://relay.example.com/?type=mobile&sessionToken=<UUID>
Upgrade: websocket
```

All subsequent messages are forwarded between mobile and agent via the relay.

---

## Messages: Mobile → Agent (forwarded by relay)

The relay stamps `sessionId` = `sessionToken` on all forwarded messages.

### `repo_list`

```jsonc
{
  "type": "repo_list",
  "sessionId": "<sessionToken>"
}
```

### `chat_message`

```jsonc
{
  "type": "chat_message",
  "sessionId": "<sessionToken>",
  "text": "explain the auth module",
  "repoFullName": "owner/my-repo"   // optional — omit for no-repo context
}
```

### `task_start`

```jsonc
{
  "type": "task_start",
  "sessionId": "<sessionToken>",
  "context": "<full chat context as plain text>",
  "repoFullName": "owner/my-repo",
  "baseBranch": "main"
}
```

### `ping`

Sent by the agent as a heartbeat (every 30 s). Mobile may also send.

```jsonc
{
  "type": "ping",
  "sessionId": "<sessionToken>"
}
```

---

## Messages: Agent → Mobile (forwarded by relay)

### `repo_list_result`

```jsonc
{
  "type": "repo_list_result",
  "sessionId": "<sessionToken>",
  "repos": [
    {
      "id": 123456789,
      "fullName": "owner/my-repo",
      "description": "A cool project",
      "defaultBranch": "main",
      "language": "TypeScript",
      "private": false,
      "updatedAt": "2026-01-15T10:30:00Z"
    }
  ]
}
```

### `stream_chunk`

```jsonc
{
  "type": "stream_chunk",
  "sessionId": "<sessionToken>",
  "text": "Running tests...\n"   // partial stdout/stderr from claude CLI
}
```

### `stream_end`

```jsonc
{
  "type": "stream_end",
  "sessionId": "<sessionToken>"
}
```

### `task_done`

```jsonc
{
  "type": "task_done",
  "sessionId": "<sessionToken>",
  "prUrl": "https://github.com/owner/my-repo/pull/42",
  "prTitle": "Claude on Mobile: fix the failing tests"
}
```

### `pong`

```jsonc
{
  "type": "pong",
  "sessionId": "<sessionToken>"
}
```

### `error`

```jsonc
{
  "type": "error",
  "sessionId": "<sessionToken>",    // optional — absent for relay-level errors
  "message": "Agent disconnected"
}
```

---

## Error taxonomy

| `message` | Source | Mobile action |
|---|---|---|
| `"Invalid or expired pairing code"` | Relay, pairing phase | Show error, allow retry |
| `"Session expired — reconnect"` | Relay, post-session | Clear token, show onboarding |
| `"Agent disconnected"` | Relay, forwarding phase | Show warning in chat |
| `"No changes to commit"` | Agent, task phase | Stream to task log |
| `"Failed to spawn 'claude': …"` | Agent, claude runner | Stream to chat as error |

---

## Connection lifecycle

```
Agent boots
  → connect wss/?type=agent&agentToken=X
  → send agent_register
  → receive register_ok { pairingCode }
  → [heartbeat ping every 30s]
  → [auto-reconnect after 5s on disconnect]

Mobile first launch
  → connect wss/?type=mobile (no sessionToken)
  → user enters pairingCode
  → send mobile_connect { pairingCode }
  → receive session_ok { sessionToken }
  → persist sessionToken in expo-secure-store
  → close and reopen wss/?type=mobile&sessionToken=X

Mobile subsequent launches
  → read sessionToken from expo-secure-store
  → connect wss/?type=mobile&sessionToken=X
  → [ready to send/receive messages]
```
