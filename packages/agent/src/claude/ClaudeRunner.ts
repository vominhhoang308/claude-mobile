import { spawn } from 'child_process';

export interface RunOptions {
  workingDir: string;
  /** The prompt / task description to pass to Claude Code. */
  prompt: string;
  /**
   * When true, runs Claude Code non-interactively with permission prompts
   * bypassed — intended for autonomous task execution.
   */
  autonomous?: boolean;
  /** Called for each stdout chunk as it arrives. */
  onChunk?: (chunk: string) => void;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Thin wrapper around the `claude` CLI.
 *
 * Invocation: claude --dangerously-skip-permissions -p "<prompt>"
 *
 * `--dangerously-skip-permissions` is always set because the agent spawns Claude
 * as a headless child process with no TTY — there is nobody to respond to
 * interactive permission prompts.
 *
 * stdout/stderr are streamed in real time via `onChunk`.
 */
export class ClaudeRunner {
  constructor(private readonly claudeBin: string = 'claude') {}

  run(options: RunOptions): Promise<RunResult> {
    const { workingDir, prompt, onChunk } = options;

    return new Promise<RunResult>((resolve, reject) => {
      const args: string[] = [];

      // Always required — no TTY is available to respond to permission prompts
      // when Claude is spawned as a headless child process.
      args.push('--dangerously-skip-permissions');

      // -p runs Claude in print (non-interactive) mode
      args.push('-p', prompt);

      const child = spawn(this.claudeBin, args, {
        cwd: workingDir,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        onChunk?.(chunk);
      });

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        // Surface stderr as output too so the user sees any errors
        onChunk?.(chunk);
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn '${this.claudeBin}': ${err.message}`));
      });

      child.on('close', (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
  }
}
