/**
 * Tests for ClaudeRunner — verifies correct CLI invocation and streaming.
 * The `child_process.spawn` call is mocked; no real `claude` binary is needed.
 */

import { ClaudeRunner } from '../../claude/ClaudeRunner';
import { EventEmitter } from 'events';

// ─── Stub ─────────────────────────────────────────────────────────────────────

interface MockChildProcess {
  stdout: EventEmitter;
  stderr: EventEmitter;
  on(event: 'close', fn: (code: number) => void): this;
  on(event: 'error', fn: (err: Error) => void): this;
}

let mockChild: MockChildProcess;
let capturedArgs: { cmd: string; args: string[]; options: Record<string, unknown> };

jest.mock('child_process', () => ({
  spawn: (cmd: string, args: string[], options: Record<string, unknown>) => {
    capturedArgs = { cmd, args, options };
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const emitter = new EventEmitter();

    mockChild = {
      stdout,
      stderr,
      on(event: string, fn: (...args: unknown[]) => void) {
        emitter.on(event, fn as (...args: unknown[]) => void);
        return this as unknown as MockChildProcess;
      },
    } as unknown as MockChildProcess;

    (mockChild as unknown as Record<string, unknown>)._emitClose = (code: number) => {
      emitter.emit('close', code);
    };
    (mockChild as unknown as Record<string, unknown>)._emitError = (err: Error) => {
      emitter.emit('error', err);
    };

    return mockChild;
  },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ClaudeRunner', () => {
  let runner: ClaudeRunner;

  beforeEach(() => {
    runner = new ClaudeRunner('claude');
  });

  describe('run()', () => {
    it('invokes claude with --dangerously-skip-permissions, -p, and the prompt', async () => {
      const runPromise = runner.run({ workingDir: '/tmp/repo', prompt: 'list files' });

      (mockChild as unknown as Record<string, (code: number) => void>)._emitClose(0);

      await runPromise;

      expect(capturedArgs.cmd).toBe('claude');
      expect(capturedArgs.args).toEqual(['--dangerously-skip-permissions', '-p', 'list files']);
      expect(capturedArgs.options).toMatchObject({ cwd: '/tmp/repo' });
    });

    it('always includes --dangerously-skip-permissions (no TTY to respond to prompts)', async () => {
      const runPromise = runner.run({ workingDir: '/tmp', prompt: 'hello' });
      (mockChild as unknown as Record<string, (code: number) => void>)._emitClose(0);
      await runPromise;
      expect(capturedArgs.args).toContain('--dangerously-skip-permissions');
    });
  });

  describe('run() — autonomous mode', () => {
    it('includes --dangerously-skip-permissions before -p', async () => {
      const runPromise = runner.run({
        workingDir: '/tmp/repo',
        prompt: 'fix the tests',
        autonomous: true,
      });

      (mockChild as unknown as Record<string, (code: number) => void>)._emitClose(0);
      await runPromise;

      expect(capturedArgs.args).toContain('--dangerously-skip-permissions');
      expect(capturedArgs.args.indexOf('--dangerously-skip-permissions')).toBeLessThan(
        capturedArgs.args.indexOf('-p')
      );
    });
  });

  describe('streaming', () => {
    it('calls onChunk for each stdout data event', async () => {
      const chunks: string[] = [];
      const runPromise = runner.run({
        workingDir: '/tmp',
        prompt: 'hello',
        onChunk: (c) => chunks.push(c),
      });

      mockChild.stdout.emit('data', Buffer.from('Running '));
      mockChild.stdout.emit('data', Buffer.from('tests…'));
      (mockChild as unknown as Record<string, (code: number) => void>)._emitClose(0);

      await runPromise;

      expect(chunks).toEqual(['Running ', 'tests…']);
    });

    it('calls onChunk for stderr output too', async () => {
      const chunks: string[] = [];
      const runPromise = runner.run({
        workingDir: '/tmp',
        prompt: 'hello',
        onChunk: (c) => chunks.push(c),
      });

      mockChild.stderr.emit('data', Buffer.from('Warning!'));
      (mockChild as unknown as Record<string, (code: number) => void>)._emitClose(0);

      await runPromise;

      expect(chunks).toContain('Warning!');
    });
  });

  describe('result', () => {
    it('returns the exit code', async () => {
      const runPromise = runner.run({ workingDir: '/tmp', prompt: 'x' });
      (mockChild as unknown as Record<string, (code: number) => void>)._emitClose(42);
      const result = await runPromise;
      expect(result.exitCode).toBe(42);
    });

    it('rejects on spawn error', async () => {
      const runPromise = runner.run({ workingDir: '/tmp', prompt: 'x' });
      // Spawn errors are delivered on the child process emitter, not stdout
      (mockChild as unknown as Record<string, (e: Error) => void>)._emitError(new Error('ENOENT'));

      await expect(runPromise).rejects.toThrow('ENOENT');
    });
  });
});
