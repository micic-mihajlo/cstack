# Spudex scripts

These scripts carry upstream `pstack` runtime helpers into Codex.

- `check-plan.mjs` validates the multi-phase plan structure and prose rules.
- `worktree-audit.sh` performs a local-only git worktree audit by default. `--fetch` accepts only an authenticated literal GitHub HTTPS or SSH origin, bypasses executable local Git hooks and fsmonitor configuration, refreshes one validated `origin` tracking ref, and queries GitHub PR state. Task usage is checked separately in the Codex app before deletion.
- `watch-pr/watch-pr` reads real GitHub state and classifies the hosted merge frontier. `orch frontier set` records local Graphite topology only and never substitutes for this read.
- `orch/orch.ts` and `orch/store.ts` maintain plain-file program state.
- `log.sh` appends safe decision-log rows and rejects common credential-shaped cells.
- `smoke-runtime.sh` runs the production watcher and orchestration store against a real open GitHub pull request.
- `validate-skill.mjs` checks Spudex structure, parity-critical files, dead links, product-surface residue, and the forbidden-test rule.

The launchers install pinned dependencies into a private staged tree, verify its integrity, and publish it under a single-process lock. The install subprocess is killed after 120 seconds or 4 MiB of captured output; failure preserves the last trusted dependency tree and releases the owner lock. Only the process that acquired the lock removes it. A dead install owner fails closed with the exact stale lock path instead of deleting a possibly live replacement. Install dependencies manually from this directory with `bun install --frozen-lockfile` when needed. Run `bun run typecheck` after changing TypeScript and `bun run validate` after changing the bundle.

No script check uses a mock, fake, stub, spy, or monkey patch. Run `./smoke-runtime.sh <owner> <repo> <open-pr-number>` to validate `watch-pr` against real GitHub state and `orch` against a real temporary store.
