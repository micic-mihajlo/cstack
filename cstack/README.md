# cstack

cstack is a Codex-native port of Lauren Tan's [`pstack`](https://github.com/cursor/plugins/tree/main/pstack). It maps pstack's checked-in workflow inventory while translating Cursor mechanics into Codex app and CLI behavior. The [parity manifest](references/parity-manifest.md) separates inventory presence, command routing, semantic review, and runtime evidence instead of treating file presence as behavioral proof.

The goal is less code, better judgment, verifiable outcomes, and parallel work you can actually trust.

## Install

For a new personal installation, put this directory at Codex's current user-skill location:

```text
~/.agents/skills/cstack/
```

Repository-shared installations belong at `.agents/skills/cstack/`. This machine's working copy is intentionally still at `~/.codex/skills/cstack/`, the path supplied by its owner and currently loaded by Codex; do not move or duplicate it as part of an in-place update.

Restart Codex or start a fresh task, then confirm cstack appears in the skill list. Invoke it explicitly with `$cstack`. Its description also supports implicit routing for non-trivial engineering work.

For a team distribution with multiple independently installed skills or MCP dependencies, package and validate the bundle as a Codex plugin. This installation has one installed front door. Nested principles and capabilities do not appear as separate installed skills. Invoke them as `$cstack principle-<slug>` or `$cstack <capability>`; the root skill maps that exact command and loads the matching module in full. `agents/openai.yaml` is Codex skill UI metadata; it is not a custom-agent definition. Persistent custom agents use standalone TOML files under `~/.codex/agents/` or `.codex/agents/`.

## Get started

1. Run `$cstack setup-cstack` only if you want persistent agent or model-role configuration.
2. Use `$cstack` for engineering work that needs rigor.

```text
$cstack this PR has a subtle bug where scrolling drifts while idle. reproduce it first, then fix and verify.
```

```text
$cstack I am stepping away. migrate every caller in an isolated worktree. done means zero old callers, the old API is deleted, and the real command passes. keep a decision log.
```

The [guide](docs/guide/README.md) walks through setup, prompting, architecture, verification, PR work, overnight runs, and customization.

## What the mode does

When invoked, cstack:

1. opens an active plan for multi-step work
2. reads the relevant principle leaves
3. matches one of 23 playbooks and copies its steps into the plan
4. loads capability modules only when a step needs them
5. uses bounded subagents with explicit ownership
6. verifies the real artifact
7. writes a concise answer framed for the user and the next maintainer

Codex has no identical sticky-mode flag. cstack remains the operating contract for the current task and resumed work. Say so when you want to opt out. See [Codex runtime](references/codex-runtime.md) for every product translation.

## The 23 playbooks

| Playbook | Use it for |
|---|---|
| [Investigation](playbooks/investigation.md) | A read-only question about mechanics, history, confidence, or a choice. |
| [Bug fix](playbooks/bug-fix.md) | Reproduce, root-cause, fix, and prove a defect. |
| [Perf issue](playbooks/perf-issue.md) | Trace and improve measured slowness against a baseline. |
| [Hillclimb](playbooks/hillclimb.md) | Repeated scientific improvement of one metric. |
| [Runtime forensics](playbooks/runtime-forensics.md) | Diagnose a live leak, spin, glitch, or other runtime symptom. |
| [Trace forensics](playbooks/trace-forensics.md) | Diagnose a captured profile, trace, dump, or snapshot. |
| [Feature](playbooks/feature.md) | Build new or changed behavior from a named data shape. |
| [Refactoring](playbooks/refactoring.md) | Preserve behavior while changing structure. |
| [Prototype](playbooks/prototype.md) | Build a throwaway real probe to settle an empirical fork. |
| [Visual parity](playbooks/visual-parity.md) | Match two visual implementations through measured inspection. |
| [Authoring a skill](playbooks/authoring-a-skill.md) | Write or edit a Codex skill through `$skill-creator`. |
| [Eval](playbooks/eval.md) | Compare skill or prompt behavior with blind candidates and real tasks. |
| [Babysit](playbooks/babysit.md) | Drive a PR or stack to merge-ready. |
| [Shipping](playbooks/shipping.md) | Independently verify and land an authorized contiguous PR frontier. |
| [Autonomous run](playbooks/autonomous-run.md) | Drive one long task to a measurable predicate. |
| [Orchestrate](playbooks/orchestrate.md) | Coordinate a durable multi-day program with many PRs and subagents. |
| [Autopilot-full](playbooks/autopilot-full.md) | Run an authorized queue of independent PRs to merged. |
| [Autopilot-stack](playbooks/autopilot-stack.md) | Build and verify a linear stack without merging it. |
| [Session pickup](playbooks/session-pickup.md) | Resume a named task, explicit handoff, or pushed branch. |
| [Pause safely](playbooks/pause-safely.md) | Checkpoint in-flight work for clean resumption. |
| [Multi-phase plan](playbooks/multi-phase-plan.md) | Produce a durable phased or multi-PR plan. |
| [Worktree cleanup](playbooks/worktree-cleanup.md) | Audit disk and delete only exact approved candidates. |
| [Opening a PR](playbooks/opening-a-pr.md) | Prepare and publish a focused PR when the user asked. |

## Capability modules

cstack routes to these modules as needed. You can also ask for one directly as `$cstack <name>`. This is command routing through the single installed cstack skill, not independent skill installation.

| Capability | Use it for |
|---|---|
| [how](references/capabilities/how/SKILL.md) | Explain how a subsystem works from code evidence. |
| [why](references/capabilities/why/SKILL.md) | Reconstruct why code exists from source control, issues, docs, chat, observability, errors, and analytics. |
| [recall](references/capabilities/recall/SKILL.md) | Rebuild current context from named Codex tasks and the shared record. |
| [blast-radius](references/capabilities/blast-radius/SKILL.md) | Prove what a small-looking change could break. |
| [architect](references/capabilities/architect/SKILL.md) | Settle boundaries, types, ownership, and caller shape before code. |
| [arena](references/capabilities/arena/SKILL.md) | Compare several independent attempts and graft the best parts. |
| [swarm](references/capabilities/swarm/SKILL.md) | Partition coverage or race arms and return one report. |
| [interrogate](references/capabilities/interrogate/SKILL.md) | Run skeptical multi-agent review of a design or diff. |
| [automate-me](references/capabilities/automate-me/SKILL.md) | Draft a personal mode from scoped task evidence. |
| [make-bot-ui](references/capabilities/make-bot-ui/SKILL.md) | Build a secure UI over a real Codex-backed routine. |
| [setup-cstack](references/capabilities/setup-cstack/SKILL.md) | Configure validated Codex agents and role models. |
| [reflect](references/capabilities/reflect/SKILL.md) | Turn task lessons into approved skill improvements. |
| [teach](references/capabilities/teach/SKILL.md) | Combine how and why into a plain explanation. |
| [tdd](references/capabilities/tdd/SKILL.md) | Write a real failing regression check before a bug fix. |
| [no-comments](references/capabilities/no-comments/SKILL.md) | Remove narration and surface constraints that belong in structure. |
| [typescript-best-practices](references/capabilities/typescript-best-practices/SKILL.md) | Apply the type-system discipline to TypeScript and TSX. |
| [figure-it-out](references/capabilities/figure-it-out/SKILL.md) | Design a rigorous bespoke run when no playbook fits. |
| [show-me-your-work](references/capabilities/show-me-your-work/SKILL.md) | Keep an auditable decision trail. |
| [create-verification-skill](references/capabilities/create-verification-skill/SKILL.md) | Generate a project-local real-app verification skill. |
| [maintain-verification-skill](references/capabilities/maintain-verification-skill/SKILL.md) | Repair drift in a verification feature map. |
| [unslop](references/capabilities/unslop/SKILL.md) | Route writing through the installed `$unslop` standard. |
| [bro](references/capabilities/bro/SKILL.md) | Restate the last message in short, plain human language. |
| [technical-writing](references/capabilities/technical-writing/SKILL.md) | Apply a layered engineering-doc standard. |

## Subagent roles

[cstack agent](agents/cstack-agent.md) and [Comment Sicko](agents/comment-sicko.md) are bundled role prompts. Matching installable TOML templates live under [agents/templates](agents/templates). The root mode resumes an existing `cstack-agent` thread instead of starting a sibling. Codex persistent custom agents are TOML files under `~/.codex/agents/` or `.codex/agents/`; `$cstack setup-cstack` installs them only when the user asks for persistent agents and a built-in role cannot express the requested behavior. Comment Sicko's template requests `sandbox_mode = "read-only"`, and setup must verify that the spawned child is effectively read-only because a live parent permission override can supersede that default.

Subagents share the current filesystem. Parallel writers need disjoint ownership or isolated worktrees. The root agent reviews every resulting diff and owns the final conclusion.

## The 21 principles

Invoke any leaf directly as `$cstack principle-<slug>`. The root mapping loads that leaf in full. These leaves are not registered as 21 separate Codex skills in this installation.

| Principle | Group | Rule |
|---|---|---|
| [Laziness Protocol](references/principles/laziness-protocol.md) | Core | Bias toward deletion and the smallest change. |
| [Foundational Thinking](references/principles/foundational-thinking.md) | Core | Get types, data structures, sequencing, and shared state right first. |
| [Redesign from First Principles](references/principles/redesign-from-first-principles.md) | Core | Integrate a requirement as if it had existed from day one. |
| [Subtract Before You Add](references/principles/subtract-before-you-add.md) | Core | Remove dead weight before building the target. |
| [Minimize Reader Load](references/principles/minimize-reader-load.md) | Core | Collapse layers and hidden state. |
| [Outcome-Oriented Execution](references/principles/outcome-oriented-execution.md) | Core | Converge on the target instead of preserving throwaway transitions. |
| [Experience First](references/principles/experience-first.md) | Core | Prefer user experience over implementation convenience. |
| [Exhaust the Design Space](references/principles/exhaust-the-design-space.md) | Core | Compare real alternatives before committing. |
| [Build the Lever](references/principles/build-the-lever.md) | Core | Build the smallest tool that does or proves the job. |
| [Model the Domain](references/principles/model-the-domain.md) | Architecture | Encode the domain in a structure instead of scattered conditionals. |
| [Boundary Discipline](references/principles/boundary-discipline.md) | Architecture | Validate at boundaries and keep internal logic pure. |
| [Type System Discipline](references/principles/type-system-discipline.md) | Architecture | Make illegal states unrepresentable. |
| [Make Operations Idempotent](references/principles/make-operations-idempotent.md) | Architecture | Make retries converge. |
| [Migrate Callers Then Delete Legacy APIs](references/principles/migrate-callers-then-delete-legacy-apis.md) | Architecture | Migrate and delete in one wave when safe. |
| [Separate Before Serializing Shared State](references/principles/separate-before-serializing-shared-state.md) | Architecture | Remove sharing before adding coordination. |
| [Prove It Works](references/principles/prove-it-works.md) | Verification | Exercise the real artifact. |
| [Fix Root Causes](references/principles/fix-root-causes.md) | Verification | Reproduce first and fix the first causal fault. |
| [Sequence Work into Verifiable Units](references/principles/sequence-verifiable-units.md) | Verification | End each small unit with a check. |
| [Guard the Context Window](references/principles/guard-the-context-window.md) | Delegation | Route bulk to bounded subagents. |
| [Never Block on the Human](references/principles/never-block-on-the-human.md) | Delegation | Proceed on safe reversible work and ask only for real decisions. |
| [Encode Lessons in Structure](references/principles/encode-lessons-in-structure.md) | Meta | Prefer mechanisms over repeated prose. |

## Verification rule

This port is stricter than upstream:

- fake tests are forbidden
- mock-based tests are forbidden
- fakes, stubs, spies, simulated transports, and monkey patches are forbidden

Use real integration paths, real supported fixtures, an authorized sandbox, or direct runtime verification. If a boundary cannot run, report the exact gap.

The production runtime helpers live in [scripts](scripts/README.md). The upstream mocked suite is not included, and its coverage is not claimed. Current evidence is narrower and named in the [parity manifest](references/parity-manifest.md). `check-plan.mjs` validates only a plan's structure and prose. It does not prove that evidence files exist, boxes are checked, or a receipt matches the current PR head. Runtime, integration, and external-service claims need their own real evidence and recorded exit status.

## Planning

Codex already has plan mode and an active plan surface. cstack uses them when the work benefits from a durable checklist. Small obvious changes skip ceremony. The [multi-phase playbook](playbooks/multi-phase-plan.md) produces a plan and stops unless the user separately asks for execution.

## Make it yours

Use `$cstack automate-me` to draft a personal mode from the current task and explicitly scoped prior tasks. Use `$cstack setup-cstack` to configure role models. Both preserve unrelated configuration and write persistently only when asked.

## Parity and license

The [parity manifest](references/parity-manifest.md) accounts for the upstream inventory at commit `fd878692de15a3069c21c8f429eb0b9f2fe178fa` and states the evidence required for each stronger parity claim.

MIT. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
