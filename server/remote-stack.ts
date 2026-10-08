import { z } from "zod";
import type { StackState } from "../shared/stack";

// Shape of GET /repos/{owner}/{repo}/stacks, the GitHub Stacks REST API that `gh stack` uses.
const remoteStackSchema = z.object({
  number: z.number(),
  open: z.boolean(),
  base: z.object({ ref: z.string() }),
  pull_requests: z.array(
    z.object({
      number: z.number(),
      state: z.string(),
      merged_at: z.string().nullable().optional(),
      head: z.object({ ref: z.string() }),
    }),
  ),
});

export const remoteStackListSchema = z.array(remoteStackSchema);

export const currentPullRequestSchema = z.object({
  number: z.number(),
  url: z.string(),
  headRefName: z.string(),
});

type RemoteStack = z.infer<typeof remoteStackSchema>;
type CurrentPullRequest = z.infer<typeof currentPullRequestSchema>;

export function remoteStackState(
  stack: RemoteStack,
  pullRequest: CurrentPullRequest,
): Extract<StackState, { status: "stack" }> {
  const pullUrlPrefix = pullRequest.url.replace(/\/pull\/\d+$/, "/pull/");
  return {
    status: "stack",
    source: "remote",
    stackNumber: stack.number,
    trunk: stack.base.ref,
    currentBranch: pullRequest.headRefName,
    branches: stack.pull_requests.map((entry) => {
      const isMerged = Boolean(entry.merged_at);
      return {
        name: entry.head.ref,
        isCurrent: entry.head.ref === pullRequest.headRefName,
        isMerged,
        isQueued: false,
        needsRebase: false,
        pr: {
          number: entry.number,
          url: `${pullUrlPrefix}${entry.number}`,
          state: isMerged ? "MERGED" : entry.state.toUpperCase(),
        },
      };
    }),
  };
}
