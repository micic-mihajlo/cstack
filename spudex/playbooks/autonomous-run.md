### Autonomous run

**You own the exit condition. Define done, then drive to it without stopping.** For "going to bed" / "run until done" / "a Codex automation or heartbeat until X".

1. State the exit condition as a checkable predicate before the first iteration (tests green, repro fixed, all N PRs merged, pixel-diff zero). A vague goal stalls; a predicate lets you stop.
2. Pick the wake mechanism using Codex automations or heartbeat automations. Prefer an event-based wake for CI, merges, or ref changes. Use a time-based heartbeat when no event source exists. Use a watcher subagent only when tool policy permits and it adds value.
3. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, and removes its own changes when they did not help. Commit checkpoints only when the user authorized commits.
4. Checkpoint every iteration via the **show-me-your-work** skill, a row for what changed and whether the predicate moved. A run with no trail can't be audited or resumed.
5. Stop when the predicate is met, or when two consecutive iterations make no progress. You are stuck then; surface it, don't spin. Never relax the predicate to declare victory.

**Reply:** the exit condition, iterations run, what landed, what was discarded, final predicate state.
