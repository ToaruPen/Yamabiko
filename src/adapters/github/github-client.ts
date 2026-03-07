export interface PullRequestRef {
  owner: string;
  pullRequestNumber: number;
  repository: string;
}

export interface GitHubClient {
  createIssueComment(input: PullRequestRef & { body: string }): Promise<void>;
  getPullRequestHeadSha(input: PullRequestRef): Promise<string>;
}
