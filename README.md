# Claude on Mobile

Control Claude Code from your phone. Pair your mobile device with a local agent daemon through a Cloudflare relay to chat with Claude, browse repositories, and trigger autonomous coding tasks — all from iOS or Android.

```
Mobile App  ←—WebSocket—→  Cloudflare Relay  ←—WebSocket—→  Agent Daemon  →  Claude CLI
```

---

## Architecture

| Component | Location | Description |
|-----------|----------|-------------|
| **Relay** | `packages/relay/` | Cloudflare Workers service that pairs and routes messages between mobile and agent |
| **Agent** | `packages/agent/` | Node.js daemon running on your machine that executes Claude commands |
| **Mobile** | `apps/mobile/` | Expo/React Native app that provides the UI |

---

## Prerequisites

- **Node.js** 20+
- **npm** 9+
- **Cloudflare account** (free tier is fine) with `wrangler` CLI authenticated
- **Expo Go** app on your phone (or a simulator)
- **Claude** installed locally (`claude` CLI accessible in `$PATH`)
- **GitHub Personal Access Token** with `repo` and `workflow` scopes

---

## Step 1 — Deploy the Relay

The relay must be running before the agent or mobile app can connect.

```bash
cd packages/relay
npm install
npm run deploy
```

`wrangler deploy` will print the Worker URL, e.g.:
```
https://claude-mobile-relay.<your-subdomain>.workers.dev
```

Keep this URL — you will need it for both the agent and the mobile app.

**Local development (optional):**
```bash
npm run dev   # starts relay on http://localhost:8787
```

---

## Step 2 — Set Up and Run the Agent

The agent daemon runs on the same machine as your Claude installation.

### Install dependencies and build

```bash
cd packages/agent
npm install
npm run build
```

### Run the interactive setup wizard

```bash
npm run setup
```

The wizard will prompt for:
- **Claude auth method** — OAuth (uses `~/.claude/`) or API key
- **Claude API key** — if using API key auth
- **GitHub Personal Access Token**
- **Relay URL** — the Worker URL from Step 1 (use `wss://` not `https://`)
- Generates a unique **agent token** automatically

Secrets are stored in the OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Vault) via `keytar`, with environment variable fallback.

### Start the agent

```bash
npm run dev        # development (ts-node, no build required)
# or
node dist/index.js # production (after npm run build)
```

On startup the agent connects to the relay and receives a **6-digit pairing code** printed to the terminal:

```
[Agent] Connected to relay
[Agent] Pairing code: 482 931
```

Leave the agent running.

---

## Step 3 — Run the Mobile App

### Install dependencies

```bash
cd apps/mobile
npm install
```

### Start Expo

```bash
npm start        # opens Expo Dev Tools
```

Then open the app on your device using **Expo Go** (scan the QR code) or press `i`/`a` for iOS/Android simulator.

### Pair with the agent

1. On the **Onboarding** screen enter the relay URL (e.g. `wss://claude-mobile-relay.<subdomain>.workers.dev`)
2. Enter the 6-digit pairing code displayed by the agent
3. Tap **Connect**

A `sessionToken` is saved to the device's secure storage. You will not need to re-pair unless you reset the agent or clear the app's data.

---

## Root-Level Commands

From the monorepo root you can install all workspace dependencies at once:

```bash
npm install
```

---

## Environment Variable Fallback

If `keytar` is unavailable (e.g. CI, headless server), the agent reads secrets from environment variables:

| Variable | Description |
|----------|-------------|
| `CLAUDE_AUTH_METHOD` | `oauth` or `apikey` |
| `CLAUDE_API_KEY` | API key (if `apikey` auth) |
| `GITHUB_TOKEN` | GitHub PAT |
| `AGENT_TOKEN` | Unique identifier for this agent |
| `RELAY_URL` | WebSocket URL of the relay |

---

## Development Workflow

```
# Terminal 1 — relay (local)
cd packages/relay && npm run dev

# Terminal 2 — agent (watches relay on ws://localhost:8787)
cd packages/agent && RELAY_URL=ws://localhost:8787 npm run dev

# Terminal 3 — mobile
cd apps/mobile && npm start
```

When using the local relay, enter `ws://localhost:8787` as the relay URL in the mobile Onboarding screen. The mobile device must be on the same network as the relay (or use a tunnel such as `cloudflared` or `ngrok`).

---

## Project Structure

```
apps/
  mobile/           React Native / Expo app
packages/
  agent/            Node.js daemon (Claude runner + Git + GitHub)
  relay/            Cloudflare Workers relay (Durable Objects)
specs/              Feature specifications
```

---

## Tech Stack

- **Mobile**: React Native 0.81, Expo SDK 54, React Navigation 6
- **Agent**: Node.js 20, TypeScript 5.5, ws, simple-git, @octokit/rest
- **Relay**: Cloudflare Workers, Durable Objects, Wrangler 3
