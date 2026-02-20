import { simpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

/**
 * Manages local clones of GitHub repositories.
 *
 * Each repo is cloned once under `workspaceRoot/<owner>_<repo>/` and
 * subsequently kept up-to-date with a `git pull` before each operation.
 */
export class GitManager {
  constructor(private readonly workspaceRoot: string) {}

  /**
   * Ensures a local clone of `fullName` exists and is up to date.
   * Returns the absolute path to the repo directory.
   */
  async ensureRepo(fullName: string, cloneUrl: string): Promise<string> {
    const dir = this.repoPath(fullName);

    if (existsSync(path.join(dir, '.git'))) {
      await simpleGit(dir).pull(['--no-rebase']);
    } else {
      await fs.mkdir(dir, { recursive: true });
      await simpleGit().clone(cloneUrl, dir);
    }

    return dir;
  }

  /**
   * Creates a new local branch and checks it out.
   */
  async createBranch(repoDir: string, branchName: string): Promise<void> {
    await simpleGit(repoDir).checkoutLocalBranch(branchName);
  }

  /**
   * Stages all changes, creates a commit, and pushes the branch to `origin`.
   */
  async commitAndPush(repoDir: string, message: string, branchName: string): Promise<void> {
    const git = simpleGit(repoDir);

    const status = await git.status();
    if (status.files.length === 0) {
      throw new Error('No changes to commit');
    }

    await git.add('.');
    await git.commit(message, { '--no-verify': null });
    await git.push('origin', branchName, ['--set-upstream']);
  }

  /**
   * Returns the current branch name of the local clone.
   */
  async getCurrentBranch(repoDir: string): Promise<string> {
    const status = await simpleGit(repoDir).status();
    return status.current ?? 'main';
  }

  /**
   * Returns true if there are any uncommitted changes (staged or unstaged).
   */
  async hasChanges(repoDir: string): Promise<boolean> {
    const status = await simpleGit(repoDir).status();
    return status.files.length > 0;
  }

  /**
   * Checks out an existing branch, or creates and checks out a new one.
   */
  async checkoutBranch(repoDir: string, branchName: string): Promise<void> {
    const git = simpleGit(repoDir);
    const branches = await git.branchLocal();
    if (branches.all.includes(branchName)) {
      await git.checkout(branchName);
    } else {
      await git.checkoutLocalBranch(branchName);
    }
  }

  /**
   * Stages all changes, commits, and force-pushes to `branchName`, then
   * restores the workspace to `defaultBranch` so the next `ensureRepo` pull
   * starts from a clean state.
   */
  async commitAndPushToBranch(
    repoDir: string,
    branchName: string,
    message: string,
    defaultBranch: string
  ): Promise<void> {
    const git = simpleGit(repoDir);
    await git.add('.');
    await git.commit(message, { '--no-verify': null });
    await git.push('origin', branchName, ['--set-upstream', '--force-with-lease']);
    await git.checkout(defaultBranch);
  }

  /**
   * Derives a branch name from a free-form task description.
   * Format: `claude-mobile/<slug>-<timestamp>`
   */
  generateBranchName(taskDescription: string): string {
    const slug = taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 50)
      .replace(/-+$/, '');

    const timestamp = Date.now().toString(36);
    return `claude-mobile/${slug}-${timestamp}`;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private repoPath(fullName: string): string {
    // Replace `/` with `_` so the path is a flat directory name
    return path.join(this.workspaceRoot, fullName.replace('/', '_'));
  }
}
