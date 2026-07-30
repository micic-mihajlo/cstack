### Investigation

The deliverable is an evidence-backed answer or recommendation. Stay read-only unless the user also asked for implementation.

1. State the question, scope, and what evidence would answer it.
2. Inspect the smallest relevant source path, tests, configuration, history, or live state. Use `how` when the subsystem is broad enough to need an architectural map. Use `why` only when motivation or regression history matters.
3. Trace the data or control flow from entry point to outcome. Separate confirmed behavior from inference.
4. Verify drift-prone facts against the current source. Run a focused read-only check when it strengthens the answer.
5. Give the concrete answer first. Include file and symbol pointers, tradeoffs, gotchas, and the most useful next step.

Do not edit code, open a PR, or turn a diagnosis into a fix without a change request.

**Reply:** answer, causal path or tradeoff, evidence, uncertainty, and next step.
