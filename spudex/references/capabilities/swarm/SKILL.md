---
name: swarm
description: "Fan out N Codex subagents, drain them, and return one grounded report. Use for $spudex swarm, swarm this, parallel coverage, races, gauntlets, and exploration."
---

# Swarm

Fan out N parallel workers. They may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and returns one report.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total logical workers. Run them in waves when N exceeds current Codex concurrency.
4. Pick the role and model from [Model roles](../../model-roles.md) and any validated Spudex configuration. Otherwise inherit the parent model and choose the best built-in role. For a model race, name only model slugs validated by the current `spawn_agent` tool.
5. Give every writer an exclusive output. Use a worktree, branch, or `/tmp/spudex-swarm-<slug>/worker-<n>/`. Read-only lanes may share sources but never mutable state.

## Phase B: Fan out

Spawn as many independent workers as current concurrency permits before waiting. Refill the wave as results arrive. Use Codex subagents in the current task. A separate user-owned task is created only when the user asked for one. Repository writers use worktrees when branches or files could overlap.

When a worker must start from a non-default pushed branch, name that branch explicitly in the brief and verify the worker starts from it.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence.

If a worker drops out, replace it when its slice is required for coverage. A race may proceed with N-1 only when the declared selection rule still has enough complete candidates. Record the dropout either way.

## Phase C: Aggregate

Read the terminal results. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
