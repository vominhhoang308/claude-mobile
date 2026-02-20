/**
 * Unit tests for SecretsManager.
 *
 * Covers the keytar → env var fallback chain, the claudeAuthMethod default,
 * and the special handling when keytar is unavailable (headless VPS).
 */

import { SecretsManager } from '../../secrets/SecretsManager';

// ─── Mock keytar ──────────────────────────────────────────────────────────────

const keytarStore: Record<string, string> = {};
let keytarAvailable = true;

jest.mock('keytar', () => ({
  getPassword: (_svc: string, account: string) =>
    Promise.resolve(keytarStore[account] ?? null),
  setPassword: (_svc: string, account: string, password: string) => {
    keytarStore[account] = password;
    return Promise.resolve();
  },
  deletePassword: (_svc: string, account: string) => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete keytarStore[account];
    return Promise.resolve(true);
  },
}), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeManager(withKeytar = true): Promise<SecretsManager> {
  keytarAvailable = withKeytar;
  // Patch require to throw when keytar should be unavailable
  const original = jest.requireActual<typeof import('module')>('module');
  if (!withKeytar) {
    jest.mock('keytar', () => { throw new Error('keytar not available'); }, { virtual: true });
  }
  const sm = new SecretsManager();
  await sm.init();
  // Restore mock if we changed it
  if (!withKeytar) {
    jest.resetModules();
  }
  return sm;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SecretsManager', () => {
  beforeEach(() => {
    // Clear keytar store
    Object.keys(keytarStore).forEach((k) => { delete keytarStore[k]; });
    // Clear relevant env vars
    delete process.env['CLAUDE_AUTH_METHOD'];
    delete process.env['CLAUDE_API_KEY'];
    delete process.env['GITHUB_TOKEN'];
    delete process.env['AGENT_TOKEN'];
    delete process.env['RELAY_URL'];
  });

  describe('get() — keytar available', () => {
    it('returns null when key not set', async () => {
      const sm = await makeManager();
      expect(await sm.get('githubToken')).toBeNull();
    });

    it('returns value stored via set()', async () => {
      const sm = await makeManager();
      await sm.set('githubToken', 'ghp_abc123');
      expect(await sm.get('githubToken')).toBe('ghp_abc123');
    });

    it('returns env var as fallback when keytar has no value', async () => {
      process.env['GITHUB_TOKEN'] = 'env-token';
      const sm = await makeManager();
      expect(await sm.get('githubToken')).toBe('env-token');
    });
  });

  describe('claudeAuthMethod default', () => {
    it('returns null (not "oauth") when nothing is stored', async () => {
      const sm = await makeManager();
      // The SecretsManager.get() returns raw stored value; caller applies the default
      expect(await sm.get('claudeAuthMethod')).toBeNull();
    });

    it('returns stored auth method when set', async () => {
      const sm = await makeManager();
      await sm.set('claudeAuthMethod', 'oauth');
      expect(await sm.get('claudeAuthMethod')).toBe('oauth');
    });

    it('reads auth method from CLAUDE_AUTH_METHOD env var', async () => {
      process.env['CLAUDE_AUTH_METHOD'] = 'apikey';
      const sm = await makeManager();
      expect(await sm.get('claudeAuthMethod')).toBe('apikey');
    });
  });

  describe('getAll()', () => {
    it('returns partial secrets — only what is set', async () => {
      const sm = await makeManager();
      await sm.set('githubToken', 'ghp_token');
      await sm.set('relayUrl', 'wss://relay.test');

      const secrets = await sm.getAll();
      expect(secrets.githubToken).toBe('ghp_token');
      expect(secrets.relayUrl).toBe('wss://relay.test');
      expect(secrets.agentToken).toBeUndefined();
      expect(secrets.claudeApiKey).toBeUndefined();
    });
  });

  describe('env var fallback', () => {
    it('falls back to env vars when all secrets are unset in keychain', async () => {
      process.env['AGENT_TOKEN'] = 'env-agent-uuid';
      process.env['RELAY_URL'] = 'wss://env-relay.test';

      const sm = await makeManager();
      expect(await sm.get('agentToken')).toBe('env-agent-uuid');
      expect(await sm.get('relayUrl')).toBe('wss://env-relay.test');
    });
  });

  describe('set() — keytar unavailable (headless VPS)', () => {
    it('throws a descriptive error when keytar is not available', async () => {
      // Simulate keytar load failure by overriding require
      const sm = new SecretsManager();
      // Don't call init() so keytar is null
      await expect(sm.set('githubToken', 'ghp_token')).rejects.toThrow(
        'keytar is not available'
      );
    });
  });
});
