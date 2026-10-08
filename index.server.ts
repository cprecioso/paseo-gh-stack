import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkoutStackBranch, viewStack } from "./server/stack";
import { checkoutStackBranchRpc, viewStackRpc } from "./shared/stack";

export default function contribute(server: PluginServerContext) {
  server.handle(viewStackRpc, viewStack);
  server.handle(checkoutStackBranchRpc, checkoutStackBranch);
  return () => {};
}
