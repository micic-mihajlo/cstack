### Autonomous run

**You own the exit condition. Define done, then drive to it without stopping.** For "going to bed" / "run until done" / "keep driving until X".

1. State the exit condition as a checkable predicate before the first iteration (tests green, repro fixed, all N PRs merged, pixel-diff zero). A vague goal stalls; a predicate lets you stop.
2. Pick the wake mechanism with Codex-native durability. An event to watch gets the matching task, agent, terminal, or PR wait. Use a thread heartbeat only when the user asked for later or recurring continuation. For a persistent objective, use a Codex goal only when the user requested one. Follow [Codex runtime](../references/codex-runtime.md). Never hold a blocking sleep loop open.
3. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced, discards changes that didn't help. Belt-and-suspenders that "might help" gets reverted, not left to ride.
   Sequence the work via the **sequence-verifiable-units** principle skill, verifying each unit before the next instead of batching checks at the end.
4. Mid-run discoveries inside the authorized scope are yours. Address broken skills, related blockers, flaky verifiers, review noise, tooling failures, and fixable drift when they block the predicate. Keep unrelated improvements as named follow-ups. Do not create a PR, post externally, merge, deploy, or broaden product scope unless the user requested it. Surface irreversible actions, genuine product calls no experiment can settle, and real dead ends. Return to the predicate after each in-scope side fix.
5. Checkpoint every iteration via the **show-me-your-work** skill, a row for what changed and whether the predicate moved. A run with no trail can't be audited or resumed.
6. Stop when the predicate is met. A plateau is not a stop, so keep going and pivot your approach to push past it. Surface a genuine dead end rather than spinning, and never relax the predicate to declare victory.

**Reply:** the exit condition, iterations run, what landed, what was discarded, final predicate state.
