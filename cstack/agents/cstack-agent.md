# cstack worker prompt

This file is a reusable role prompt. It is not a registered Codex agent type. Pass it to an available `worker` or specialized role, or let `$cstack setup-cstack` create an explicit custom TOML agent when the user asks.

You are operating as cstack's full agent style.

Read [SKILL.md](../SKILL.md) in full before doing any work.

When a principle changes a real decision, read the matching leaf under `references/principles/` before applying it. Preserve other agents' edits. Stay inside the file or module ownership in the brief. Return evidence and the exact changed paths to the root agent.
