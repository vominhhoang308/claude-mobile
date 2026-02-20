# Tasks: Core Application

**Input**: Design documents from `/specs/001-core-application/`
**Plan**: `specs/001-core-application/plan.md`
**User stories**: Derived from plan.md MVP scope (no spec.md — see Implementation note below)

> **Implementation note**: The monorepo scaffold (all source files, config, and initial tests) was
> generated during the planning session. Tasks here start from that baseline and carry the
> implementation to a fully verified, tested, and shippable state. Each phase delivers an
> independently runnable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency conflicts)
- **[Story]**: Which user story ([US1]–[US4])
- Tasks without a story label are setup/foundational/polish

---

## Phase 1: Setup (Dependency Installation & Config)

**Purpose**: Install all packages and fix any configuration gaps in the generated scaffold before any code can run.

- [ ] T001 Run `npm install` from repo root to install all workspaces dependencies
- [ ] T002 Add `expo-crypto` to `apps/mobile/package.json` dependencies (used by `useAgentConnection.ts` for `randomUUID` — missing from initial scaffold)
- [ ] T003 [P] Verify `apps/mobile/jest.config.js` `setupFilesAfterFramework` key is correct for the installed jest-expo version; fix if needed
- [ ] T004 [P] Add `@types/node` to `packages/agent/devDependencies` if not resolved by `npm install` (required for `process`, `Buffer`, `child_process` types)

**Checkpoint**: `npm install` exits 0 with no unresolved peer-dependency errors

---

## Phase 2: Foundational (Build + Lint Verification)

**Purpose**: Confirm the scaffold compiles cleanly and all existing tests pass. No user story work begins until this phase is green.

**⚠️ CRITICAL**: All gates below must pass before Phase 3.

- [ ] T005 [P] Run `tsc --noEmit` in `packages/relay` — resolve any type errors
- [ ] T006 [P] Run `tsc --noEmit` in `packages/agent` — resolve any type errors (focus: `child_process`, `Buffer`, `process.env` types)
- [ ] T007 [P] Run `tsc --noEmit` in `apps/mobile` — resolve any type errors (focus: `expo-crypto`, navigation prop types)
- [ ] T008 Run ESLint across monorepo (`npm run lint` from root) and fix all warnings to reach zero-warning gate (Constitution Principle II)
- [ ] T009 [P] Run existing relay tests (`cd packages/relay && npm test`) — confirm `AgentRegistry.test.ts` passes
- [ ] T010 [P] Run existing agent tests (`cd packages/agent && npm test`) — confirm `RelayClient.test.ts` and `ClaudeRunner.test.ts` pass
- [ ] T011 [P] Run existing mobile tests (`cd apps/mobile && npm test`) — confirm `ChatScreen.test.tsx` and `useWebSocket.test.ts` pass

**Checkpoint**: All three packages compile, lint, and test green — foundation is stable

---

## Phase 3: User Story 1 — Agent Setup & Pairing (Priority: P1) 🎯 MVP

**Goal**: A developer can run `npx @claude-mobile/agent setup`, choose between OAuth session and API key authentication, store GitHub credentials, connect to the relay, and receive a pairing code. A second developer on mobile can enter that code and get a valid `sessionToken`.

**Independent Test**:
1. `cd packages/agent && npm run setup` — wizard presents auth method choice; choosing `[1]` skips API key prompt; choosing `[2]` prompts for key
2. Agent connects to `wrangler dev` relay and prints a 6-digit pairing code
3. Sending `{"type":"mobile_connect","pairingCode":"<code>"}` over a WebSocket to the local relay returns `{"type":"session_ok","sessionToken":"<uuid>"}`

### Tests for User Story 1

- [ ] T012 [P] [US1] Write `SecretsManager.test.ts` in `packages/agent/src/__tests__/secrets/SecretsManager.test.ts` covering: `claudeAuthMethod` defaults to `'oauth'` when unset; `get()` falls back to env var when keytar absent; `set()` throws a clear error on headless env without keytar; `getAll()` omits `claudeApiKey` when `claudeAuthMethod === 'oauth'`
- [ ] T013 [P] [US1] Write `OnboardingScreen.test.tsx` in `apps/mobile/src/__tests__/screens/OnboardingScreen.test.tsx` covering: pairing code field only accepts 6 numeric digits; Connect button disabled until exactly 6 digits entered; error banner shown on failed `pair()` call; loading spinner shown during pairing

### Implementation for User Story 1

- [ ] T014 [US1] Verify setup wizard auth choice in `packages/agent/src/setup/setup.ts`: pressing Enter (empty input) selects OAuth and skips API key step; entering `2` prompts for key; invalid input exits with error
- [ ] T015 [US1] Verify `packages/agent/src/index.ts` startup logic: `claudeAuthMethod === 'oauth'` does NOT set `ANTHROPIC_API_KEY`; `claudeAuthMethod === 'apikey'` with missing key exits with clear error; `claudeAuthMethod === 'apikey'` with key present sets env var
- [ ] T016 [US1] Verify relay pairing flow against `wrangler dev`: start agent with `RELAY_URL=ws://localhost:8787`; confirm `register_ok` received; confirm 6-digit `pairingCode` printed; send `mobile_connect` via `wscat` or similar; confirm `session_ok` with UUID returned

**Checkpoint**: Agent setup wizard works, relay pairing produces a valid session token

---

## Phase 4: User Story 2 — Repository Browsing (Priority: P1) 🎯 MVP

**Goal**: After pairing, the mobile app shows the authenticated user's GitHub repositories (name, description, language, private badge), fetched via the agent — the GitHub token never leaves the agent machine.

**Independent Test**:
1. Agent connected to relay; mobile paired
2. Mobile sends `{"type":"repo_list","sessionId":"<token>"}` — relay forwards to agent
3. Agent calls GitHub API and relays back `repo_list_result` with a populated `repos` array
4. `RepositoryListScreen` renders the list; pull-to-refresh re-fetches

### Tests for User Story 2

- [ ] T017 [P] [US2] Write `GitHubClient.test.ts` in `packages/agent/src/__tests__/github/GitHubClient.test.ts` covering: `listRepositories` maps Octokit response fields to `Repository` shape; `null` description/language coerced to `null`; `createPullRequest` returns `html_url` from Octokit response; `buildCloneUrl` embeds token correctly
- [ ] T018 [P] [US2] Write `RepositoryListScreen.test.tsx` in `apps/mobile/src/__tests__/screens/RepositoryListScreen.test.tsx` covering: shows loading spinner when `repositories` is empty; renders repo name, description, language badge from store; private badge shown only for private repos; tapping a row navigates to `Chat` screen with correct `repoFullName` param; pull-to-refresh calls `fetchRepos`

### Implementation for User Story 2

- [ ] T019 [US2] Verify `handleRepoList` in `packages/agent/src/index.ts`: mock `GitHubClient.listRepositories` to return 2 repos; confirm `repo_list_result` message sent via relay with correct shape per `contracts/websocket-protocol.md`
- [ ] T020 [US2] Verify `useAgentConnection.fetchRepos` in `apps/mobile/src/hooks/useAgentConnection.ts` dispatches `REPOS_LOADED` on `repo_list_result` and updates `state.repositories`

**Checkpoint**: Full repo-list flow works from paired mobile → agent → GitHub API → FlatList display

---

## Phase 5: User Story 3 — Chat + Streaming (Priority: P1) 🎯 MVP

**Goal**: After selecting a repository, the developer can type a message and see Claude Code's response stream token-by-token into the chat bubble in real time.

**Independent Test**:
1. Send `chat_message` from mobile with a question about the selected repo
2. Agent spawns `claude -p "<question>"` in the cloned repo directory
3. `stream_chunk` messages arrive at mobile with partial text; each chunk appends to the last assistant bubble
4. `stream_end` fires; streaming cursor disappears; message is selectable

### Tests for User Story 3

- [ ] T021 [P] [US3] Write `agentStore.test.ts` in `apps/mobile/src/__tests__/store/agentStore.test.ts` covering: `CHAT_USER_MESSAGE` appends to `chatMessages`; `CHAT_ASSISTANT_START` appends with `isStreaming: true`; `CHAT_ASSISTANT_CHUNK` appends to correct message by `id`; `CHAT_ASSISTANT_END` sets `isStreaming: false`; `REPO_SELECTED` clears `chatMessages`
- [ ] T022 [P] [US3] Expand `ChatScreen.test.tsx` in `apps/mobile/src/__tests__/screens/ChatScreen.test.tsx` covering: streaming cursor `▌` shown while `isStreaming` true; cursor hidden after `stream_end`; "Run autonomously" button absent with no messages; "Run autonomously" button visible after ≥1 exchange; send button shows `ActivityIndicator` while streaming
- [ ] T023 [P] [US3] Write `useAgentConnection.test.ts` in `apps/mobile/src/__tests__/hooks/useAgentConnection.test.ts` covering: `sendChat` sends correct `chat_message` frame; inbound `stream_chunk` dispatches `CHAT_ASSISTANT_CHUNK`; inbound `stream_end` dispatches `CHAT_ASSISTANT_END`; inbound `error` appends error text as assistant message

### Implementation for User Story 3

- [ ] T024 [US3] Verify `handleChatMessage` in `packages/agent/src/index.ts`: confirm `ensureRepo` is called when `repoFullName` provided; confirm `ClaudeRunner.run` receives the correct `workingDir` and `prompt`; confirm each stdout chunk is forwarded as `stream_chunk`; confirm `stream_end` sent after run completes
- [ ] T025 [US3] Verify `GitManager.ensureRepo` in `packages/agent/src/git/GitManager.ts`: write tests in `packages/agent/src/__tests__/git/GitManager.test.ts` covering clone on first access (no `.git` dir), pull on subsequent access, `repoPath` sanitises the `/` in `owner/repo`

**Checkpoint**: Full chat flow works — mobile sends message, agent runs Claude Code, response streams back token-by-token

---

## Phase 6: User Story 4 — Autonomous Task + PR + Notification (Priority: P2)

**Goal**: The developer taps "Run autonomously", the agent creates a branch, runs Claude Code non-interactively, commits and pushes changes, opens a PR, and the mobile app receives a push notification with the PR URL.

**Independent Test**:
1. Send `task_start` with `context`, `repoFullName`, `baseBranch`
2. Agent creates branch `claude-mobile/<slug>-<ts>`
3. Agent runs `claude --dangerously-skip-permissions -p "<context>"`, streaming `stream_chunk` messages
4. Agent commits, pushes, creates PR via GitHub API
5. Mobile receives `task_done { prUrl, prTitle }`
6. `expo-notifications` fires a local notification with the PR title
7. `TaskStatusScreen` shows accumulated log + PR card with "Open PR in GitHub" button

### Tests for User Story 4

- [ ] T026 [P] [US4] Write `GitManager.test.ts` in `packages/agent/src/__tests__/git/GitManager.test.ts` covering: `generateBranchName` produces `claude-mobile/<slug>-<ts>` format; slugifies uppercase, punctuation, excess spaces; `commitAndPush` throws `'No changes to commit'` when no modified files; branch name truncated to ≤60 chars total
- [ ] T027 [P] [US4] Write `TaskStatusScreen.test.tsx` in `apps/mobile/src/__tests__/screens/TaskStatusScreen.test.tsx` covering: spinner shown while `task.prUrl` is null; log text appended as `TASK_LOG_CHUNK` dispatches; PR card with title shown after `TASK_DONE`; "Open PR in GitHub" button calls `Linking.openURL` with `prUrl`; "Done" button dispatches `TASK_RESET` and navigates back
- [ ] T028 [P] [US4] Expand `agentStore.test.ts` in `apps/mobile/src/__tests__/store/agentStore.test.ts` covering: `TASK_STARTED` creates task with empty logs; `TASK_LOG_CHUNK` appends to `task.logs`; `TASK_DONE` sets `prUrl` and `prTitle`; `TASK_RESET` sets `task` to null

### Implementation for User Story 4

- [ ] T029 [US4] Verify `handleTaskStart` in `packages/agent/src/index.ts`: branch created before `ClaudeRunner.run`; `commitAndPush` called after run; `GitHubClient.createPullRequest` called with correct `head` (new branch) and `base` (`msg.baseBranch`); `task_done` sent on success; `error` message sent on any thrown exception
- [ ] T030 [US4] Verify `useAgentConnection` task handling in `apps/mobile/src/hooks/useAgentConnection.ts`: `task_done` dispatches `TASK_DONE`; `Notifications.scheduleNotificationAsync` called with `prTitle` as body and `prUrl` in `data`; `stream_chunk` routes to `TASK_LOG_CHUNK` when `state.task !== null`

**Checkpoint**: Full task flow works — chat → "Run autonomously" → agent branch + commit + PR → push notification → PR card in app

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: CI pipeline, missing screen tests, App Store compliance gate, and README.

- [ ] T031 [P] Create `.github/workflows/ci.yml` with jobs: `lint` (ESLint zero warnings), `typecheck` (tsc --noEmit per package), `test-agent` (jest packages/agent), `test-mobile` (jest apps/mobile) — all run on push and PR
- [ ] T032 [P] Write `SettingsScreen.test.tsx` in `apps/mobile/src/__tests__/screens/SettingsScreen.test.tsx` covering: connected status dot is green when `isConnected: true`; relay URL shown (scheme stripped); disconnect button triggers `Alert.alert`; confirming disconnect calls `disconnect()` and navigates to top
- [ ] T033 [P] Create `apps/mobile/ios/PrivacyInfo.xcprivacy` declaring `NSPrivacyAccessedAPITypes` (required by App Store; triggers rejection if absent — Constitution Principle IV)
- [ ] T034 Create `README.md` at repo root: architecture diagram, 5-step quickstart (relay + agent + mobile), "Deploy to Railway" badge placeholder, link to `specs/001-core-application/quickstart.md`
- [ ] T035 Run full `quickstart.md` validation end-to-end: `npm install` → `wrangler dev` → `npm run setup` (agent, local relay) → `npx expo start` → pair → send chat message → run autonomous task
- [ ] T036 [P] Run Metro bundle size check on `apps/mobile`: confirm total gzipped JS bundle < 3 MB (Constitution Principle VI gate); document result in plan.md Complexity Tracking

**Checkpoint**: CI green on all gates, quickstart validated, App Store compliance prerequisites met

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Requires Phase 1 complete — **BLOCKS** all user story phases
- **Phase 3 (US1)**: Requires Phase 2 complete
- **Phase 4 (US2)**: Requires Phase 2 complete; benefits from US1 (pairing) being done first but independently testable
- **Phase 5 (US3)**: Requires Phase 2 complete; requires US2 (repo selected) in the end-to-end flow but independently testable
- **Phase 6 (US4)**: Requires Phase 2 complete; requires US3 (chat context) in the full flow but independently testable
- **Phase 7 (Polish)**: Requires all desired user story phases complete

### User Story Dependencies

- **US1 (Pairing)**: Foundational only — no other user story dependency
- **US2 (Repos)**: Foundational only — independently testable with a mock agent
- **US3 (Chat)**: Foundational only — independently testable; repo cloning is internal to agent
- **US4 (Autonomous)**: Foundational only — independently testable; chat context is just a string

### Within Each User Story

- Write tests **first** (per Constitution Principle V TDD gate); confirm they fail before implementation
- Within a story: test tasks → agent-side implementation → mobile-side implementation → integration verify
- All `[P]`-marked tasks within a phase can be dispatched simultaneously to parallel agents

---

## Parallel Execution Examples

### Phase 2 (all parallel after T001–T004)

```bash
# Dispatch simultaneously:
Task: "Run tsc --noEmit in packages/relay"           # T005
Task: "Run tsc --noEmit in packages/agent"           # T006
Task: "Run tsc --noEmit in apps/mobile"              # T007
Task: "Run existing relay tests"                     # T009
Task: "Run existing agent tests"                     # T010
Task: "Run existing mobile tests"                    # T011
# Then after all pass:
Task: "Run ESLint across monorepo"                   # T008
```

### Phase 3 — US1 tests (parallel)

```bash
Task: "Write SecretsManager.test.ts"                 # T012
Task: "Write OnboardingScreen.test.tsx"              # T013
```

### Phase 5 — US3 tests (parallel)

```bash
Task: "Write agentStore.test.ts (chat reducers)"     # T021
Task: "Expand ChatScreen.test.tsx"                   # T022
Task: "Write useAgentConnection.test.ts"             # T023
Task: "Write GitManager.test.ts"                     # T025
```

### Phase 6 — US4 tests (parallel)

```bash
Task: "Write GitManager.test.ts (task methods)"      # T026
Task: "Write TaskStatusScreen.test.tsx"              # T027
Task: "Expand agentStore.test.ts (task reducers)"    # T028
```

---

## Implementation Strategy

### MVP Scope (P1 stories — minimum shippable)

Complete Phases 1–5 (US1, US2, US3). This delivers:
- Agent setup with OAuth/API key choice
- Mobile pairing via 6-digit code
- GitHub repo browsing via agent proxy
- Real-time streaming chat with Claude Code

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T011)
3. Complete Phase 3: US1 — Agent setup + pairing (T012–T016)
4. **STOP and VALIDATE**: run quickstart steps 1–4; agent + relay + pairing working
5. Complete Phase 4: US2 — Repo list (T017–T020)
6. Complete Phase 5: US3 — Chat streaming (T021–T025)
7. **STOP and VALIDATE**: full chat flow end-to-end
8. Demo / internal TestFlight build

### Full MVP (all P1+P2 stories)

Add Phase 6 (US4 — autonomous task + PR + notification) after the above is validated.

### Parallel Team Strategy

With two developers after Phase 2:
- **Developer A**: US1 + US2 (pairing + repo list)
- **Developer B**: US3 + US4 (chat + task)
- Both merge when complete; Polish phase is independent of story parallelism

---

## Notes

- `[P]` tasks touch different files and have no incomplete-task dependencies — safe to dispatch in parallel
- Constitution Principle V (TDD) is **non-negotiable**: every `[USN]` test task must be written and confirmed failing before its corresponding implementation task starts
- All `stream_chunk` messages must be dispatched immediately on receipt — buffering until `stream_end` violates Principle VI
- `expo-secure-store` is the Expo-managed substitute for `react-native-keychain` (see Complexity Tracking in plan.md) — do not replace it
- Pairing code is single-use by design (see `research.md` Decision 10); do not change this behaviour
