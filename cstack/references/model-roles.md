# Model roles

cstack stores workflow-specific model choices in `model-roles.yaml`. This is the Codex equivalent of pstack's always-applied Cursor model rule.

## Resolution

Read personal `~/.codex/cstack/model-roles.yaml`, then project `.codex/cstack/model-roles.yaml`. A project value overrides the same personal key. Accept only `version: 2`. Report and ignore older or unknown schemas.

Each capability resolves its exact key from the table below. Do not substitute a generic role or a nearby key. Capabilities still choose the appropriate Codex `agent_type`; this file controls only the optional `model` and `reasoning_effort` arguments.

| Key | Consumer | Shape |
|---|---|---|
| `feature_refactoring` | feature and refactoring playbooks | one |
| `bug_fix` | bug-fix playbook | one |
| `perf_issue` | performance playbook | one |
| `hillclimb` | hillclimb playbook | one |
| `judgment_and_prose` | judgment and prose work | one |
| `hardest_tasks` | hardest-task escalation | one |
| `how_explorer` | how exploration | one |
| `how_explainer` | how synthesis | one |
| `how_critics` | how critique panel | list |
| `why_investigators` | why evidence investigators | one |
| `why_synthesizer` | why synthesis | one |
| `reflect_tooling` | reflect tooling reviewer | one |
| `reflect_judgment_divergent_synthesizer` | reflect judgment reviewer, divergent reviewer, and synthesizer | one |
| `arena_runners` | arena candidates | list |
| `arena_cross_judge_pool` | arena judge selection pool | list |
| `swarm_workers` | swarm workers | one |
| `architect_runners` | architect candidates | list |
| `interrogate_reviewers` | interrogate panel | list |

## Applying a value

A real value has this shape:

```yaml
model: gpt-5.6-sol
reasoning_effort: max
```

Pass both fields to the current runtime's subagent control only after validating that exact pair. Model availability and supported efforts can differ by host. Never infer or invent a slug.

The scalar `inherit-parent` and the scalar `auto` both omit model and reasoning overrides, so the child inherits the parent chat model. Both spellings exist for pstack compatibility. These are user choices, not fallback defaults.

If a configured pair is unavailable, report the stale entry and omit its overrides for that run. Do not silently replace it with another model.

## Runtime fallback

Setup is optional. When no valid configuration supplies a key, single-value slots use `auto`. Panel slots use four `auto` entries, preserving pstack's four-run default shape without inventing Codex model choices. `arena_cross_judge_pool` also contains four `auto` entries; Arena still selects only one judge from that pool.

These fallbacks are runtime behavior, not a persistent preset. `$cstack setup-cstack` shows them beside each unset row and waits for the user to choose before writing anything.

## Agent-type compatibility

Validate the pair against the consuming `agent_type`, not just the host's model menu. Some specialist types fix their own model and effort. When the capability's preferred specialist type cannot accept the configured pair, use an override-capable `default` agent with the same explicit capability prompt, scope, and authority. For a writer, an override-capable `worker` is also valid when supported. Verify the effective model and effort after launch.

Do not use a fixed-model `explorer`, `reviewer`, or other specialist and then report that a conflicting configured model ran. The runtime result is authoritative.

## Lists and fan-out

For `how_critics`, `arena_runners`, `architect_runners`, and `interrogate_reviewers`, launch one independent subagent per configured entry, subject to current concurrency. List length controls requested fan-out. Preserve duplicates and order.

Each list item is either `inherit-parent`, `auto`, or one model-and-effort mapping. Alias items count toward fan-out. They omit both overrides for that run.

For `arena_cross_judge_pool`, select one entry. Prefer a family different from the parent and candidate models when possible. If no cross-family entry is available, choose another validated configured entry and disclose the limitation.

When fewer concurrency slots are available than configured entries, run the full configured list in waves. Do not truncate it silently.

## Persistent configuration

Only `$cstack setup-cstack`, or another explicit request to change persistent cstack configuration, may write these files. Setup validates the complete proposed map before its first write, then shows and confirms all 18 workflow slots before publishing atomically. A partial later change still requires showing the complete resulting map before writing.

Custom Codex agents are a separate concern. They live in `~/.codex/agents/` or `.codex/agents/` and may set `model`, `model_reasoning_effort`, `sandbox_mode`, and instructions. Do not use custom agents to hide model choices that belong in the workflow map.

## Ownership

Model choice never changes responsibility. The parent reviews the exact diff, reruns the important check, and writes the final judgment.
