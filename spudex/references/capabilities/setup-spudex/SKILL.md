---
name: setup-spudex
description: Configure validated Codex agents and model roles for Spudex. Use for $spudex setup-spudex, configure Spudex agents, or change Spudex role models.
---

# Setup Spudex

Persistent configuration is the deliverable. Run only when the user asks for setup or a persistent role change.

## 1. Detect current Codex capabilities

Use the current runtime's verified subagent controls as the source of truth for built-in roles, model slugs, and reasoning efforts. A control named `spawn_agent`, when present, is a runtime-specific contract rather than a universal public API. If Codex exposes a model-listing command or API, use it as supporting evidence. Never write a model or effort pair that the current host has not validated. `inherit-parent` means omit a model override.

## 2. Read current state

Inspect, when present:

- `~/.codex/spudex/model-roles.yaml`
- `~/.codex/agents/spudex-*.toml`
- project `.codex/agents/spudex-*.toml`
- project `.codex/config.toml` agent references

Preserve unrelated user configuration. Do not write to project files unless the user asked for project-local setup.

## 3. Present the role map

Show current and proposed choices for:

- implementation
- repository exploration
- architecture
- correctness review
- code review
- security review
- documentation research
- test-first guidance
- build-error repair
- fast swarm workers
- independent judges

Prefer built-in roles over custom model pinning. Mark unavailable values. Ask one concise question only when the user must choose between valid persistent options. Use `request_user_input` when available. Otherwise ask in chat.

## 4. Write an idempotent configuration

Write `~/.codex/spudex/model-roles.yaml` for personal setup or `.codex/spudex/model-roles.yaml` for explicitly requested project setup. The file contains only validated roles and model overrides.

```yaml
version: 1
roles:
  implementation:
    agent_type: worker
    model: inherit-parent
  exploration:
    agent_type: explorer
    model: inherit-parent
  architecture:
    agent_type: architect
    model: inherit-parent
  correctness_review:
    agent_type: reviewer
    model: inherit-parent
  code_review:
    agent_type: code-reviewer
    model: inherit-parent
  security_review:
    agent_type: security-reviewer
    model: inherit-parent
  documentation:
    agent_type: docs_researcher
    model: inherit-parent
  test_first:
    agent_type: tdd-guide
    model: inherit-parent
  build_errors:
    agent_type: build-error-resolver
    model: inherit-parent
```

Create custom agent TOML files only when a built-in role cannot express the user's requested instructions. The bundle includes validated starting templates at `agents/templates/spudex-agent.toml` and `agents/templates/comment-sicko.toml`; install or adapt them only when the user explicitly asks for persistent agents. Follow official Codex agent configuration. Keep secrets out. Set `sandbox_mode = "read-only"` for exploration and review agents. Treat that field as a requested default, not proof: a live parent permission override can supersede it, so the launcher must verify the child's effective sandbox and fail closed when it is writable. Overwrite only Spudex-owned files so reruns stay idempotent.

## 5. Validate

- Parse the written YAML and TOML.
- Confirm every referenced agent file exists.
- Confirm every real model and reasoning effort is supported by the current host.
- Start one harmless read-only delegation through the configured exploration role and inspect its effective sandbox from runtime metadata or status. Require `read-only`; do not use an attempted write as the probe. If the effective child is writable, stop and report the parent override or host limitation.
- Do not use mocks, fake agents, or monkey patches to validate setup.

## 6. Report

Return the exact files written, personal versus project scope, validated role map, smoke result, and any host capability that prevented full configuration.

Offer a project-local verification skill only when the project lacks a real drive path. Do not create it without the user's approval.
