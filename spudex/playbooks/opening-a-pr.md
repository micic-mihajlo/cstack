### Opening a PR

Invoke at the end of another playbook only when the user asked to publish or open a PR. Without that authority, prepare the branch and return the proposed title and body locally.

**Worktree.** Work from a git worktree off main when the repo supports it; subagents inherit it when possible. Multiple delegated runs on the same branch should not share a dirty mutable checkout. Dirty branch with unrelated work: patch out, fresh worktree, apply. Snarled worktree: rebuild from main and redo minimally.

**Commits.** Commit liberally; rebase into small, ordered commits before opening PRs. Each commit is a future PR: landable, ordered to tell the story. Amend when the fix belongs in a just-made commit; new commit when separable.

**PRs.** Inspect the exact diff before commit. Run the installed `$unslop` skill when available. Apply [No comments](../references/capabilities/no-comments/SKILL.md) before review. Write every PR title, description, and commit body with [Technical writing](../references/capabilities/technical-writing/SKILL.md), then apply `$unslop`. Apply every technical-writing layer except Diátaxis. Use one word for each action, keep articles, and avoid `-ing` when a plain verb works.

**Titles.** Use Conventional Commits in the form `type(scope): subject` when the repository follows that convention. Use `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf` as the type. Use the changed area as the scope. Keep the subject short and imperative. Apply the same Technical writing and `$unslop` pass as the body. Name a real symbol when one carries the change. Do not add a trailing period.

**Descriptions.** Use these sections in order. Drop a section when it is empty.

- `## Why`. State the intent and why this approach fits.
- `## Scope`. State facts from the diff. Name real symbols and paths. Name both sides of a rename or retarget. State what is in and out when the boundary matters.
- `## Tradeoffs`. State real choices only. Skip this section when there are none.
- `## Blast Radius`. State who and what the change touches. Explain why the change is safe or risky. If main is red without the fix, name the continuing cost.
- `## Verification`. State how each check ran and its rigor. Name the real terminal, browser, simulator, service, provider, or repository test path. State the outcome, not only the command name.

After these sections, attach videos or screenshots when they prove a claim. Do not use `## Summary` or `## Test plan` boilerplate. A commit body does not restate its subject.

**Size and stacks.** Prefer narrow independently reviewable PRs to one large PR. Use Graphite only when `gt` exists and the repository already uses it. Otherwise express dependencies with explicit GitHub base branches. Branch from the requested trunk for independent work. Refresh that trunk before substantial stack work.

**Readiness.** Open every PR ready, never as a draft, unless the user asked for a draft. Set `draft: false` where the creation surface requires it. If it still opens as a draft, use `gh pr ready <number>` when authorized. Refresh `gh pr view <number>` before referring to status.

**Babysit.** Opening a PR does not start a babysit. Post the URL and keep building. Finish the phase or stack first. Run a separate babysit pass only when the user asks for one after the whole stack exists. A babysit for each new PR stalls the build and spends checks on commits that later waves restart. Push back when feedback drifts from intent.

A subagent preparing a PR applies Interrogate when the design is contested, runs `$unslop` when available, performs an exact-diff review, and applies No comments. The root performs the external PR creation unless the brief explicitly grants that action. Opening a PR does not start Babysit.

**Reply:** PR URL when published, branch and head SHA, title, description, commit order, and exact verification evidence. Without publication authority, return the ready-to-use title and body instead.
