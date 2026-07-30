### Performance issue

Own the measurement story. Source inspection explains a measurement. It does not replace one.

1. Define the workload, environment, metric, and acceptable target.
2. Capture a repeatable baseline on the matching surface. Save the command or artifact.
3. Use the trace or profile to find the dominant cost. Confirm the hot path before editing.
4. Change one causal factor at a time. Use `architect` only when the fix changes a material system boundary.
5. Re-run the same workload under the same conditions. Report the baseline, new value, delta, and variance or confidence limits when relevant.
6. Run correctness checks so the speedup does not change behavior. Inspect the exact diff for benchmark-specific shortcuts.
7. If the user asked to commit or open a PR, run Opening a PR and include the measurement evidence.

**Reply:** workload, baseline, cause, change, post-change result, correctness checks, and artifact paths.
