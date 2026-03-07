export const REVIEW_EVENT_KINDS = [
  "issue_comment",
  "pull_request_review",
  "pull_request_review_comment",
] as const;

export type ReviewEventKind = (typeof REVIEW_EVENT_KINDS)[number];

export interface RepositoryRef {
  owner: string;
  name: string;
}

export interface ReviewFeedbackEvent {
  actorLogin: string;
  body: string;
  headSha: string | null;
  kind: ReviewEventKind;
  pullRequestNumber: number;
  receivedAt: string;
  repository: RepositoryRef;
}
