import type { PluginClientContext, PluginWorkspaceCommandContext } from "@getpaseo/plugin/client";
import { checkoutStackBranchRpc, viewStackRpc } from "./shared/stack";
import { adjacentBranch, type StackDirection } from "./client/navigation";
import { StackPanel } from "./client/stack-panel";

async function step(
  { workspace, rpc }: PluginWorkspaceCommandContext,
  direction: StackDirection,
): Promise<void> {
  const state = await rpc(viewStackRpc, { directory: workspace.directory });
  const branch = adjacentBranch(state, direction);
  await rpc(checkoutStackBranchRpc, { directory: workspace.directory, branch });
}

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "stack",
    title: "Stack",
    icon: "Layers",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: StackPanel,
  });
  client.addCommandCenterItem({
    id: "open-stack",
    title: "Open stack",
    icon: "Layers",
    keywords: ["gh", "stack", "stacked", "branch", "pr"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("stack");
    },
  });
  client.addCommandCenterItem({
    id: "stack-up",
    title: "Stack: check out branch above",
    icon: "ArrowUp",
    keywords: ["gh", "stack", "up", "branch"],
    context: "workspace",
    onSelect: (context) => step(context, "up"),
  });
  client.addCommandCenterItem({
    id: "stack-down",
    title: "Stack: check out branch below",
    icon: "ArrowDown",
    keywords: ["gh", "stack", "down", "branch"],
    context: "workspace",
    onSelect: (context) => step(context, "down"),
  });
  return () => {};
}
