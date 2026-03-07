import { z } from "zod";

export const reviewJobPayloadSchema = z.object({
  headSha: z.string(),
  pullRequestNumber: z.number().int(),
  repositoryName: z.string(),
  repositoryOwner: z.string(),
  runId: z.string(),
});

export type ReviewJobPayload = z.infer<typeof reviewJobPayloadSchema>;
