### Session pickup

Own the resume point. Preserve completed work and refresh only facts likely to have drifted.

1. Locate the trail named by the user. Use the active workspace's transcript path, the supplied task or cloud-agent URL, or the pushed branch. Do not scan unrelated transcript directories.
2. Read metadata and the latest messages first, then scan back for decisions, evidence, and unfinished work. When tool policy permits and the trail is too large for the main context, delegate parsing and keep the reduced timeline in the main thread.
3. Reconstruct operational state. Record the branch, worktree, commits, diff against the intended base, completed checks, open tasks, and decisions already made.
4. Verify cheap drift-prone facts such as live PR state, remote refs, CI, and external ticket status. Do not redo expensive completed work without a reason.
5. Separate inherited claims from verified facts. Name the exact resume point and route the remaining work to the matching playbook.
6. Before declaring completion, verify the inherited artifact against the original goal.

**Reply:** what was inherited, what was refreshed, the resume point, remaining work, and outcome.
