import type { StackState } from "../shared/stack";

export type StackDirection = "up" | "down";

// Mirrors `gh stack up` / `gh stack down`: moves one branch away from or toward the trunk.
export function adjacentBranch(state: StackState, direction: StackDirection): string {
  if (state.status !== "stack") throw new Error("This workspace is not on a stacked branch.");
  if (state.source === "remote") throw new Error("Check out this stack from the Stack panel first.");
  const names = state.branches.map((branch) => branch.name);
  const index = names.indexOf(state.currentBranch);
  if (index === -1) throw new Error(`${state.currentBranch} is not part of this stack.`);
  const next = names[direction === "up" ? index + 1 : index - 1];
  if (!next) throw new Error(direction === "up" ? "Already at the top of the stack." : "Already at the bottom of the stack.");
  return next;
}
