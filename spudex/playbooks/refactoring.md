### Refactoring

The structure changes. The observable behavior does not.

1. Pin the behavior contract with existing tests, a characterization test, snapshot, equivalence harness, or recorded output. Type checking and lint alone are not a behavior contract.
2. Name the target module layout, types, and call graph. Use `architect` only when the refactor changes a material interface or ownership boundary.
3. Subtract first. Delete dead paths, collapse one-caller wrappers, and remove redundant validators before introducing the target shape.
4. Move in small behavior-preserving steps. Migrate callers and delete the old internal API in the same wave unless external compatibility is a stated requirement.
5. Delegate only bounded mechanical edits with disjoint file scope. Review the actual diff.
6. Prove equivalence against the pinned contract and the real artifact when possible.
7. Confirm that reader load fell. Count removed layers, reduced mutable state, or simplified call paths. Remove only your own cleanup that does not earn its diff.
8. Self-review for accidental behavior change and unrelated edits.
9. If the user asked to commit or open a PR, run Opening a PR.

**Reply:** the contract, structural change, equivalence proof, reader-load improvement, and residual risk.
