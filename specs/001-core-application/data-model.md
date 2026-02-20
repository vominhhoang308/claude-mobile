# Data Model: Core Application (001)

All entities below exist either in-memory (relay DO, mobile store) or in the OS keychain/environment (agent secrets). There is no database.

---

## Agent — `AgentSecrets`

Stored in OS keychain (keytar) or environment variables. Never transmitted.

| Field | Type | Validation | Storage |
|---|---|---|---|
| `claudeAuthMethod` | `'oauth' \| 'apikey'` | Required; defaults to `'oauth'` | keychain / `CLAUDE_AUTH_METHOD` env |
| `claudeApiKey` | `string` | Required only when `claudeAuthMethod === 'apikey'`; format `sk-ant-*` | keychain / `CLAUDE_API_KEY` env |
| `githubToken` | `string` | Required; must have `repo`, `workflow` scopes | keychain / `GITHUB_TOKEN` env |
| `agentToken` | `string` | Required; UUID v4 generated at setup | keychain / `AGENT_TOKEN` env |
| `relayUrl` | `string` | Required; valid `wss://` URL | keychain / `RELAY_URL` env |

---

## Relay DO — `AgentEntry` (in-memory)

Lives inside the `AgentRegistry` Durable Object. Destroyed when the DO hibernates (agents reconnect automatically).

| Field | Type | Notes |
|---|---|---|
| `ws` | `WebSocket` | The agent's live CF WebSocket handle |
| `pairingCode` | `string` | 6-digit numeric string; single-use |
| `connectedAt` | `number` | `Date.now()` at registration time |

**Registry maps** (in-memory, scoped to the DO instance):

| Map | Key | Value | Lifecycle |
|---|---|---|---|
| `agents` | `agentToken` | `AgentEntry` | Until agent disconnects |
| `pairingCodes` | `pairingCode` | `agentToken` | Deleted on first successful mobile pair |
| `sessions` | `sessionToken` | `agentToken` | Until mobile disconnects |
| `mobileConnections` | `sessionToken` | `WebSocket` | Until mobile disconnects |

---

## Mobile — `AgentState` (React Context store)

In-memory; rebuilt from `expo-secure-store` on app launch.

| Field | Type | Notes |
|---|---|---|
| `isConnected` | `boolean` | True when WS is open and `sessionToken` valid |
| `relayUrl` | `string \| null` | Persisted in `expo-secure-store` |
| `sessionToken` | `string \| null` | Persisted in `expo-secure-store`; UUID |
| `repositories` | `Repository[]` | Fetched via agent on demand |
| `selectedRepo` | `Repository \| null` | Set when user opens a repo |
| `chatMessages` | `ChatMessage[]` | Cleared when `selectedRepo` changes |
| `task` | `TaskState \| null` | Active background task |

### `Repository`

Returned by the agent (proxied from GitHub API).

| Field | Type |
|---|---|
| `id` | `number` |
| `fullName` | `string` — `owner/repo` |
| `description` | `string \| null` |
| `defaultBranch` | `string` |
| `language` | `string \| null` |
| `private` | `boolean` |
| `updatedAt` | `string` — ISO 8601 |

### `ChatMessage`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUID; used as React key and for streaming append |
| `role` | `'user' \| 'assistant'` | |
| `text` | `string` | Accumulated from `stream_chunk` events |
| `isStreaming` | `boolean` | True while chunks are still arriving |

### `TaskState`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUID |
| `logs` | `string` | Accumulated `stream_chunk` text |
| `prUrl` | `string \| null` | Set on `task_done` |
| `prTitle` | `string \| null` | Set on `task_done` |

**State transitions:**

```
null
  → TASK_STARTED { id }            → TaskState { logs: '', prUrl: null }
  → TASK_LOG_CHUNK { chunk }       → logs += chunk
  → TASK_DONE { prUrl, prTitle }   → prUrl set
  → TASK_RESET                     → null
```

---

## Agent — Git workspace (filesystem)

Repos are cloned to `~/.claude-mobile/repos/<owner>_<repo>/` on first access.

| Path | Contents |
|---|---|
| `~/.claude-mobile/repos/` | Root of all local clones |
| `~/.claude-mobile/repos/<owner>_<repo>/` | One directory per repository |

**Branch naming convention** (created by `GitManager.generateBranchName`):

```
claude-mobile/<slug>-<base36-timestamp>
```

Example: `claude-mobile/fix-failing-tests-1oqxz4k`
