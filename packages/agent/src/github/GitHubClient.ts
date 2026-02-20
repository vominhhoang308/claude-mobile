import { Octokit } from '@octokit/rest';
import type { Repository } from '../types/protocol';

/**
 * Thin wrapper around Octokit for the operations the agent needs.
 *
 * Credentials stay here — they never leave the agent process.
 */
export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /** Returns repos belonging to the authenticated user, sorted by last update. */
  async listRepositories(): Promise<Repository[]> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
    });

    return data.map((repo) => ({
      id: repo.id,
      fullName: repo.full_name,
      description: repo.description ?? null,
      defaultBranch: repo.default_branch,
      language: repo.language ?? null,
      private: repo.private,
      updatedAt: repo.updated_at ?? new Date().toISOString(),
    }));
  }

  /**
   * Opens a pull request and returns its HTML URL.
   */
  async createPullRequest(params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<string> {
    const { data } = await this.octokit.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
    });
    return data.html_url;
  }

  /** Returns the default branch for a repository. */
  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data.default_branch;
  }

  /**
   * Builds an authenticated HTTPS clone URL for the given repo.
   * The token is embedded in the URL — only used for local `git clone`.
   */
  buildCloneUrl(fullName: string, token: string): string {
    return `https://${encodeURIComponent(token)}@github.com/${fullName}.git`;
  }
}
