# Quickstart: Running the Full Stack Locally

This guide gets the relay, agent, and mobile app running on a single developer machine for end-to-end testing.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| npm | 10+ | bundled with Node |
| Wrangler CLI | 3.x | `npm i -g wrangler` |
| Expo CLI | latest | `npm i -g expo-cli` |
| Claude Code CLI | latest | `npm i -g @anthropic-ai/claude-code` |
| Expo Go | any | iOS App Store / Google Play |

---

## Step 1 — Install dependencies

```bash
# From repo root
npm install
```

---

## Step 2 — Start the relay locally

```bash
cd packages/relay
npm run dev
# Wrangler starts the Worker at http://localhost:8787
# WebSocket endpoint: ws://localhost:8787
```

---

## Step 3 — Set up and start the agent

```bash
cd packages/agent

# First time: run the setup wizard
npm run setup

# Wizard prompts:
#   Claude auth: [1] OAuth session (default)  [2] API key
#   GitHub token: ghp_...
#   Relay URL: ws://localhost:8787   ← use local relay for dev
#
# After setup, the agent prints:
#   ┌─────────────────────────┐
#   │  Pairing code:  482910  │
#   └─────────────────────────┘

# Subsequent starts (no wizard):
npm run dev
```

---

## Step 4 — Start the mobile app

```bash
cd apps/mobile
npx expo start
# Scan the QR code with Expo Go (iOS/Android)
```

---

## Step 5 — Pair mobile ↔ agent

1. On the Onboarding screen, set **Relay URL** to `ws://localhost:8787` (or your machine's LAN IP if testing on a physical device — `ws://192.168.x.x:8787`).
2. Enter the 6-digit pairing code from the agent terminal.
3. Tap **Connect** — the app navigates to the repository list.

---

## Step 6 — Run an end-to-end test

1. Select a repository from the list.
2. Type: `list all TypeScript files in this project`
3. Watch the response stream token-by-token in the chat bubble.
4. Type a task description, then tap **Run autonomously**.
5. Watch the Task Status screen stream agent logs.
6. Receive a push notification when the PR is created.

---

## Running tests

```bash
# Agent unit tests
cd packages/agent && npm test

# Relay unit tests (uses vitest)
cd packages/relay && npm test

# Mobile unit + integration tests
cd apps/mobile && npm test

# All packages from root
npm test --workspaces
```

---

## VPS deployment (production path)

For an always-on agent on Railway:

1. Fork `github.com/claude-mobile/agent` (open-source agent repo).
2. Click **Deploy to Railway** in the agent README.
3. Railway prompts for:
   - `CLAUDE_AUTH_METHOD` = `apikey`
   - `CLAUDE_API_KEY` = your Anthropic key
   - `GITHUB_TOKEN` = your PAT
   - `RELAY_URL` = `wss://relay.claude-mobile.app`
4. Railway injects env vars and starts the agent container.
5. The agent logs a pairing code — visible in the Railway deployment dashboard.
6. Enter the code in the mobile app's Onboarding screen → connected.

---

## Environment variables (VPS reference)

| Variable | Required | Notes |
|---|---|---|
| `CLAUDE_AUTH_METHOD` | Yes | `oauth` or `apikey` |
| `CLAUDE_API_KEY` | When method=`apikey` | Anthropic API key |
| `GITHUB_TOKEN` | Yes | PAT with `repo`, `workflow` scopes |
| `AGENT_TOKEN` | Yes | UUID generated at first setup; identifies this agent to the relay |
| `RELAY_URL` | Yes | `wss://relay.claude-mobile.app` (prod) or `ws://localhost:8787` (dev) |
