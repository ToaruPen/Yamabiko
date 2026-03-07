export interface ReviewJobPayload {
  headSha: string;
  pullRequestNumber: number;
  repositoryName: string;
  repositoryOwner: string;
  runId: string;
}
