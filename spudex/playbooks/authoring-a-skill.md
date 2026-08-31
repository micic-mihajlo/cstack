### Authoring or modifying a skill

**You own the skill's voice.** Agent-facing prose has a higher bar than human prose. Bad sentences become instructions.

1. Use the **skill-creator** skill and the local authoring playbook as the source of truth for Codex skill structure.
2. Validate the skill. Frontmatter must have `name` and `description`. Referenced files must exist. Cross-skill links must resolve.
3. Add real structural and runtime checks when the skill has scripts or machine-checked behavior. Skip them when the change is purely editorial. Mocks, fakes, stubs, spies, simulated transports, and monkey patches are forbidden.
4. Run **Opening a PR** only if the user asked for a PR.

When in doubt, delete. Prose earns its keep by changing a decision. Point at structural sources like types, READMEs, and config. Hardcoded details go stale. Delegate to other skills by path instead of restating them.

**Reply:** summary of the skill, key design decisions, validation notes.
