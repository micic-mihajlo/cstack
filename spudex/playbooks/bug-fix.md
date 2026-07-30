### Bug fix

Own the causal chain. Every shipped line must trace to evidence about the failure.

1. Capture the failing behavior on the matching surface when possible. Record the exact input, state, status, error, and expected result. If direct reproduction is unavailable, gather the strongest current evidence and state the gap.
2. Trace the earliest wrong state. Form a small set of hypotheses, use repository history and runtime evidence to eliminate them, and separate confirmed facts from guesses.
3. Plan the smallest fix that removes the cause. Use `architect` only when the fix changes a material interface, ownership boundary, persistence model, concurrency model, or cross-service contract.
4. Add a regression test first when it is stable, local, and cheap. Skip it when the required harness would be more brittle than the bug, then name the runtime check that replaces it.
5. Implement the fix. Delegate only a bounded independent investigation or mechanical slice when tool policy permits. Review every delegated artifact yourself.
6. Re-run the original failing path on the same surface. Run focused tests, then broader checks based on blast radius. Remove only your own changes that evidence did not justify.
7. Inspect the exact diff for scope creep, hidden fallback paths, private data, and unrelated edits.
8. If the user asked to commit or open a PR, run Opening a PR.

**Reply:** the failure, root cause, fix, direct verification, tests, and residual uncertainty.
