import type { RpcInput } from "@getpaseo/plugin";
import { execFile } from "node:child_process";
import { z } from "zod";
import {
  type checkoutStackBranchRpc,
  type StackState,
  stackBranchSchema,
  type trackRemoteStackRpc,
  type viewStackRpc,
} from "../shared/stack";
import { currentPullRequestSchema, remoteStackListSchema, remoteStackState } from "./remote-stack";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

class CommandNotFoundError extends Error {}

function run(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      // GH_PROMPT_DISABLED keeps gh from waiting on a TTY that does not exist.
      { cwd, timeout: 30_000, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new CommandNotFoundError(`${command} not found on PATH`));
          return;
        }
        if (error && typeof error.code !== "number") {
          reject(error);
          return;
        }
        resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout, stderr });
      },
    );
  });
}

function failureMessage(result: CommandResult): string {
  const text = (result.stderr || result.stdout).trim().replace(/^✗\s*/, "");
  return text || `Command exited with code ${result.code}`;
}

const ghStackViewSchema = z.object({
  trunk: z.string(),
  currentBranch: z.string(),
  branches: z.array(stackBranchSchema),
});

async function currentBranch(directory: string): Promise<string | null> {
  const result = await run("git", ["branch", "--show-current"], directory);
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : null;
}

type RemoteLookup = Extract<StackState, { status: "stack" }> | null;

// The panel polls, and the remote lookup costs two GitHub API calls, so reuse results briefly.
const REMOTE_TTL_MS = 60_000;
const remoteCache = new Map<string, { expiresAt: number; lookup: Promise<RemoteLookup> }>();

function findRemoteStack(directory: string, branch: string): Promise<RemoteLookup> {
  const key = `${directory}\0${branch}`;
  const cached = remoteCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.lookup;
  const lookup = lookupRemoteStack(directory).catch((error: unknown) => {
    console.error(`Remote stack lookup failed in ${directory}:`, error);
    return null;
  });
  remoteCache.set(key, { expiresAt: Date.now() + REMOTE_TTL_MS, lookup });
  return lookup;
}

async function lookupRemoteStack(directory: string): Promise<RemoteLookup> {
  const pr = await run("gh", ["pr", "view", "--json", "number,url,headRefName"], directory);
  // No pull request for this branch.
  if (pr.code !== 0) return null;
  const pullRequest = currentPullRequestSchema.parse(JSON.parse(pr.stdout));

  const stacks = await run(
    "gh",
    ["api", `repos/{owner}/{repo}/stacks?pull_request=${pullRequest.number}`],
    directory,
  );
  // 404 means stacked PRs are not enabled for the repository.
  if (stacks.code !== 0) {
    if (/HTTP 404/.test(stacks.stderr)) return null;
    throw new Error(failureMessage(stacks));
  }
  const [stack] = remoteStackListSchema.parse(JSON.parse(stacks.stdout));
  // `gh stack checkout` refuses fully merged stacks, so there is nothing to offer.
  return stack?.open ? remoteStackState(stack, pullRequest) : null;
}

async function readStack(directory: string): Promise<StackState> {
  let result: CommandResult;
  try {
    result = await run("gh", ["stack", "view", "--json"], directory);
  } catch (error) {
    if (error instanceof CommandNotFoundError) return { status: "unavailable", reason: "gh-missing" };
    throw error;
  }
  if (result.code !== 0) {
    if (/unknown command "stack"/.test(result.stderr)) {
      return { status: "unavailable", reason: "gh-stack-missing" };
    }
    if (/not part of a stack/.test(result.stderr)) {
      const branch = await currentBranch(directory);
      const remote = branch ? await findRemoteStack(directory, branch) : null;
      return remote ?? { status: "none", currentBranch: branch };
    }
    throw new Error(failureMessage(result));
  }
  const view = ghStackViewSchema.parse(JSON.parse(result.stdout));
  return { status: "stack", source: "local", ...view };
}

export function viewStack({ directory }: RpcInput<typeof viewStackRpc>): Promise<StackState> {
  return readStack(directory);
}

export async function checkoutStackBranch({
  directory,
  branch,
}: RpcInput<typeof checkoutStackBranchRpc>): Promise<StackState> {
  const stack = await readStack(directory);
  if (stack.status !== "stack") throw new Error("This workspace is no longer on a stacked branch.");
  const known = [stack.trunk, ...stack.branches.map((entry) => entry.name)];
  if (!known.includes(branch)) throw new Error(`${branch} is not part of this stack.`);
  if (stack.source === "remote") throw new Error("Check out this stack with gh stack first.");
  if (branch === stack.currentBranch) return stack;

  const result = await run("git", ["switch", branch], directory);
  if (result.code !== 0) throw new Error(failureMessage(result));
  return readStack(directory);
}

export async function trackRemoteStack({
  directory,
}: RpcInput<typeof trackRemoteStackRpc>): Promise<StackState> {
  const stack = await readStack(directory);
  if (stack.status !== "stack" || stack.source !== "remote" || !stack.stackNumber) {
    throw new Error("No untracked GitHub stack found for this branch.");
  }
  const result = await run("gh", ["stack", "checkout", String(stack.stackNumber)], directory);
  for (const key of remoteCache.keys()) {
    if (key.startsWith(`${directory}\0`)) remoteCache.delete(key);
  }
  if (result.code !== 0) throw new Error(failureMessage(result));

  const tracked = await readStack(directory);
  // gh stack exits 0 when it declines, e.g. for a stack whose PRs are all merged.
  if (tracked.status !== "stack" || tracked.source !== "local") {
    throw new Error(failureMessage({ ...result, code: 1 }));
  }
  return tracked;
}
