### Authoring or modifying a skill

The skill is an execution contract. Every sentence must change a decision, prevent a known failure, or route the agent to a reusable resource.

1. Use the `skill-creator` skill.
2. Inspect the current skill, its supporting files, and the concrete tasks it should improve.
3. Remove redundant, stale, unsafe, or performative instructions before adding new ones.
4. Edit the smallest set of files that makes the behavior coherent.
5. Validate the frontmatter, referenced files, cross-skill links, and `agents/openai.yaml`.
6. Forward-test structural changes on realistic prompts when tool policy permits. Skip subjective-only testing with a stated reason.
7. Run Opening a PR only when the user requested publication.

Match freedom to risk. Use exact steps for fragile operations. Use judgment rules for normal engineering work. Delegate to another skill by name or path instead of copying its full instructions.

**Reply:** the problems removed, the new operating contract, validation performed, and any behavior that still needs a real-world trial.
