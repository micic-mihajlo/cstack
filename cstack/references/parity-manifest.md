# pstack parity manifest

This manifest inventories upstream pstack at commit `fd878692de15a3069c21c8f429eb0b9f2fe178fa` and names the evidence required for stronger claims. On August 31, 2026, `cursor/plugins` had advanced to `b9ddc83c32972210b8a94d389130713e8eed346e`, but `git diff fd878692..b9ddc83 -- pstack` was empty, so `fd878692de15a3069c21c8f429eb0b9f2fe178fa` remains the pinned pstack content commit. Inventory presence, command routing, semantic correspondence, and observed runtime behavior are different facts. A checked-in file proves only its presence.

## Evidence levels

| Level | Meaning | Required evidence |
|---|---|---|
| Inventory | The corresponding source-controlled surface exists. | Exact upstream inventory, mapped path, and structural validation. |
| Addressable | A user can request the surface through this installed Codex skill. | An explicit root command mapping whose target exists. |
| Semantically reviewed | The Codex translation retains the upstream outcome and records intentional differences. | Human review against the pinned upstream file and the runtime contract. |
| Runtime observed | The translated behavior ran on its real supported surface. | Command, environment, immutable revision when relevant, exit status, and artifact receipt from the current release. |

No higher level follows automatically from a lower one. This file records the mapping contract. A release or handoff must carry the actual current receipts.

## Package inventory

| Upstream | cstack | Inventory treatment |
|---|---|---|
| `.cursor-plugin/plugin.json` | `metadata/upstream-plugin.json`, `metadata/codex-port.json`, `agents/openai.yaml` | Pinned upstream metadata, Codex export map, and single-skill UI metadata. |
| `.gitignore` | `.gitignore` | Generated dependency, macOS metadata, and log exclusions. |
| `LICENSE` | `LICENSE` | Pinned upstream license text. |
| `README.md` | `README.md` | Codex installation and runtime guide. |
| `agents/poteto-agent.md` | `agents/cstack-agent.md`, `agents/templates/cstack-agent.toml` | Codex role prompt and optional custom-agent template. |
| `agents/comment-sicko.md` | `agents/comment-sicko.md`, `agents/templates/comment-sicko.toml` | Codex review role and optional custom-agent template. |

The root mode maps to `SKILL.md`. All 23 upstream playbooks are present one-for-one under `playbooks/`. `bugbot-triage.md`, the plan helper, worktree audit, PR watcher, orchestration store, bootstrap, package metadata, lockfile, and launcher have mapped paths under `references/` or `scripts/`. The canonical machine-readable inventory is [metadata/upstream-file-map.json](../metadata/upstream-file-map.json). In that map, `preserved` means the upstream path is retained locally. It does not claim byte identity unless a pinned hash is present. `translated` means the path or product-specific implementation changed for Codex.

All 21 upstream principle leaves are present under `references/principles/`. Each is directly addressable through the single installed front door as `$cstack principle-<filename-stem>`, and `SKILL.md` maps that exact command to the leaf. They are not 21 independently installed Codex skills.

All 23 upstream support skills are present under `references/capabilities/`. Each is directly addressable as `$cstack <capability-directory-name>`, and `SKILL.md` maps that exact command to the module's `SKILL.md`. They are not 23 independently installed Codex skills. A separately packaged Codex plugin would need its own installation and validation before claiming independent discovery.

## Capability inventory

The 23 mapped capability names are:

- `architect`
- `arena`
- `automate-me`
- `blast-radius`
- `bro`
- `create-verification-skill`
- `figure-it-out`
- `how`
- `interrogate`
- `maintain-verification-skill`
- `make-bot-ui`
- `no-comments`
- `recall`
- `reflect`
- `setup-pstack` as `setup-cstack`
- `show-me-your-work`
- `swarm`
- `tdd`
- `teach`
- `technical-writing`
- `typescript-best-practices`
- `unslop`
- `why`

Nested references, prompts, examples, pattern files, decision-log templates, and logging helpers are accounted for under their mapped capability. Their semantic correspondence still requires review; directory count alone does not prove it.

## Excluded upstream material

The twelve upstream Benny files are intentionally omitted. The Codex port had no live event trigger or configured control adapter for them, so keeping the dormant pack made the repository look more complete without providing working behavior. The machine-readable map records each omitted path.

The upstream fake helper is also omitted because cstack forbids fake tests, mocks, stubs, spies, simulated transports, and monkey patches. Its translated tests use pure domain checks and real processes instead.

## Guide and media inventory

All ten guide chapters, the guide index, and all six image assets are present. The former `02-poteto-mode.md` maps to `02-cstack.md`. Image-byte identity is a separate hash check. The guide text is a Codex translation and requires semantic review rather than filename comparison.

## Current verification map

| Check | What it can establish | What it does not establish |
|---|---|---|
| `node scripts/validate-skill.mjs` | Expected inventory counts and names, required files, in-root links, front-door command mappings, selected metadata contracts, forbidden permissive test-double wording, and known product-surface drift checks implemented by that script. | Semantic parity, runtime behavior, connector availability, or security of code the validator does not inspect. |
| Official `quick_validate.py <cstack-root>` | Root skill frontmatter and package-shape checks implemented by the current Codex skill validator. | Nested behavior, command execution, or upstream parity. |
| `bun run typecheck` from `scripts/` | The TypeScript files included by the current `tsconfig` type-check. | Files outside that include set, runtime correctness, or external integration. |
| Real `bun test` files under `scripts/orch/` and `scripts/watch-pr/` | Only the concrete assertions and real filesystem or process paths those named tests execute. | Equivalence to upstream's discarded mocked scenarios or untested branches. |
| `check-plan.mjs <plan>` | Plan skeleton and prose constraints. | Existence of evidence artifacts, checked boxes, current-head binding, or completion. It is structure-only. |
| `orch` against a fresh private temporary store | The exact exercised state, lease, coordinator-attested ledger, anchored evidence/receipt paths, bounded local Graphite topology snapshot, source-recorded gates, and inbox operations. | Authenticated verifier identity, truth of the coordinator's attestation, hosted PR state, merge authorization, unexercised concurrency, crash, or external-service paths. |
| `watch-pr` against an authenticated real GitHub PR | The observed state and policy result for that repository, PR, head SHA, credentials, and time. | Other GitHub states, future heads, or operation without authentication. |
| `worktree-audit.sh` against a real repository | The local state it reports, plus remote state only when an explicit fetch was requested and succeeded. | Deletion safety or current remote state after a local-only run. |
| `smoke-runtime.sh <owner> <repo> <open-pr>` | Only the real operations the script completed for that exact PR and head, with its exit status. | Broad scenario coverage or a substitute for the individual receipts above. |

The upstream repository's mocked and fake-helper tests are not copied. Their coverage is not claimed as preserved. No mock, fake, stub, spy, monkey patch, test-only transport, or simulated service response is accepted as replacement evidence. If a real service or sandbox is unavailable, the release record states the exact unverified boundary.

## Intentional Codex translations

These mappings retain the requested surface while changing product mechanics:

- Cursor mode invocation becomes one installed `$cstack` front door with explicit nested command routing.
- Cursor tasks become current-turn Codex subagents. A separate user-owned Codex task is created only when the user explicitly asks.
- Cursor cloud workers become isolated Codex worktrees or disjoint subagent ownership only when the effective child sandbox is verified to exclude the private live store. Prompt-only ownership is not isolation; without a provable child filesystem boundary, write-capable work stays in the coordinator.
- Cursor transcript paths become named Codex task reads or explicit CLI handoff artifacts.
- Cursor loops become Codex goals, bounded event waits, chat heartbeats, or cron automations as authorized.
- Cursor routines become a server-side Codex SDK adapter, bounded `codex exec`, supported connector, or explicitly experimental app-server integration.
- `orch frontier set` is conditional on the repository already using Graphite and records local topology only. Hosted merge readiness always comes from the exact-head PR watcher. A non-Graphite dependency chain is represented with explicit GitHub base branches and an ordered PR list passed to the watcher; it is not written by the Graphite-only `orch` command.
- PR, merge, deploy, cleanup, external-message, credential-persistence, and automation writes remain behind the user's authority.

When a translation changes observable behavior, record that difference and its evidence. Do not relabel a known gap as parity.
