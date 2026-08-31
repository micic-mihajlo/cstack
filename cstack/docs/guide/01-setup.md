# Set up cstack

In this page you inspect the port, choose model-role preferences, and run your first real task.

## Start with the bundle

Read these first:

- [SKILL.md](../../SKILL.md)
- [Codex runtime](../../references/codex-runtime.md)
- [Setup cstack](../../references/capabilities/setup-cstack/SKILL.md)

This installation is one Codex skill bundle. Its capability modules are internal contracts routed by `$cstack`.

## Pick your role defaults

Run:

```text
$cstack setup-cstack
```

[`$cstack setup-cstack`](../../references/capabilities/setup-cstack/SKILL.md) detects the roles and models the current Codex host accepts, keeps the upstream role intent, and lets you override only what you care about.

If a role has no override, it keeps its default intent. If a role is set to `inherit-parent` or `auto`, the delegated run inherits the parent model instead of forcing a slug.

## Accept the verification offer, or do not

At the end of setup, `$cstack setup-cstack` looks for a real way to prove app behavior in your project, either a `verify-*` skill or an existing harness. If it finds neither, it can offer [`$cstack create-verification-skill`](../../references/capabilities/create-verification-skill/SKILL.md).

Say yes only if the project needs a durable real-path verification surface.

## Run your first task

Pick something real but small:

```text
$cstack add a --json flag to this command. text output stays byte-identical. verify both.
```

Watch the active plan. The first item is always to read the principles. The rest are the matched playbook's steps copied into the plan. If cstack skips a step, it should stay visible with a reason.

Next: [Route work through `$cstack`](./02-cstack.md).
