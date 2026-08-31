---
name: automate-me
description: "Use for automate me, create or refresh my mode skill, capture my working style, or make agents follow my conventions. Drafts or revises a personal mode skill through $skill-creator and $unslop using only explicitly relevant Codex history."
---

# Automate me

A guided flow for turning the user's working conventions into a skill agents will follow. The output is one `-mode` skill tailored to them (e.g. `jay-mode`, `priya-mode`).

This skill orchestrates three others: an inline mining pass (see step 1), Codex's `$skill-creator` (authoring), and the **unslop** skill (prose discipline). It sequences them; it doesn't replace them.

## Flow

### 0. Check for an existing skill

Look recursively for project `.agents/skills/**/*-mode/SKILL.md`, personal `~/.agents/skills/**/*-mode/SKILL.md`, and any already-loaded legacy `.codex/skills/**/*-mode/SKILL.md` matching the user's handle. If one exists, confirm intent with a short direct question unless the user already asked to update it.

- Update the existing skill (default for repeat runs)
- Start fresh (rare; ask why before doing it)

Update mode changes the rest of the flow:
- Step 1 mines only history since the skill was last edited (`git log -1 --format=%cI <path>`).
- Step 2 asks what's changed or missing, not what to capture from zero.
- Step 4 edits the existing file in place. Preserve sections the user hasn't contradicted; revise ones with new evidence; add new sections only for genuinely new rules.

### 1. Mine their history

Use only conversation history relevant to the request. In the Codex app, read the current task and named prior tasks through task tools. In CLI contexts, use the current conversation plus explicit transcripts or handoff files. Do not scan hidden transcript folders or unrelated private sessions.

Survey the scoped history for recurring patterns. Use parallel read-only agents only when several named tasks or a long explicit transcript make slicing useful. Each lane receives only its assigned task IDs or artifact paths and returns evidence pointers. Default signals worth hunting:

- Response preferences (length, tone, format, "dumb it down" corrections)
- Delegation habits (subagents, models, specialized workflows, parallelism)
- Verification posture (what "done" means; unit tests vs live repro; reviewers)
- Code and prose discipline (style, principles cited, lint/format tools)
- Process conventions (worktrees, commits, PRs, review/merge tooling)
- Meta preferences (fixing skills mid-task, proposing new ones)

Cross-check across slices before elevating a signal. Patterns seen in 2+ slices are high-confidence; lone signals are weak and usually get dropped.

### 2. Ask the user directly

Mining misses intent that has not come up yet. Ask one or two short direct questions rather than dumping a long questionnaire.

Use `request_user_input` when it is available and a material choice remains. Otherwise ask one concise chat question. Start broad, then follow up only on selected areas. One free-form question catches anything the options missed.

Don't dump 20 questions. Two structured rounds plus one open question is usually enough.

### 3. Cluster findings

Group the combined signals into sections. Common ones (use only what applies):

- **Response style**: length, tone, format.
- **Autonomy**: how much to do without asking; MCP tool use.
- **Understand first**: which skills to reach for when scoping or investigating a change.
- **Subagents**: default, parallelism, model-to-task, specialized workflows.
- **Prose / code discipline**: principles, lint tools, style guides.
- **Review and verify**: repro posture, verification skills, live-testing tools.
- **Process**: git worktrees, commits, PRs, review/merge tooling.
- **Skills**: skill-authoring habits, fix-the-skill-first, proposing new skills.

The **cstack** skill shows the shape. Read it for granularity. Don't copy its content; the user's rules are not the same as cstack's.

### 4. Draft the skill

Use Codex's `$skill-creator` skill to author the skill. Placement:

- Path: preserve an existing mode skill's category. For a project skill, use `.agents/skills/<handle>-mode/SKILL.md` or the project's established skill location. For a new personal skill, use `~/.agents/skills/<handle>-mode/SKILL.md`. Update an already-loaded legacy `~/.codex/skills/` skill in place instead of silently duplicating it.
- Handle: the user's first name or chosen identifier.
- Frontmatter `description`: trigger on their name + `/<handle>-mode` + "work in their style", not on generic keywords like "write code" or "review PR".
- Frontmatter formatting: follow `$skill-creator` YAML rules. Keep `description` as one YAML scalar. Put explicit-only behavior in `agents/openai.yaml` with `policy.allow_implicit_invocation: false` when that metadata surface is appropriate.

### 5. Iterate on prose

Apply the installed `$unslop` skill and `$skill-creator` writing guidelines to every line. Both apply to agent-read prose, not just the root skill.

Show the draft to the user and take feedback. Expect multiple iterations. Cut ruthlessly; a mode skill is not a manual.

### 6. Land it

Write in an isolated worktree when the target is a git project. Validate and show the exact diff. Commit, push, or open a PR only when the user asked for those delivery actions. A personal skill outside a repository is edited in place after the user requested the change.

## Guardrails

- **Don't overfit to one conversation.** A preference stated once and contradicted another time is noise. Require multiple instances before codifying it.
- **Don't be clever.** Restating other skills' contents, inventing metaphors, or writing "poetic" prose for an agent reader is cost without benefit. Keep it operational.
- **Reference, don't inline.** Other skills the user relies on should appear as path references, not pasted excerpts. Same for any principle docs they maintain elsewhere.
- **Keep sections minimal.** Only add a section if the user has a specific, non-default rule there. "Communicate clearly" is not a section. "Short paragraphs. Tables when comparing options. Bullets only when items are genuinely parallel." is.
- **Name conventions generic.** Use "the user" or "the human" in imperatives, not the author's first name. Others may read or adopt the skill.
- **Don't force symmetry.** If a user has no process rules worth writing down, skip the Process section entirely. Sparse is fine; bloated is not.

## Evaluation

A `-mode` skill is subjective output. A generic benchmark loop is not useful here. Vibe-check with the user: does it read like them? Did it miss anything? Then validate it and publish only when asked.

Run a description-optimization loop only if the skill's trigger accuracy turns out to be a problem in practice.

## When not to use

- User wants a task-specific skill rather than working conventions. Use `$skill-creator` alone. No history mining is required.
- User wants to capture one narrow workflow (e.g. "how I write commit messages"): that's a regular skill, not a mode skill.

## Reference files

- The **cstack** skill: example of the output shape.
- The **unslop** skill: prose discipline for every line.
- Codex `$skill-creator`: skill authoring process and writing guidelines.
