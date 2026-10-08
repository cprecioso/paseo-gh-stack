import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkoutStackBranch, trackRemoteStack, viewStack } from "./server/stack";
import { checkoutStackBranchRpc, trackRemoteStackRpc, viewStackRpc } from "./shared/stack";

export default function contribute(server: PluginServerContext) {
  server.handle(viewStackRpc, viewStack);
  server.handle(checkoutStackBranchRpc, checkoutStackBranch);
  server.handle(trackRemoteStackRpc, trackRemoteStack);
  return () => {};
}
