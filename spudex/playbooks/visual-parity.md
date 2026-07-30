### Visual parity

**You own pixel-exact equivalence. The baseline is the spec; you do not touch it.** For "make X match Y exactly", styling-system migrations, porting a UI across frameworks. Equivalence is verified by image diff, not by eye.

1. Establish the baseline first, before any migration: a visual regression harness that screenshots the current component across its states, plus the target when matching two implementations. No baseline, no parity claim. This is a blocking prerequisite, not a follow-up.
2. Anti-shortcut clauses, stated and held: no harness modifications, no baseline tampering, no component restructuring to make a diff pass. Making the test green by changing the test is the failure mode. If the baseline looks wrong, stop and ask; don't edit it.
3. Migrate one component at a time. When tool policy permits and components have disjoint write scopes, parallelize across worktrees with one owner per component. Shared primitives migrate first as a blocking phase.
4. Verify each component against its baseline with an image diff on the matching surface. A nonzero diff is a failure. Inspect the pixel delta instead of accepting it by eye.
5. If the user asked to commit or open PRs, run Opening a PR per component or safe batch.

**Reply:** components migrated, the diff result for each, the baseline harness location, what's left.
