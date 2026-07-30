### Feature

Own the behavior from input to output.

1. State the user-visible outcome and definition of done.
2. Name the data flow. Identify external inputs, internal representation, state transitions, outputs, and important invariants.
3. Inspect the affected subsystem, repository conventions, generated contracts, and existing tests. Reuse the house pattern unless there is evidence it is the problem.
4. Compare alternatives only when multiple viable designs have materially different costs. Use `architect` for material boundary decisions. Use `interrogate` only for contested or high-risk choices.
5. Plan the smallest vertical slice that reaches the outcome. Identify blocking prerequisites and independent workstreams. Serialize shared writes.
6. Implement the slice. Delegation is optional and must have a bounded deliverable and disjoint write scope.
7. Verify the narrow behavior, the actual product path when available, and broader checks proportional to the blast radius.
8. Self-review the exact diff. Remove speculative abstractions, compatibility paths, and unrelated cleanup.
9. If the user asked to commit or open a PR, run Opening a PR.

**Reply:** what changed, the chosen design, data flow, verification, residual risk, and open decisions.
