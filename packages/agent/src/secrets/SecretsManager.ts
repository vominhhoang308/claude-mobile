/**
 * SecretsManager — stores and retrieves agent credentials.
 *
 * Priority:
 *  1. OS native keychain via `keytar` (macOS Keychain / Linux libsecret).
 *     Used on developer laptops and GUI Linux desktops.
 *  2. Environment variables.
 *     Used on headless VPS deployments (Railway, Render, Fly.io) where
 *     secrets are injected at deploy time and keytar is unavailable.
 *
 * This means:
 *  - On a VPS, the operator sets CLAUDE_API_KEY / GITHUB_TOKEN / etc.
 *    in the platform's secret manager — SecretsManager reads them from env.
 *  - On a developer Mac/Linux, SecretsManager uses the OS keychain so secrets
 *    are never stored in plain text on disk or in env.
 */

const KEYTAR_SERVICE = 'claude-mobile-agent';

export type ClaudeAuthMethod = 'oauth' | 'apikey';

export interface AgentSecrets {
  /**
   * How the agent authenticates the `claude` CLI.
   * 'oauth'  — use the existing OAuth session in ~/.claude/ (default)
   * 'apikey' — inject ANTHROPIC_API_KEY from the stored key below
   */
  claudeAuthMethod: ClaudeAuthMethod;
  /**
   * Only used when claudeAuthMethod === 'apikey'.
   * Not required when relying on the OAuth session.
   */
  claudeApiKey: string;
  githubToken: string;
  agentToken: string;
  relayUrl: string;
}

// Minimal keytar interface we need
interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export class SecretsManager {
  private keytar: Keytar | null = null;

  async init(): Promise<void> {
    try {
      // keytar is an optional dependency — may not be present on headless VPS
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.keytar = require('keytar') as Keytar;
    } catch {
      this.keytar = null;
    }
  }

  async get(key: keyof AgentSecrets): Promise<string | null> {
    if (this.keytar) {
      const value = await this.keytar.getPassword(KEYTAR_SERVICE, key);
      if (value) return value;
    }
    return this.fromEnv(key);
  }

  async set(key: keyof AgentSecrets, value: string): Promise<void> {
    if (this.keytar) {
      await this.keytar.setPassword(KEYTAR_SERVICE, key, value);
      return;
    }
    throw new Error(
      `keytar is not available — cannot persist secrets. ` +
        `Set the ${envKeyFor(key)} environment variable instead.`
    );
  }

  async delete(key: keyof AgentSecrets): Promise<void> {
    if (this.keytar) {
      await this.keytar.deletePassword(KEYTAR_SERVICE, key);
    }
  }

  /** Returns all configured secrets (partial if some are missing). */
  async getAll(): Promise<Partial<AgentSecrets>> {
    const keys: (keyof AgentSecrets)[] = [
      'claudeAuthMethod',
      'claudeApiKey',
      'githubToken',
      'agentToken',
      'relayUrl',
    ];
    const result: Partial<AgentSecrets> = {};
    for (const key of keys) {
      const value = await this.get(key);
      if (value) {
        // Cast needed: `get()` returns `string | null` but some fields
        // (e.g. `claudeAuthMethod`) are narrower union types.
        (result as Record<string, string>)[key] = value;
      }
    }
    return result;
  }

  private fromEnv(key: keyof AgentSecrets): string | null {
    return process.env[envKeyFor(key)] ?? null;
  }
}

function envKeyFor(key: keyof AgentSecrets): string {
  const map: Record<keyof AgentSecrets, string> = {
    claudeAuthMethod: 'CLAUDE_AUTH_METHOD',
    claudeApiKey: 'CLAUDE_API_KEY',
    githubToken: 'GITHUB_TOKEN',
    agentToken: 'AGENT_TOKEN',
    relayUrl: 'RELAY_URL',
  };
  return map[key];
}
