### Opening a PR

Use this playbook only when the user asked to commit, push, or open a PR.

1. Read repository instructions. Confirm the intended repository, base branch, current branch, worktree state, and live remote state. Do not assume the base is `main`.
2. Preserve unrelated and uncommitted user changes. Use a clean worktree when isolation helps. Never reset, discard, or rewrite user work to make the branch clean.
3. Review the exact outgoing diff. Run `deslop` when available, or perform an explicit self-review for correctness, scope, tests, private data, generated files, and accidental edits.
4. Run the checks required by the repository and the change's blast radius. State any check that could not run.
5. Create small ordered commits when the user requested commits. Do not rewrite shared history without explicit approval.
6. Push only the intended branch. Confirm the remote branch and compare the outgoing commits before pushing.
7. Open the PR against the confirmed base. Write a concise description with the problem, change, verification, and known risk. Do not add empty boilerplate sections.
8. Verify the returned PR URL, head, base, and initial checks. Inspect review comments and CI when the user asked for follow-through. Use `babysit` for sustained monitoring when available.

**Reply:** commit and branch, PR URL, base, verification, check state, and anything still requiring a decision.
