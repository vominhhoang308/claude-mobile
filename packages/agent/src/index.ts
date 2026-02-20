#!/usr/bin/env node
/**
 * Agent daemon entry point.
 *
 * Usage:
 *   node dist/index.js           — start the agent (requires prior setup)
 *   node dist/index.js setup     — run the interactive setup wizard
 */
import path from 'path';
import os from 'os';
import { SecretsManager } from './secrets/SecretsManager';
import { RelayClient } from './relay/RelayClient';
import { ClaudeRunner } from './claude/ClaudeRunner';
import { GitManager } from './git/GitManager';
import { GitHubClient } from './github/GitHubClient';
import { runSetup } from './setup/setup';
import type {
  AgentMessage,
  ChatMessageMessage,
  TaskStartMessage,
  RepoListRequestMessage,
  StreamChunkMessage,
  StreamEndMessage,
  TaskDoneMessage,
  RepoListResultMessage,
  ErrorMessage,
} from './types/protocol';

const WORKSPACE_ROOT = path.join(os.homedir(), '.claude-mobile', 'repos');

async function main(): Promise<void> {
  if (process.argv.includes('setup')) {
    await runSetup();
    return;
  }

  const secrets = new SecretsManager();
  await secrets.init();

  const claudeAuthMethod = (await secrets.get('claudeAuthMethod')) ?? 'oauth';
  const claudeApiKey = await secrets.get('claudeApiKey');
  const githubToken = await secrets.get('githubToken');
  const agentToken = await secrets.get('agentToken');
  const relayUrl = await secrets.get('relayUrl');

  // claudeApiKey is only required when the user chose API key auth
  const missingApiKey = claudeAuthMethod === 'apikey' && !claudeApiKey;

  if (missingApiKey || !githubToken || !agentToken || !relayUrl) {
    console.error(
      'Agent is not configured. Run the setup wizard:\n\n' +
        '  npx @claude-mobile/agent setup\n'
    );
    process.exit(1);
  }

  // Only inject the API key when the user explicitly chose that auth method.
  // Otherwise the `claude` CLI uses its own OAuth session from ~/.claude/
  if (claudeAuthMethod === 'apikey' && claudeApiKey) {
    process.env['ANTHROPIC_API_KEY'] = claudeApiKey;
    console.log('[agent] Claude auth: API key');
  } else {
    console.log('[agent] Claude auth: OAuth session');
  }

  const relay = new RelayClient(relayUrl, agentToken);
  const claudeRunner = new ClaudeRunner();
  const gitManager = new GitManager(WORKSPACE_ROOT);
  const githubClient = new GitHubClient(githubToken);

  relay.onMessage((msg: AgentMessage) => {
    void dispatch(msg, relay, claudeRunner, gitManager, githubClient, githubToken);
  });

  relay.connect();
  console.log('[agent] Running — press Ctrl+C to stop.');

  process.on('SIGINT', () => {
    console.log('\n[agent] Shutting down…');
    relay.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    relay.disconnect();
    process.exit(0);
  });
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

async function dispatch(
  msg: AgentMessage,
  relay: RelayClient,
  claudeRunner: ClaudeRunner,
  gitManager: GitManager,
  githubClient: GitHubClient,
  githubToken: string
): Promise<void> {
  switch (msg.type) {
    case 'register_ok':
      console.log(`[agent] Registered. Pairing code: ${msg.pairingCode}`);
      break;

    case 'repo_list':
      await handleRepoList(relay, githubClient, msg);
      break;

    case 'chat_message':
      await handleChatMessage(relay, claudeRunner, gitManager, githubToken, msg);
      break;

    case 'task_start':
      await handleTaskStart(relay, claudeRunner, gitManager, githubClient, githubToken, msg);
      break;

    case 'pong':
      // Heartbeat response — no action needed
      break;

    default:
      // Ignore other message types (stream_chunk, stream_end, etc. come from relay)
      break;
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleRepoList(
  relay: RelayClient,
  githubClient: GitHubClient,
  msg: RepoListRequestMessage
): Promise<void> {
  try {
    const repos = await githubClient.listRepositories();
    const reply: RepoListResultMessage = { type: 'repo_list_result', sessionId: msg.sessionId, repos };
    relay.send(reply);
  } catch (err) {
    sendError(relay, msg.sessionId, err);
  }
}

async function handleChatMessage(
  relay: RelayClient,
  claudeRunner: ClaudeRunner,
  gitManager: GitManager,
  githubToken: string,
  msg: ChatMessageMessage
): Promise<void> {
  const workingDir = msg.repoFullName
    ? await ensureRepo(gitManager, githubToken, msg.repoFullName)
    : process.cwd();

  try {
    await claudeRunner.run({
      workingDir,
      prompt: msg.text,
      onChunk: (chunk) => {
        const reply: StreamChunkMessage = {
          type: 'stream_chunk',
          sessionId: msg.sessionId,
          text: chunk,
        };
        relay.send(reply);
      },
    });
  } catch (err) {
    sendError(relay, msg.sessionId, err);
    return;
  }

  const end: StreamEndMessage = { type: 'stream_end', sessionId: msg.sessionId };
  relay.send(end);
}

async function handleTaskStart(
  relay: RelayClient,
  claudeRunner: ClaudeRunner,
  gitManager: GitManager,
  githubClient: GitHubClient,
  githubToken: string,
  msg: TaskStartMessage
): Promise<void> {
  const streamChunk = (text: string): void => {
    const reply: StreamChunkMessage = { type: 'stream_chunk', sessionId: msg.sessionId, text };
    relay.send(reply);
  };

  let repoDir: string;
  try {
    repoDir = await ensureRepo(gitManager, githubToken, msg.repoFullName);
  } catch (err) {
    sendError(relay, msg.sessionId, err);
    return;
  }

  const branchName = gitManager.generateBranchName(msg.context.slice(0, 100));

  try {
    await gitManager.createBranch(repoDir, branchName);
    streamChunk(`\n[agent] Branch created: ${branchName}\n`);

    await claudeRunner.run({
      workingDir: repoDir,
      prompt: msg.context,
      autonomous: true,
      onChunk: streamChunk,
    });

    streamChunk(`\n[agent] Committing and pushing changes…\n`);
    await gitManager.commitAndPush(
      repoDir,
      `Applied via Claude on Mobile\n\nTask: ${msg.context.slice(0, 72)}`,
      branchName
    );

    streamChunk(`\n[agent] Opening pull request…\n`);
    const [owner, repo] = msg.repoFullName.split('/');
    const prTitle = `Claude on Mobile: ${msg.context.slice(0, 70)}`;
    const prUrl = await githubClient.createPullRequest({
      owner,
      repo,
      title: prTitle,
      body:
        `Applied via [Claude on Mobile](https://github.com/claude-mobile).\n\n` +
        `## Task\n\n${msg.context}`,
      head: branchName,
      base: msg.baseBranch,
    });

    const done: TaskDoneMessage = {
      type: 'task_done',
      sessionId: msg.sessionId,
      prUrl,
      prTitle,
    };
    relay.send(done);
  } catch (err) {
    sendError(relay, msg.sessionId, err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureRepo(
  gitManager: GitManager,
  githubToken: string,
  fullName: string
): Promise<string> {
  const cloneUrl = `https://${encodeURIComponent(githubToken)}@github.com/${fullName}.git`;
  return gitManager.ensureRepo(fullName, cloneUrl);
}

function sendError(relay: RelayClient, sessionId: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const msg: ErrorMessage = { type: 'error', sessionId, message };
  relay.send(msg);
}

void main();
