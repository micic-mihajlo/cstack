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

[`$cstack setup-cstack`](../../references/capabilities/setup-cstack/SKILL.md) detects the models and reasoning efforts the current Codex host accepts. It then shows all 18 pstack-compatible workflow slots and waits for your choices. There are no presets. Panel entries are ordered lists, and their length controls how many independent subagents run.

Codex keeps model and reasoning effort as separate fields. You can also explicitly choose `inherit-parent` or `auto`, but setup never chooses either for you. Nothing is written until you confirm the complete map.

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
