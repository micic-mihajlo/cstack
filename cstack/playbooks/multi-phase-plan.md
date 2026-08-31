### Multi-phase or multi-PR plan

**You own the plan, not the code. The plan is a checklist an owner runs box by box and the operator audits from the evidence.** For work that spans phases or stacked PRs. The plan is the deliverable. Do not implement.

1. When the change is one or two files with an obvious approach, skip the plan. Say so and stop.
2. Settle observable questions by prototype before writing. For layout, timing, behavior, or API viability, run [Prototype](prototype.md). Keep its branch, SHA, and real artifacts for Appendix A. Ask the operator only about a product preference no safe run can settle.
3. Explore with Codex `explorer` subagents and other read-only roles when parallel reads help. Each returns file pointers, conventions, real test commands, and entry points. Keep raw dumps out of the main context.
4. Copy the skeleton below into the plan file and fill every placeholder. Use the path the operator named. Otherwise write under the current workspace's `docs/`. Keep every heading and sub-block in order. One section per proposed PR. One PR is one change with its own evidence. Name the execution playbook in **How to read this**. Choose Autopilot full, Autopilot stack, or Orchestrate from their terminal-authority rules.
5. Apply [Technical writing](../references/capabilities/technical-writing/SKILL.md), then the installed `$unslop` skill when available. The body is a how-to. Appendices contain explanation and reference. Use concrete prose, no abstract metaphors, no em dashes, and no mid-sentence colons.
6. Run `node <cstack-root>/scripts/check-plan.mjs <plan.md>` and fix every reported line. Resolve `<cstack-root>` to this skill's installed directory. The validator enforces the skeleton, verification rule, and writing constraints.
7. Hand back. Post the plan path and the script's output, then stop. Execution starts on the operator's explicit go, under the execution playbook the plan names.

**Verification.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. That sentence is the verification rule. Every verification block opens with it. The live block is mandatory. Define ten independent live scenarios at the PR head. Run them through [Swarm](../references/capabilities/swarm/SKILL.md) in as many waves as current Codex concurrency allows. Each lane names the real surface, artifact, and pass predicate. No mocks, fakes, or monkey patches. The perf block names the metric, probe, trunk baseline measured first, and numeric failure rule. A PR that changes an interaction is review-gated. The operator reviews screenshots and a video before merge. A PR that changes no interaction writes `**Review gate.** None. <PR id> is not review-gated.` and no boxes under it.

**Control surface.** Pick it from [Codex runtime](../references/codex-runtime.md). Browser and Electron work use the active browser, Chrome, computer-use, Playwright, or the repository's real browser harness. CLI and TUI work use a PTY. Native work uses the real simulator or repository driver. A PR that touches two surfaces gets lanes on both. A missing surface is a risk in Appendix C and a stated verification gap, never a reason to fake proof.

````markdown
# <Program> plan

<Under ten lines. What changes, for whom, the rule the program enforces, and the PR ids in order.>

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `<cstack-root>/playbooks/<execution playbook>.md`. <Who merges, and which proposed PR ids are the operator's items that stop at merge-ready.>

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on her explicit go.
- [ ] On her explicit execution request, create a Codex goal only if she also asked for persistent work. Its text contains the plan path, proposed PR ids in order, verification rule, merge authority, and done condition.
- [ ] Read these from the current installed cstack bundle at program start. Re-read them at every wake.
  - [ ] `<cstack-root>/playbooks/<execution playbook>.md`
  - [ ] `<cstack-root>/references/capabilities/swarm/SKILL.md`
  - [ ] `<cstack-root>/references/codex-runtime.md`
  - [ ] `<cstack-root>/playbooks/opening-a-pr.md`
  - [ ] `<cstack-root>/references/principles/<each applied leaf>.md`
- [ ] Use event waits for active agents, tasks, terminals, and PRs. Add a thread heartbeat only when the operator asked for recurring wakeups. Never hold a long shell sleep.
- [ ] At each wake, re-read the execution playbook and active goal when one exists. Audit active lanes by real side effects. Replace a genuinely stuck lane with a consolidated brief. Report the queue, owner, state, head SHA, new verdicts, landed work, operator gates, and blockers.
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] <PR id> and <PR id> are independent and first. Both branch from `main`.
  - [ ] <PR id> after <PR id>.
- [ ] Hold the file boundaries. <PR id or class> touches only `<glob>`.
- [ ] Hold the review gate. <PR ids> change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] When execution and PR publication are authorized, open the PR ready rather than draft. Use `gh pr create`, or Graphite only when the repository already uses it and `gt` exists.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `$unslop` when available plus an exact-diff self-review before each commit. Apply cstack No comments before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run Swarm. Include one gates lane, the ten live scenarios, the perf lane, and one audit lane that reads the diff and receipts without trusting the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] <The merge or append rule from the execution playbook, with the patch-id rule from `playbooks/shipping.md`.>

### Boot recipe, for every live lane

Each live lane runs against an isolated worktree or read-only checkout at the PR head. Multiple lanes may share one started real service only when they cannot mutate shared state. Otherwise isolate the runtime. Drive the real surface from Codex runtime.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] <Start the backend and the surface. Wait for ready.>
- [ ] <Deliver input only through the control skill's commands. Name the read-only diagnostics.>
- [ ] Save every screenshot to `/tmp/cstack-swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## <Task as a verb phrase> (<PR id>)

**Depends on.** <PR id, or None.>

**Files.**

- [ ] Edit `<path>`.
- [ ] Create `<path>`.
- [ ] Delete `<path>`.

**Build.**

- [ ] <One change. Name the symbol and the file.>

**You see.**

- [ ] <One observable result, with the exact log line or screen state.>

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] <Test file and the case it gains.> Run `<command>`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten scenarios at the PR head, run in waves within current Codex concurrency, per the boot recipe.

- [ ] Lane 1. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 2. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 3. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 4. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 5. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 6. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 7. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 8. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 9. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 10. <Scenario.> Save `<slug>.png`. Pass when <predicate>.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. <What is measured.>
- [ ] Probe. <The command or procedure, run at trunk and at the head, interleaved.>
- [ ] Baseline. Record the trunk <value> first.
- [ ] Rule. <Head against trunk, with the number that fails.>

**Review gate.** The operator reviews before merge.

- [ ] Copy lane <n> screenshots into `<media path>/<pr-id>-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the change in the isolated lane runtime. Save it as `<media path>/<pr-id>-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] <The root merges only when the execution request granted merge authority, or the root appends the verified PR to the review stack and the operator lands it.>

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

<Each open question a prototype answered, with the branch, the SHA, and the artifact links. Each question that stays unproven.>

## Appendix B. Alternatives rejected

<Each approach weighed and why it lost.>

## Appendix C. Risks

<Each risk with the PR it lands in and what the owner watches.>

## Appendix D. Links and reading list

<Docs to read before editing. Which PRs use cstack How and Interrogate. The decision trail follows Show me your work.>
````

**Reply:** the plan path, the PR ids with their dependencies and the review-gated set, what the prototypes proved and what stays unproven, and the check script's output.
