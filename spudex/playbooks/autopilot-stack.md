### Autopilot stack

**You own the stack, never the landing. Build and verify one linear chain, then hand it to the operator.** Use for "autopilot stack", "stack them, don't ship", or "build the stack, I'll land it".

1. **Freeze the requested queue.** Record each change, its dependency, requested order, base, repository, and operator-owned items. If the user asked only for the protocol, state it and stop. Create a Codex goal only when the user asked for persistent work.
2. **Run one owner per independent change.** Give each worker exclusive files plus a branch or worktree. The owner builds, verifies the real path, triages automated findings, runs `$unslop` when available, applies No comments, and drives Babysit to stack-ready. It returns a `decisions.tsv` trail and exact head SHA. Owners never merge, enable auto-merge, or change another branch's parent.
3. **Verify at stack-ready.** Swarm the exact SHA. Re-run gates, exercise the load-bearing behavior on the real surface, and audit receipts plus diff. Send findings back to the owner. A changed head gets a fresh verdict.
4. **Use one topology writer.** The root owns the chain. If the repository uses Graphite and `gt` is installed, register and submit the verified chain through Graphite. Otherwise create an explicit GitHub base-branch chain and record every parent. Never pretend GitHub auto-merge reproduces Graphite merge-queue behavior.
5. **Append verified work only.** Parallelize builds, not topology writes. Add each clean item in the requested or dependency-safe order. Never merge, arm merge-when-ready, or close a PR from this playbook.
6. **Absorb base drift at the root.** Refresh the requested trunk and restack or rebase through the repository's real stack mechanism. Resolve conflicts with the owner of the affected files. Any rewritten head invalidates its old verdict. Compare patch IDs only as supporting evidence. Re-run behavioral verification when relevant code or dependencies moved.
7. **Audit through Codex events.** Use agent waits, task waits, terminal polling, the PR watcher, or an explicitly requested heartbeat. Never use a long shell sleep. Probe liveness from commits, pushes, check changes, PR state, and stored reports. Replace a stalled owner with a fresh consolidated brief.
8. **Deliver the chain.** Return a linear bottom-to-top list with base and head SHAs, current verdicts, and operator-owned gates. The operator reviews and lands it.
9. **Stand down immediately.** A hold becomes a zero-write order. Preserve branches, topology, verdicts, and decision trails.

**Choosing between autopilots.** Use Autopilot full only when independent work should be merged and the user granted merge authority. Use Autopilot stack when review or landing remains with the operator, or when the changes are dependent.

**Reply:** stack root and tip, every link in order, base and head SHA, one-line verdict per link, and anything excluded or awaiting the operator.
