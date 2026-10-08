# paseo-gh-stack

A [Paseo](https://paseo.sh) plugin for [GitHub stacked PRs](https://github.com/github/gh-stack). It shows the `gh stack` the workspace's branch belongs to and switches the workspace between the branches in it.

## Features

- **Stack panel**: a workspace tab (also available in the Explorer) listing the stack from top to trunk. Each branch shows its PR number, and whether it is merged, queued, or needs a rebase. Tap a branch to check it out in the workspace.
- **Stacks on GitHub**: when the branch isn't tracked by `gh stack` locally, the panel looks up its pull request in GitHub's stacks and offers a **Check out stack** button that runs `gh stack checkout <number>`.
- **Command Center** (⌘K / Ctrl+K):
  - `Open stack`
  - `Stack: check out branch above`
  - `Stack: check out branch below`

The panel refreshes every 15 seconds, so branch changes made from a terminal or by an agent show up on their own.

## Requirements

On the daemon host:

- The [GitHub CLI](https://cli.github.com) (`gh`)
- The gh-stack extension: `gh extension install github/gh-stack`

## Install

Requires Paseo 0.10.3 or later.

```bash
paseo plugin install npm:@cprecioso/paseo-gh-stack
```

Or from GitHub:

```bash
paseo plugin install github:cprecioso/paseo-gh-stack
```

Then open the panel from a workspace's new-tab menu, or run **Open stack** from the Command Center.

## Limitations

- Switching runs `git switch <branch>` in the workspace directory. Git refuses when uncommitted changes would be overwritten, or when the branch is already checked out in another worktree; the error is shown as a toast.
- Switching branches changes the files under any agent running in the workspace. The panel warns you when an agent is running.
- Stacks found on GitHub are only detected when the current branch has a pull request and the stack still has unmerged PRs.
- Checking out a GitHub stack fails without prompting when it conflicts with a local stack; resolve it with `gh stack checkout` in a terminal.

## License

MIT
