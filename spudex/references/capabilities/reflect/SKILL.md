---
name: reflect
description: Review the current Codex task through judgment, tooling, and divergent lenses, then propose durable improvements to existing skills or structural checks. Use for $spudex reflect or explicit requests to capture lessons from a completed run.
---

# Reflect

Mine one completed or paused task for durable lessons. Propose changes. Do not apply them until the user approves the selected items.

## When to invoke

- The user asks to reflect or capture what the run taught us.
- A complex task with several tool calls lands cleanly and its recipe is likely reusable.
- The run hit dead ends before finding a general path.
- The user corrected the approach mid-task.
- A non-trivial workflow emerged that no current skill or structural check captures.

Skip trivial or off-topic tasks, one-off accidents, and work already covered by a skill the parent followed correctly. An implicit reflection may prepare a short proposal, but it never authorizes edits or external writes.

## 1. Define the evidence set

Use the current task history and explicit artifacts. For another task, resolve and read only the named task through Codex task tools. In CLI contexts, use the current conversation or an explicit transcript or handoff file. Include git diff, decision trail, command receipts, and produced artifacts where relevant. Do not scan hidden transcript directories or unrelated private sessions.

Skip trivial conversations and one-off mistakes with no reusable lesson.

## 2. Spawn three independent reviewers

Spawn all three before waiting. Use read-only roles and validated model choices from [Model roles](../../model-roles.md). Prefer model diversity. If it is unavailable, vary roles and reasoning and disclose the limitation.

| Lens | Template |
|---|---|
| Judgment | `references/judgment-reviewer.md` |
| Tooling | `references/tooling-reviewer.md` |
| Divergent | `references/divergent-reviewer.md` |

Give each reviewer the same evidence pointers and its template. For connector evidence already cited by the task, allow only relevant read access. Reviewers never write files or external systems.

## 3. Synthesize

After all three complete, spawn one independent synthesizer with `references/synthesizer.md`. It receives the evidence pointers plus full reviewer findings and returns:

- `Accepted`. A specific reusable lesson with evidence and target location.
- `Rejected`. A tempting lesson that is one-off, already covered, or unsupported.
- `Backlog`. A lesson better enforced by code, lint, metadata, validation, or runtime structure.

Spot-check every citation yourself. A reviewer claim without resolving evidence is rejected or marked uncertain.

## 4. Prefer structural enforcement

Move a proposed prose instruction to Backlog when a lint rule, script, metadata flag, schema, type, or runtime check would enforce it better. Apply [Encode lessons in structure](../../principles/encode-lessons-in-structure.md).

## 5. Get approval

Show the complete Accepted, Rejected, and Backlog result. Wait for the user to choose what to apply. Reflection does not authorize skill edits, tracker submissions, PRs, or messages by itself.

For approved items:

- Make a trivial existing-skill correction directly with exact-diff review.
- Use `$skill-creator` for a substantive skill change, description tuning, or a new skill.
- Implement a structural check only when the user's approval includes that code change.
- File backlog items only when the user asked for tracker updates.

Run the skill validator on every changed skill. Use real examples or real task history for evaluation. Never use fake tasks, mock runs, or monkey patches.

## 6. Report

Return approved edits applied, new skills, structural backlog, rejected findings with reasons, validation, and any item still awaiting a user decision.
