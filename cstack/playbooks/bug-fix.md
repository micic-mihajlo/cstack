### Bug fix

**You own this task. Plan, review, verify.** Use independent subagents when they improve the investigation or review. Stay in the lead.

Be scientific. Every shipped line traces to runtime evidence. Belt-and-suspenders that "might help" is a hypothesis, not a fix; it does not ship. When evidence refutes a hypothesis, revert what it motivated. The smallest change the evidence justifies ships, nothing more. Same discipline for Perf, where the evidence is the trace.

1. Reproduce it yourself on the real matching surface from [Codex runtime](../references/codex-runtime.md). Drive the instrumented runtime as far as the available tools allow. If it will not fire, tighten real conditions or add temporary instrumentation. Never manufacture the repro with a mock, fake, stub, or monkey patch. If the required environment or authorization is unavailable, state the exact gap.
2. Binary-search the cause. Form candidate hypotheses and eliminate them with runtime evidence. Seed the map with [How](../references/capabilities/how/SKILL.md) over the subsystem and [Why](../references/capabilities/why/SKILL.md) over its history. When state is unclear, instrument the real program and observe it. Use an active Codex turn, goal, wait, or requested heartbeat for a long hunt. Confirm the surviving mechanism before Architect or Interrogate. A design grounded on an unconfirmed cause can be unanimously wrong.
3. Plan the smallest fix the evidence justifies. Use [Architect](../references/capabilities/architect/SKILL.md) when the change crosses a meaningful boundary. Give any implementation worker exclusive scope, resolve `bug_fix` through [Model roles](../references/model-roles.md), and review its exact diff.
4. Verify on the same surface. The original repro must now pass. `Inconclusive` and wrong-surface evidence are not passes. Supporting tests may prove branch behavior, but the real surface proves the bug is absent.
5. When a real deterministic regression test is possible, land its failing form before the fix so history tells the story. Apply [TDD](../references/capabilities/tdd/SKILL.md). Do not create a mock-based proxy test merely to satisfy this step. Keep the test and fix as separately verifiable units when repository policy permits.
6. Run [Opening a PR](opening-a-pr.md) only when the user asked to publish a PR. Otherwise hand back the verified local change.

How and Why may run as independent read-only lanes.

**Reply:** what was broken, root cause, fix, how you verified. Include only the minimum bounded failing-then-passing excerpt needed to support the claim. Remove credentials, signed URLs, personal or user data, control characters, and active Markdown. When exact raw output is necessary for an audit, keep it in a local access-controlled artifact and share it only with explicit authority.
