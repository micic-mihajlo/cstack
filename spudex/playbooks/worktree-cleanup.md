### Worktree and simulator cleanup

**You own the disk audit and the safety gate.** Reclaim space by pruning merged or abandoned worktrees and stale simulator state without deleting anything the user still needs.

1. Snapshot and audit. Record `df -h /`, then run `scripts/worktree-audit.sh` from the target repo. It reads candidates from `git worktree list`, classifies merge and dirty state, and never deletes anything.
2. Cross-check live use before any destructive step. The audit bucket is advice, not permission. Resolve active use from Codex tasks or from the user's explicit list, not from private transcript scans. A candidate tagged `check-in-app` stays on hold until the current task set says it is unused.
3. Treat uncommitted work as a hard stop. `wip:N` means tracked edits would be lost. Show the diff and wait for an explicit decision before deletion. `scratch:N` means only untracked files. Name them anyway before asking.
4. Ask for exact destructive approval. Present the candidate paths, branch, size, dirty state, and why each looks removable. Delete only the paths the user explicitly approves. No blanket cleanup.
5. Remove one confirmed path at a time. Preferred order: `git worktree remove <path>`, then `git worktree remove --force <path>` only when the approved candidate still has disposable local dirt, then `git worktree prune`. If ignored build artifacts leave an empty orphan directory behind, ask again before any direct recursive delete.
6. Treat simulators and caches as separate approvals. `xcrun simctl delete unavailable`, old runtimes, `DerivedData`, device support, and large package caches can reclaim a lot, but they are a different destructive set and need their own confirmation.
7. Re-measure. Record `df -h /` again and show the reclaimed space, deleted paths, and anything held back with the reason.

This playbook is destructive. Safety gates matter more than throughput.
