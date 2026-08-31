# Model roles

Codex role configuration replaces pstack's Cursor model rule.

## Defaults

Inherit the parent model and reasoning effort unless the current runtime's subagent controls validate an override or the user has configured a custom agent. When the current runtime calls that control `spawn_agent`, treat its schema as runtime-specific evidence rather than a universal public API. When present, read personal `~/.codex/cstack/model-roles.yaml` and project `.codex/cstack/model-roles.yaml`, with the project file taking precedence. Ignore and report unavailable entries instead of sending an invalid spawn.

Use available agent roles before hardcoding a model.

| Work | Preferred role |
|---|---|
| Mechanical implementation | `worker` |
| Repository mapping and large reads | `explorer` |
| Correctness and risk review | `reviewer` or `code-reviewer` |
| Security-sensitive changes | `security-reviewer` |
| API and framework documentation | `docs_researcher` |
| Test-first design | `tdd-guide` |
| Build and type failures | `build-error-resolver` |
| Architecture | `architect` |

When a capability needs model diversity, use distinct validated models if available. If only one model family is available, vary the agent role and reasoning effort, keep prompts independent, and disclose that the result is multi-agent but not cross-family.

## Persistent configuration

Only change persistent configuration when the user invokes `$cstack setup-cstack` or otherwise asks.

Codex supports personal custom agents in `~/.codex/agents/` and project agents in `.codex/agents/`. A custom agent file can set `model`, `model_reasoning_effort`, `sandbox_mode`, and instructions. Project-wide defaults can live under `[agents]` in `.codex/config.toml`.

Validate every model and effort pair against the current host before writing it. An unavailable model breaks delegation. `inherit-parent` means omit the model override.

## Ownership

Model choice never changes responsibility. The parent reviews the exact diff, reruns the important check, and writes the final judgment.
