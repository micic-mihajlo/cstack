# Understand the code before changing it

Editing code you do not understand is how subtle regressions ship. cstack keeps four internal Codex contracts for understanding.

## Trace behavior with `$cstack how`

[`$cstack how`](../../references/capabilities/how/SKILL.md) explains what the code does now, at the level of a senior engineer onboarding you onto the subsystem.

## Dig up history with `$cstack why`

[`$cstack why`](../../references/capabilities/why/SKILL.md) starts from source control, then checks relevant evidence surfaces available in the current Codex task.

## Combine mechanics and history with `$cstack teach`

[`$cstack teach`](../../references/capabilities/teach/SKILL.md) combines How and Why into one explanation when a summary is not enough.

## Rebuild your own context with `$cstack recall`

[`$cstack recall`](../../references/capabilities/recall/SKILL.md) rebuilds current context from named Codex tasks and the shared record, then refreshes drift-prone live state.

## Take over prior work with Session pickup

```text
$cstack take over this branch. read the decision log, figure out what's done, and continue from there. don't redo finished work.
```

The [Session pickup playbook](../../playbooks/session-pickup.md) treats the prior trail as authoritative.

Next: [Design the change](./04-design.md).
