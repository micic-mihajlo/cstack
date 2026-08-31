# Make it yours

spudex is one person's style. The machinery underneath, playbooks, routing, model roles, works just as well wearing yours. This page covers generating a personal mode, capturing lessons from a session, authoring a focused skill, and testing a skill change before you trust it.

## Generate your own mode with `$spudex automate-me`

```text
$spudex automate-me
```

You don't have to describe your style from scratch, because [`$spudex automate-me`](../../references/capabilities/automate-me/SKILL.md) reads it from the current task and the specific prior Codex tasks you put in scope. It looks for repeated preferences in replies, delegation, verification, code, prose, and process, then asks you which patterns are really you. It drafts a project skill under `.agents/skills/` or a new personal skill under `~/.agents/skills/` through `$skill-creator`, runs the prose through [`$unslop`](../../references/capabilities/unslop/SKILL.md), and validates the result. An already-loaded legacy `~/.codex/skills/` skill may be updated in place instead of duplicated. It opens a PR only when you asked for one.

Run it again whenever your habits drift:

```text
$spudex automate-me update my mode skill with everything since its last edit
```

Update mode mines only the history since the skill last changed. It keeps rules you haven't contradicted, revises the ones with new evidence, and adds sections only for genuinely new patterns.

## Capture a session's lessons with `$spudex reflect`

Right after a task that taught you something, run:

```text
$spudex reflect that took way too long. capture what we learned so the next run doesn't repeat it.
```

[`$spudex reflect`](../../references/capabilities/reflect/SKILL.md) sends the current task evidence and explicit artifacts to three parallel reviewers, then a synthesizer sorts the proposals into `Accepted`, `Rejected`, and `Backlog` and waits for your approval before any skill changes. Approve a proposal only if it would change a future decision. One weird session is an anecdote, not a rule.

## Author a focused skill

When you already know the workflow you want to capture:

```text
$spudex write a skill for verifying database migrations in this repo
```

Writing a skill matches the [Authoring or modifying a skill playbook](../../playbooks/authoring-a-skill.md), which routes through Codex `$skill-creator`, validates the frontmatter and links, and uses the Opening a PR playbook only when you ask to publish it. Agent-facing prose has a higher bar than human prose, because an unhelpful sentence becomes an instruction some future agent follows. Let the playbook hold that bar rather than writing a `SKILL.md` freehand.

One special case has its own generator. A skill that must drive your app and prove behavior is a verification skill, so use [`$spudex create-verification-skill`](../../references/capabilities/create-verification-skill/SKILL.md) and [`$spudex maintain-verification-skill`](../../references/capabilities/maintain-verification-skill/SKILL.md) instead. [Verify and ship](./06-verify-and-ship.md#create-a-project-verification-skill) covers both.

## Write docs to a standard with `$spudex technical-writing`

Skills aren't the only prose you ship. For docs, RFCs, readmes, PR descriptions, and commit messages:

```text
$spudex technical-writing review the readme changes
```

[`$spudex technical-writing`](../../references/capabilities/technical-writing/SKILL.md) applies a layered standard with one goal, prose a tired engineer understands on the first read. It picks the document's mode first (tutorial, how-to, reference, or explanation), then works sentence by sentence: who does what, one thought per sentence, nothing readable two ways. Use it to review what you or an agent just wrote, or name it up front when you ask for a doc.

## Test a skill change blind

A skill edit affects every future session, so test it like the experiment it is:

```text
$spudex run the eval playbook on this skill change. same task for both variants, candidates stay blind.
```

The [Eval playbook](../../playbooks/eval.md) is built around one failure mode, the observer effect. An agent that knows it's being evaluated behaves differently. So candidate agents get an organic-looking task in sanitized directories, never the words "eval" or "candidate", and never each other's existence. One judge scores all outputs under neutral labels, and chain-following gets graded from which files each candidate actually read, not from what it claims.

Read every output yourself before accepting the verdict. If you disagree with the judge, suspect the rubric before you suspect your judgment.

**Pitfall:** don't edit a skill mid-task because it's misbehaving. Edit and validate it as a separate change, and publish it only when asked. A skill edit tangled into feature work is invisible to review and hard to evaluate.

Next: [Recipes and pitfalls](./10-recipes-and-pitfalls.md).
