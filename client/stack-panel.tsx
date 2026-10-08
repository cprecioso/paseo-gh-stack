import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, type PluginWorkspacePanelProps, useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  checkoutStackBranchRpc,
  type StackBranch,
  type StackState,
  trackRemoteStackRpc,
  viewStackRpc,
} from "../shared/stack";

export function stackQueryKey(directory: string) {
  return ["gh-stack", directory] as const;
}

function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: compact ? 16 : 24, gap: 12 },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      title: { flex: 1, color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      iconButton: { padding: 6, borderRadius: 6 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      code: { color: theme.colors.foreground, fontFamily: "monospace", fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      warning: { color: theme.colors.statusWarning, fontSize: 13 },
      list: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        overflow: "hidden" as const,
      },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      },
      firstRow: { borderTopWidth: 0 },
      currentRow: { backgroundColor: theme.colors.surface2 },
      rowButton: {
        flex: 1,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
      },
      rowText: { flex: 1, gap: 2 },
      branchName: { color: theme.colors.foreground, fontSize: 14 },
      currentName: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      flags: { flexDirection: "row" as const, gap: 8, flexWrap: "wrap" as const },
      pr: { paddingVertical: 10, paddingHorizontal: 12 },
      prText: { color: theme.colors.accent, fontSize: 13 },
      button: {
        alignSelf: "flex-start" as const,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: theme.colors.accent,
      },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13 },
    }),
    [theme, compact],
  );
}

type Styles = ReturnType<typeof useStyles>;

export function StackPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const workspace = useWorkspace(workspaceId, ({ directory, projectKind, status }) => ({
    directory,
    projectKind,
    status,
  }));
  const styles = useStyles(theme, layout.compact);
  const viewStack = useRpc(viewStackRpc);
  const checkoutBranch = useRpc(checkoutStackBranchRpc);
  const trackStack = useRpc(trackRemoteStackRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const directory = workspace?.directory ?? "";
  const isGit = workspace?.projectKind === "git";

  const stack = useQuery({
    queryKey: stackQueryKey(directory),
    queryFn: () => viewStack({ directory }),
    enabled: isGit,
    // Branches can change from a terminal or an agent, so keep polling while the panel is open.
    refetchInterval: 15_000,
  });

  const checkout = useMutation({
    mutationFn: (branch: string) => checkoutBranch({ directory, branch }),
    onSuccess: (state, branch) => {
      queryClient.setQueryData(stackQueryKey(directory), state);
      toast.show(`Switched to ${branch}`, { variant: "success" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const track = useMutation({
    mutationFn: () => trackStack({ directory }),
    onSuccess: (state) => {
      queryClient.setQueryData(stackQueryKey(directory), state);
      toast.show("Stack checked out", { variant: "success" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const header = (
    <View style={styles.header}>
      <Icon name="Layers" size={18} color={theme.colors.foreground} />
      <Text style={styles.title}>Stack</Text>
      {isGit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh stack"
          disabled={stack.isFetching}
          onPress={() => void stack.refetch()}
          style={styles.iconButton}
        >
          <Icon name="RefreshCw" size={16} color={theme.colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {header}
      {!workspace ? (
        <Text style={styles.muted}>Workspace unavailable.</Text>
      ) : !isGit ? (
        <Text style={styles.muted}>This workspace is not a git repository.</Text>
      ) : stack.isPending ? (
        <Text style={styles.muted}>Reading stack…</Text>
      ) : stack.isError ? (
        <>
          <Text style={styles.error}>{stack.error.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void stack.refetch()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <StackBody
          state={stack.data}
          styles={styles}
          theme={theme}
          agentRunning={workspace.status === "running"}
          switchingTo={checkout.isPending ? checkout.variables : null}
          onSelect={(branch) => checkout.mutate(branch)}
          tracking={track.isPending}
          onTrack={() => track.mutate()}
        />
      )}
    </ScrollView>
  );
}

interface StackBodyProps {
  state: StackState;
  styles: Styles;
  theme: PluginTheme;
  agentRunning: boolean;
  switchingTo: string | null;
  onSelect(branch: string): void;
  tracking: boolean;
  onTrack(): void;
}

function StackBody({
  state,
  styles,
  theme,
  agentRunning,
  switchingTo,
  onSelect,
  tracking,
  onTrack,
}: StackBodyProps) {
  if (state.status === "unavailable") {
    return state.reason === "gh-missing" ? (
      <Text style={styles.muted}>
        The GitHub CLI (<Text style={styles.code}>gh</Text>) is not installed on this host.
      </Text>
    ) : (
      <>
        <Text style={styles.muted}>The gh-stack extension is not installed on this host:</Text>
        <Text selectable style={styles.code}>
          gh extension install github/gh-stack
        </Text>
      </>
    );
  }

  if (state.status === "none") {
    return (
      <Text style={styles.muted}>
        {state.currentBranch ? (
          <Text style={styles.code}>{state.currentBranch}</Text>
        ) : (
          "The current checkout"
        )}{" "}
        is not part of a stack.
      </Text>
    );
  }

  // Top of the stack first, trunk last, matching `gh stack view`.
  const branches = [...state.branches].reverse();
  const remote = state.source === "remote";
  // Branches of a stack that only exists on GitHub may not exist locally, so switching
  // waits until `gh stack checkout` has set the stack up.
  const rowsDisabled = remote || switchingTo !== null;
  return (
    <>
      {remote ? (
        <>
          <Text style={styles.muted}>
            This branch is part of stack #{state.stackNumber} on GitHub, but the stack is not
            checked out locally.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Check out stack ${state.stackNumber}`}
            accessibilityState={{ busy: tracking, disabled: tracking }}
            disabled={tracking}
            onPress={onTrack}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{tracking ? "Checking out…" : "Check out stack"}</Text>
          </Pressable>
        </>
      ) : null}
      {agentRunning ? (
        <Text style={styles.warning}>
          An agent is running here. Switching branches changes the files under it.
        </Text>
      ) : null}
      <View style={styles.list}>
        {branches.map((branch, index) => (
          <BranchRow
            key={branch.name}
            name={branch.name}
            branch={branch}
            first={index === 0}
            current={branch.name === state.currentBranch}
            switching={switchingTo === branch.name}
            disabled={rowsDisabled}
            styles={styles}
            theme={theme}
            onSelect={onSelect}
          />
        ))}
        <BranchRow
          name={state.trunk}
          trunk
          first={branches.length === 0}
          current={state.trunk === state.currentBranch}
          switching={switchingTo === state.trunk}
          disabled={rowsDisabled}
          styles={styles}
          theme={theme}
          onSelect={onSelect}
        />
      </View>
    </>
  );
}

interface BranchRowProps {
  name: string;
  branch?: StackBranch;
  trunk?: boolean;
  first: boolean;
  current: boolean;
  switching: boolean;
  disabled: boolean;
  styles: Styles;
  theme: PluginTheme;
  onSelect(branch: string): void;
}

function BranchRow({
  name,
  branch,
  trunk,
  first,
  current,
  switching,
  disabled,
  styles,
  theme,
  onSelect,
}: BranchRowProps) {
  const icon = current ? "CircleDot" : trunk ? "GitCommitVertical" : "GitBranch";
  const flags: { label: string; color: string }[] = [];
  if (trunk) flags.push({ label: "trunk", color: theme.colors.foregroundMuted });
  if (switching) flags.push({ label: "switching…", color: theme.colors.foregroundMuted });
  if (branch?.isMerged) flags.push({ label: "merged", color: theme.colors.statusSuccess });
  if (branch?.isQueued) flags.push({ label: "queued", color: theme.colors.foregroundMuted });
  if (branch?.needsRebase) flags.push({ label: "needs rebase", color: theme.colors.statusWarning });
  const pr = branch?.pr;

  return (
    <View style={[styles.row, first && styles.firstRow, current && styles.currentRow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={current ? `${name}, current branch` : `Switch to ${name}`}
        accessibilityState={{ selected: current, disabled: disabled || current }}
        disabled={disabled || current}
        onPress={() => onSelect(name)}
        style={styles.rowButton}
      >
        <Icon
          name={icon}
          size={16}
          color={current ? theme.colors.accent : theme.colors.foregroundMuted}
        />
        <View style={styles.rowText}>
          <Text style={current ? styles.currentName : styles.branchName} numberOfLines={1}>
            {name}
          </Text>
          {flags.length > 0 ? (
            <View style={styles.flags}>
              {flags.map((flag) => (
                <Text key={flag.label} style={[styles.muted, { color: flag.color }]}>
                  {flag.label}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
      {pr ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open pull request ${pr.number}`}
          disabled={!pr.url}
          onPress={() => (pr.url ? void openExternalUrl(pr.url) : undefined)}
          style={styles.pr}
        >
          <Text style={styles.prText}>#{pr.number}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
