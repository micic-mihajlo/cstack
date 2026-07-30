# Multi-phase implementation plan

The plan is the deliverable. Do not implement unless the user also asked for implementation.

## 1. Triage

Skip a written plan when the change is small, local, and has one obvious safe path. Say why a plan would add no value.

Write a plan when the work crosses subsystems, changes architecture or data ownership, has competing approaches, requires staged rollout or migration, or the user asked for a durable artifact.

## 2. Ground the plan

Inspect the repository instructions, worktree state, affected source, tests, generated contracts, deployment shape, and current remote state. For external tickets or PRs, refresh the live source before planning.

State:

- The requested outcome and definition of done.
- In-scope and out-of-scope work.
- Technical, product, security, and operational constraints.
- Existing patterns that should be preserved.
- Unknowns that could change the design.

Ask the user only when an unresolved choice would materially change the result and cannot be discovered safely.

## 3. Choose the design

Name the external inputs, internal representation, state transitions, outputs, and important invariants. For migrations, name the old and target shapes plus the compatibility boundary.

Compare two or three approaches only when credible alternatives exist. Record the choice, rejected option, and tradeoff. Use `architect` for material interface, ownership, persistence, concurrency, or cross-service decisions. Use `interrogate` only for contested or high-risk designs.

## 4. Build the phases

Each phase must produce a checkable, independently reviewable outcome. Size phases by behavior and dependency, not arbitrary file or test counts.

For each phase include:

- Goal and observable outcome.
- Files or subsystems affected.
- Data shape or contract changed.
- Dependencies and rollout order.
- Static checks.
- Runtime or end-to-end verification.
- Rollback or recovery path when the phase changes persisted state, deployment behavior, or an external contract.

Put shared types, schemas, migrations, or test harnesses first only when every later phase depends on them. Remove obsolete paths before adding the target shape. Migrate callers and delete old internal APIs in the same phase when safe.

Use delegation only for bounded independent exploration or disjoint implementation slices when tool policy permits. Keep one owner for shared state.

## 5. Verification strategy

Define the narrowest high-signal check for each phase and the broader project checks required at the end. A compile, type check, or unit test may be necessary but does not prove the real path works.

For bug fixes, preserve the exact failing case and verify it passes after the fix. For performance work, pin the workload, baseline, and target. For refactors, pin current behavior with an equivalence check. For UI work, specify the states and interactions to exercise on the matching surface.

State any environment, credential, fixture, or control-surface gap that could block direct verification.

## 6. Delivery

Use a single Markdown file for a short plan. Use an overview plus phase files only when the plan is long enough that one file becomes hard to navigate. The user chooses the location when they named one. Otherwise keep the deliverable in the active workspace.

The overview contains scope, constraints, target design, phase order, project-level verification, rollout risks, and open decisions. Phase files link back to the overview.

If the user asked to implement, route execution through the matching Spudex playbook. If the user asked only for a plan, stop after handing it back.

**Reply:** scope, chosen design, phases, verification strategy, risks, and decisions still owned by the user.
