### Shipping

**You own what lands. Verify each PR independently, land only a contiguous verified run, then stop touching the queue.** Use after Babysit when the user explicitly asks to land, ship, merge, or enable merge when ready.

Green is not safe. Shipping begins where [Babysit](babysit.md) stops.

1. **Freeze the live chain and authority.** Refresh every PR's base and head SHA. Record the requested root, ceiling, merge method, repository stack mechanism, and any operator-owned items. A stale local branch or an older SHA cannot authorize a merge.
2. **Verify every PR independently.** Use one independent verifier per PR. Compare parent versus head and exercise the load-bearing behavior on the real terminal, browser, simulator, service, or provider surface from [Codex runtime](../references/codex-runtime.md). Each verifier returns `PASS`, `PASS+NOTES`, or `FAIL` pinned to the exact head SHA. CI and bot approval are inputs, not verdicts. Post the verdict externally only when the user's request includes PR comments or the repository's shipping process requires and authorizes them.
3. **Land only the contiguous verified run from the bottom.** Walk from the lowest unmerged PR upward. Stop at the first missing or failing verdict. A verified PR above a gap is not landable because its ancestry contains the gap.
4. **Re-check verdict identity.** A rebase or restack rewrites heads. Compare the verdict SHA with the current remote head. Patch ID can show an unchanged textual patch, but it does not prove dependencies or runtime behavior stayed equivalent. Re-verify when relevant code, base behavior, generated output, or dependencies moved.
5. **Use the repository's real queue mechanism.** If `gt` exists and the repository already uses Graphite, arm the verified run through Graphite and follow its documented current command shape. Confirm state through Graphite. Do not infer it from GitHub's `autoMergeRequest`. If Graphite is not present, use the repository's supported GitHub merge process one PR at a time from the bottom. Never claim GitHub auto-merge recreates Graphite's stacked queue.
6. **Never arm GitHub auto-merge on child PRs in a Graphite stack.** Children target unprotected parent branches and may merge immediately into them, collapsing review granularity. If it is already armed and the user authorized repair, disable it and verify the field changed.
7. **Stop mutating once the queue drains.** No restack, sync, speculative push, parent rewrite, or topology command while merges are in flight. Independent work gets rebased or reparented outside the draining chain.
8. **Watch, do not drive.** Run `../scripts/watch-pr/watch-pr` in queued mode over the frozen verified run. Use its events through a Codex wait or an explicitly requested heartbeat. `ADVANCE` is progress. `COMPLETE` at the ceiling is terminal. Diagnose a stall before mutating anything.
9. **Stop at the ceiling.** Report the next unverified PR and the proof it still needs. Extending the run requires a fresh pass through verification.

**Reply:** the frozen verified run, ceiling, head-pinned verdict per PR, queue mechanism, how arming was confirmed, what landed, and the next gap.
