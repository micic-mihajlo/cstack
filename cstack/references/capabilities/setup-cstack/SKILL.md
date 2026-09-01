---
name: setup-cstack
description: Configure validated Codex model and reasoning choices for every cstack workflow slot. Use for $cstack setup-cstack, configure cstack models, or change cstack role models.
---

# Setup cstack

Persistent configuration is the deliverable. Run only when the user asks for setup or a persistent role change.

This is a configuration interview. Do not replace it with presets. Do not write a configuration until the user has seen and confirmed every slot.

## 1. Detect current Codex capabilities

Use the current runtime's verified subagent controls as the source of truth for model slugs, reasoning efforts, agent types, and which agent types accept overrides. A control named `spawn_agent`, when present, is a runtime-specific contract rather than a universal public API. If Codex exposes a model-listing command or API, use it as supporting evidence.

Build the exact menu of supported `(model, reasoning_effort)` pairs. Include `inherit-parent` and `auto` as explicit choices, but never select either on the user's behalf. In Codex, a model slug and its reasoning effort are separate fields. Never smuggle effort into a made-up model slug.

Some built-in agent types have a fixed model and reasoning effort. Record that compatibility. A workflow with a real configured pair must use a compatible agent type, falling back to an override-capable `default` agent with the capability's explicit prompt and authority when its specialist type is fixed. Never claim a pair is active merely because the slug exists on the host.

## 2. Read current state

Inspect, when present:

- `~/.codex/cstack/model-roles.yaml`
- project `.codex/cstack/model-roles.yaml`
- `~/.codex/agents/cstack-*.toml`
- project `.codex/agents/cstack-*.toml`
- project `.codex/config.toml` agent references

Preserve unrelated user configuration. Do not write to project files unless the user asked for project-local setup.

Only version 2 of `model-roles.yaml` uses the workflow-slot contract below. Treat an older or unknown schema as incompatible. Show it to the user as stale and replace it only after the new choices are confirmed.

## 3. Interview every workflow slot

Show all 18 rows with the current value or `unset (runtime fallback: ...)`. Ask the user to accept or change each row. Offer only detected model and effort pairs plus `inherit-parent` and `auto`. The runtime fallback keeps cstack usable before setup; it is not a value to persist without confirmation.

| # | Configuration key | Workflow slot | Shape |
|---:|---|---|---|
| 1 | `feature_refactoring` | feature and refactoring | one |
| 2 | `bug_fix` | bug fix | one |
| 3 | `perf_issue` | performance issue | one |
| 4 | `hillclimb` | hillclimb | one |
| 5 | `judgment_and_prose` | judgment and prose | one |
| 6 | `hardest_tasks` | hardest tasks | one |
| 7 | `how_explorer` | how explorer | one |
| 8 | `how_explainer` | how explainer | one |
| 9 | `how_critics` | how critics | list |
| 10 | `why_investigators` | why investigators | one |
| 11 | `why_synthesizer` | why synthesizer | one |
| 12 | `reflect_tooling` | reflect tooling reviewer | one |
| 13 | `reflect_judgment_divergent_synthesizer` | reflect judgment, divergent, and synthesizer | one |
| 14 | `arena_runners` | arena runners | list |
| 15 | `arena_cross_judge_pool` | arena cross-judge pool | list |
| 16 | `swarm_workers` | swarm workers | one |
| 17 | `architect_runners` | architect runners | list |
| 18 | `interrogate_reviewers` | interrogate reviewers | list |

For a list slot, one subagent is launched per entry unless that capability documents selection from a pool. The list's length therefore controls fan-out. Preserve order. Duplicates are allowed when the user deliberately wants repeated independent runs on the same model.

`arena_cross_judge_pool` is a selection pool, not automatic fan-out. Arena chooses one configured judge, preferring a model family not used by the parent or candidates when possible.

Do not collapse these slots into generic agent types such as `worker`, `reviewer`, or `explorer`. Capabilities choose agent types. This setup chooses models and reasoning effort for the specific workflow calls.

If `request_user_input` is available and can represent the full interview without hiding rows, use it in bounded batches. Otherwise print a compact numbered sheet and wait for the user's answers. A partial answer updates only those named rows.

## 4. Validate the proposed configuration

Build the complete proposed document in a private temporary file outside the persistent target. Do not replace or modify the current configuration yet.

Use this schema:

```yaml
version: 2
roles:
  feature_refactoring:
    model: gpt-example
    reasoning_effort: high
  how_critics:
    - model: gpt-example
      reasoning_effort: high
    - model: another-example
      reasoning_effort: max
  arena_cross_judge_pool:
    - model: another-example
      reasoning_effort: max
```

The example slugs are structural placeholders only. Never write them. Write all 18 keys in the real file, including single-value and list slots.

Represent `inherit-parent` and `auto` as scalar values:

```yaml
roles:
  bug_fix: inherit-parent
  perf_issue: auto
```

`inherit-parent` and `auto` both omit model and reasoning overrides, so the child inherits the parent chat model. Keep both spellings for pstack compatibility. Do not attach a reasoning effort to either scalar.

Aliases are also valid list entries and count toward fan-out:

```yaml
roles:
  how_critics:
    - inherit-parent
    - auto
    - model: gpt-5.6-sol
      reasoning_effort: max
```

Every list item must be either one alias or one validated model-and-effort pair.

Run `scripts/validate-model-roles.mjs <candidate.yaml> --capabilities <capabilities.json>`. The capability file contains the current host's detected model-to-effort mapping plus the agent types that are actually available and whether each accepts overrides:

```json
{
  "models": {
    "gpt-5.6-sol": ["low", "medium", "high", "xhigh", "max", "ultra"]
  },
  "agent_types": {
    "default": { "overrides": true },
    "explorer": {
      "overrides": false,
      "model": "gpt-5.4",
      "reasoning_effort": "medium"
    }
  }
}
```

Include every detected model, effort, and available agent type. An override-capable type needs only `overrides: true`. A fixed type requires `overrides: false`, `model`, and `reasoning_effort`. For an explicitly requested project overlay, also pass `--overlay <project-candidate.yaml>` against the validated personal file. Require:

- `version: 2`, all 18 keys in the personal file, and no unknown keys
- a non-empty list for every list slot and exactly one value for every single slot
- alias-or-pair shape for every value
- every real model-and-effort pair in the detected host mapping
- every workflow can launch its pair through a compatible agent type
- every referenced custom agent file exists

Fix invalid user input in the proposal and show the issue. Never publish an invalid candidate.

## 5. Confirm and publish atomically

Show the complete validated 18-row map and ask for one final confirmation. Only after confirmation, write `~/.codex/cstack/model-roles.yaml` for personal setup or `.codex/cstack/model-roles.yaml` for explicitly requested project setup.

Create the candidate as a mode-`0600` regular file in the destination directory, refuse a linked or non-regular destination, then atomically rename it over the cstack-owned target. Preserve unrelated configuration. A crash must leave either the old complete file or the new complete file, never a partial file.

Create custom agent TOML files only when a built-in role cannot express user-requested persistent instructions. The bundle includes starting templates at `agents/templates/cstack-agent.toml` and `agents/templates/comment-sicko.toml`; install or adapt them only when the user explicitly asks for persistent agents. Follow official Codex agent configuration. Keep secrets out. Overwrite only cstack-owned files so reruns stay idempotent.

## 6. Smoke the runtime

- Start one harmless child through the `how_explorer` model-selection path and inspect its effective model and reasoning effort from runtime metadata or status. Require the configured pair. This proves selection, not read-only isolation.
- Separately inspect whether the current host exposes a compatible read-only launcher for `how_explorer`. Do not use an attempted write as the probe. When none exists, keep the already schema-and-model-validated configuration, report that read-only delegation is unavailable on this host, and do not claim full How runtime verification.
- When a compatible read-only launcher exists, run the harmless `how_explorer` smoke through it and require both the configured pair and an effective read-only sandbox.
- Do not use mocks, fake agents, mock tests, or monkey patches to validate setup.

## 7. Report

Return the exact files written, personal versus project scope, the complete 18-row role map, validation results, smoke result, and any host capability that prevented full configuration.

Offer a project-local verification skill only when the project lacks a real drive path. Do not create it without the user's approval.
