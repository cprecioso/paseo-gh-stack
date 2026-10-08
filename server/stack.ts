import type { RpcInput } from "@getpaseo/plugin";
import { execFile } from "node:child_process";
import { z } from "zod";
import {
  type checkoutStackBranchRpc,
  type StackState,
  stackBranchSchema,
  type viewStackRpc,
} from "../shared/stack";

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
      return { status: "none", currentBranch: await currentBranch(directory) };
    }
    throw new Error(failureMessage(result));
  }
  const view = ghStackViewSchema.parse(JSON.parse(result.stdout));
  return { status: "stack", ...view };
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
  if (branch === stack.currentBranch) return stack;

  const result = await run("git", ["switch", branch], directory);
  if (result.code !== 0) throw new Error(failureMessage(result));
  return readStack(directory);
}
