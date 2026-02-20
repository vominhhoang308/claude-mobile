#!/usr/bin/env node
/**
 * Interactive setup wizard for the agent (local machine / laptop path).
 *
 * Guides the user through:
 *  1. Choosing Claude authentication method (OAuth session or API key)
 *  2. Entering their GitHub Personal Access Token
 *  3. Confirming the relay URL (defaults to production)
 *  4. Connecting to the relay and displaying a pairing code
 *
 * Secrets are stored in the OS keychain via SecretsManager.
 */
import * as readline from 'readline';
import { randomUUID } from 'crypto';
import { SecretsManager } from '../secrets/SecretsManager';
import { RelayClient } from '../relay/RelayClient';
import type { AgentMessage } from '../types/protocol';
import type { ClaudeAuthMethod } from '../secrets/SecretsManager';

const DEFAULT_RELAY_URL = 'wss://relay.claude-mobile.app';

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function runSetup(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  printBanner();

  const secrets = new SecretsManager();
  await secrets.init();

  // ── Claude authentication method ────────────────────────────────────────────
  const existingAuthMethod = await secrets.get('claudeAuthMethod') as ClaudeAuthMethod | null;

  let authMethod: ClaudeAuthMethod;

  if (existingAuthMethod) {
    const label = existingAuthMethod === 'oauth' ? 'OAuth session' : 'API key';
    console.log(`✓  Claude auth: ${label} (already configured)`);
    authMethod = existingAuthMethod;
  } else {
    console.log('  How should the agent authenticate with Claude?\n');
    console.log('  [1] Use existing OAuth session (default)');
    console.log('      Recommended if you have already run: claude auth login');
    console.log('  [2] Use API key');
    console.log('      Required on headless VPS, or if you prefer explicit credentials\n');

    const choice = await prompt(rl, '  Choice [1]: ');

    if (choice === '2') {
      authMethod = 'apikey';
    } else if (choice === '1' || choice === '') {
      authMethod = 'oauth';
    } else {
      console.error('  Invalid choice. Enter 1 or 2.');
      rl.close();
      process.exit(1);
    }

    await secrets.set('claudeAuthMethod', authMethod);
  }

  // ── API key (only when authMethod === 'apikey') ─────────────────────────────
  if (authMethod === 'apikey') {
    const existingClaudeKey = await secrets.get('claudeApiKey');

    if (existingClaudeKey) {
      console.log('✓  Claude API key already configured');
    } else {
      console.log('\n  Get your API key at: https://console.anthropic.com/settings/keys\n');
      const claudeApiKey = await prompt(rl, '  Claude API key: ');
      if (!claudeApiKey) {
        console.error('  Error: API key is required when using apikey auth method.');
        rl.close();
        process.exit(1);
      }
      await secrets.set('claudeApiKey', claudeApiKey);
      console.log('  ✓ Saved\n');
    }
  } else {
    console.log('  ℹ  The agent will use the OAuth session stored in ~/.claude/');
    console.log('     Make sure you have run: claude auth login\n');
  }

  // ── GitHub Personal Access Token ────────────────────────────────────────────
  const existingGithubToken = await secrets.get('githubToken');
  let githubToken: string;

  if (existingGithubToken) {
    console.log('✓  GitHub token already configured');
    githubToken = existingGithubToken;
  } else {
    console.log('  Create a token at: https://github.com/settings/tokens/new');
    console.log('  Required scopes: repo, workflow\n');
    githubToken = await prompt(rl, '  GitHub Personal Access Token: ');
    if (!githubToken) {
      console.error('Error: GitHub token is required');
      rl.close();
      process.exit(1);
    }
    await secrets.set('githubToken', githubToken);
    console.log('  ✓ Saved\n');
  }

  // ── Relay URL ───────────────────────────────────────────────────────────────
  const existingRelayUrl = await secrets.get('relayUrl');
  let relayUrl: string;

  if (existingRelayUrl) {
    console.log(`✓  Relay URL: ${existingRelayUrl}`);
    relayUrl = existingRelayUrl;
  } else {
    const input = await prompt(rl, `  Relay URL [${DEFAULT_RELAY_URL}]: `);
    relayUrl = input || DEFAULT_RELAY_URL;
    await secrets.set('relayUrl', relayUrl);
  }

  // ── Agent token (generate once, persist forever) ────────────────────────────
  let agentToken = await secrets.get('agentToken');
  if (!agentToken) {
    agentToken = randomUUID();
    await secrets.set('agentToken', agentToken);
  }

  rl.close();

  // ── Connect to relay and get pairing code ───────────────────────────────────
  console.log('\n  Connecting to relay…');
  await connectAndDisplayPairingCode(relayUrl, agentToken);
}

async function connectAndDisplayPairingCode(
  relayUrl: string,
  agentToken: string
): Promise<void> {
  const client = new RelayClient(relayUrl, agentToken);

  await new Promise<void>((resolve) => {
    client.onMessage((msg: AgentMessage) => {
      if (msg.type === 'register_ok') {
        console.log('\n  ✓ Connected!\n');
        printPairingBox(msg.pairingCode);
        console.log('  Enter this code in the Claude on Mobile app to connect.\n');
        console.log('  Agent is running — press Ctrl+C to stop.\n');
        resolve();
      }
    });
    client.connect();
  });

  // Keep running so the agent stays connected
  process.on('SIGINT', () => {
    console.log('\n  Agent stopped.');
    client.disconnect();
    process.exit(0);
  });
}

function printBanner(): void {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Claude on Mobile — Agent Setup v0.1   ║');
  console.log('╚══════════════════════════════════════════╝\n');
}

function printPairingBox(code: string): void {
  console.log('  ┌─────────────────────────┐');
  console.log(`  │  Pairing code:  ${code}   │`);
  console.log('  └─────────────────────────┘');
}
