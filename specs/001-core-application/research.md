# Research: Core Application (001)

All decisions below were resolved through design discussion and confirmed during implementation.

---

## Decision 1 — Relay technology

**Decision**: Cloudflare Workers + Durable Objects
**Rationale**: Scales to zero (no idle cost), global edge, generous free tier, native WebSocket hibernation support in DOs, no servers to manage.
**Alternatives considered**:
- _Single Node.js process on VPS_ — simpler to understand but requires a second always-on server the team must operate; becomes a central point of failure and cost center. Kept as documented fallback for early traction.
- _Socket.io / Pusher_ — adds third-party dependency and per-message cost; relay should cost ~$0.

---

## Decision 2 — Agent language

**Decision**: TypeScript / Node.js
**Rationale**: Same language as the Claude Code CLI (also Node.js); `child_process.spawn` streams stdout natively; monorepo can share protocol types across all three packages without a serialisation boundary.
**Alternatives considered**:
- _Go_ — smaller binary, lower memory; but no shared types with mobile/relay, and spawning the `claude` CLI from Go adds no advantage over Node.
- _Rust_ — same reasoning as Go; excessive complexity for a process-spawner daemon.

---

## Decision 3 — Mobile framework (Expo vs. bare React Native)

**Decision**: Expo managed workflow (SDK 52)
**Rationale**: Constitution has a TODO(EXPO_VS_BARE) unresolved; Expo managed satisfies it while keeping setup friction minimal. All chosen packages (`expo-secure-store`, `expo-notifications`, `react-native-safe-area-context`) are compatible with Expo managed.
**Alternatives considered**:
- _Bare React Native_ — more control over native code; needed only if a future dependency requires custom native module linking. Can eject later.
- _Expo Router_ — file-based routing; not chosen because React Navigation gives explicit control over the auth-stack / app-stack split required by the pairing flow.

---

## Decision 4 — Mobile state management

**Decision**: React Context + `useReducer`
**Rationale**: State shape is narrow (session, repos, chat messages, one active task). No external library needed; zero bundle impact; fully type-safe with TypeScript discriminated unions.
**Alternatives considered**:
- _Zustand_ — good choice at ~3 kB; deferred until state complexity grows beyond what a reducer handles cleanly.
- _Redux Toolkit_ — substantial boilerplate for this state surface; constitution penalises unnecessary dependencies.
- _Jotai / Recoil_ — atomic models add indirection without benefit at MVP scale.

---

## Decision 5 — Claude Code authentication (agent-side)

**Decision**: User-selectable at setup time — **OAuth session (default)** or **API key**
**Rationale**:
- OAuth is the natural auth mode for developers who have Claude Code installed locally (`claude auth login` stored in `~/.claude/`). Requiring an API key from them is friction with no security benefit.
- API key via `ANTHROPIC_API_KEY` env var is mandatory on headless VPS (no browser for OAuth flow).
- Default to OAuth so the common case (developer on laptop) requires zero extra steps.

**Flow**:
```
setup wizard asks:
  [1] Use existing OAuth session (default) → skip API key prompt
  [2] Use API key                          → prompt, store in keychain
```
`index.ts` only sets `ANTHROPIC_API_KEY` when method = `apikey`; otherwise the `claude` child process inherits the OAuth session transparently.
**Alternatives considered**:
- _API key only_ — simpler code path but forces developers to create and manage a separate key even when OAuth is already set up.
- _Auto-detect_ — check `~/.claude/` for an existing session and fall back to API key; rejected because silent fallback is opaque and hard to debug.

---

## Decision 6 — Agent secrets storage

**Decision**: `keytar` (OS native keychain) with environment variable fallback
**Rationale**: Keychain (macOS Keychain / Linux libsecret) is the correct primitive for secrets at rest on a developer machine. `keytar` is an optional dependency so it gracefully degrades on headless VPS where it cannot install (no dbus/libsecret). VPS deployments set `CLAUDE_API_KEY`, `GITHUB_TOKEN`, `AGENT_TOKEN`, `RELAY_URL` as platform secrets (Railway/Render/Fly inject them at deploy time).
**Alternatives considered**:
- _dotenv file_ — secrets visible in plain text on disk; unacceptable.
- _Encrypted file store_ — adds key management complexity; the OS keychain already solves this.
- _HashiCorp Vault / AWS Secrets Manager_ — over-engineered for a single-user daemon.

---

## Decision 7 — Mobile secrets storage

**Decision**: `expo-secure-store`
**Rationale**: Backed by iOS Keychain and Android Keystore; compatible with Expo managed workflow; constitution explicitly prohibits `AsyncStorage` for secrets. Stores only the `sessionToken` and `relayUrl` (non-sensitive config).
**Alternatives considered**:
- _react-native-keychain_ — constitution lists this; deferred in favour of `expo-secure-store` which is the Expo-native equivalent and avoids a bare-workflow dependency.

---

## Decision 8 — Git operations (agent)

**Decision**: `simple-git` npm package
**Rationale**: Clean async/await API; handles credential embedding in clone URLs; well-maintained; avoids shell injection risks from constructing raw `git` command strings.
**Alternatives considered**:
- _`child_process.spawn('git', ...)`_ — lower level, works everywhere, but requires manual stdout parsing and is error-prone for credential handling.
- _`nodegit` / `isomorphic-git`_ — full git implementations; heavy dependencies; overkill for clone + branch + commit + push.

---

## Decision 9 — GitHub API client (agent)

**Decision**: `@octokit/rest`
**Rationale**: Official GitHub SDK; full TypeScript types; handles pagination, rate-limit headers, auth token injection automatically. Constitution requires fetch() only for Claude API calls (Principle III); Octokit is appropriate for GitHub API.
**Alternatives considered**:
- _Raw `fetch()`_ — workable but loses type safety and requires manual header management.
- _GitHub GraphQL (`@octokit/graphql`)_ — more powerful for complex queries; unnecessary for MVP use case (list repos, create PR).

---

## Decision 10 — Relay session token model

**Decision**: Pairing code (6-digit, single-use) → UUID session token (persistent per session)
**Rationale**: Short numeric code is easy for a user to read from a terminal and type into a mobile app. The code is exchanged for a longer UUID session token immediately; the code becomes invalid after first use to prevent replay. Session token is stored in `expo-secure-store` and reused across app restarts without re-pairing.
**Alternatives considered**:
- _QR code only_ — friendlier UX long-term; deferred to post-MVP (requires camera permission, additional package).
- _Long-lived agent token in mobile_ — storing the `agentToken` on mobile would mean the mobile app can impersonate the agent; the indirection through pairing codes + session tokens keeps the `agentToken` server-side only.

---

## Decision 11 — WebSocket reconnection strategy (agent)

**Decision**: Fixed 5-second reconnect interval with unlimited retries
**Rationale**: Simple to reason about; VPS agents should reconnect quickly after transient relay restarts. The relay is stateless so there is no in-flight state to recover.
**Alternatives considered**:
- _Exponential backoff_ — better for high-traffic shared services to avoid thundering herd; not needed at MVP user scale (one agent per user).
- _No reconnect_ — unacceptable; agent would go silent after any relay deploy or network blip.
