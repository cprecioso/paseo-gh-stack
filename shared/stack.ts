import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const stackBranchSchema = z.object({
  name: z.string(),
  isCurrent: z.boolean(),
  isMerged: z.boolean(),
  isQueued: z.boolean(),
  needsRebase: z.boolean(),
  pr: z
    .object({
      number: z.number(),
      url: z.string().optional(),
      state: z.string(),
    })
    .optional(),
});

export type StackBranch = z.infer<typeof stackBranchSchema>;

export const stackStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum(["gh-missing", "gh-stack-missing"]),
  }),
  z.object({
    status: z.literal("none"),
    currentBranch: z.string().nullable(),
  }),
  z.object({
    status: z.literal("stack"),
    trunk: z.string(),
    currentBranch: z.string(),
    // Ordered bottom (closest to trunk) to top, as `gh stack view --json` reports them.
    branches: z.array(stackBranchSchema),
  }),
]);

export type StackState = z.infer<typeof stackStateSchema>;

export const viewStackRpc = defineRpc({
  name: "stack.view",
  input: z.object({ directory: z.string() }),
  output: stackStateSchema,
});

export const checkoutStackBranchRpc = defineRpc({
  name: "stack.checkout",
  input: z.object({ directory: z.string(), branch: z.string() }),
  output: stackStateSchema,
});
