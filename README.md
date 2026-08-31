# cstack

pstack for Codex App and CLI.

This is the engineering setup I use with Codex. The main piece is Spudex, a Codex-native port of Cursor's [pstack](https://github.com/cursor/plugins/tree/main/pstack). It covers codebase investigation, planning, implementation, debugging, reviews, verification, PRs, and longer autonomous runs.

The repo also includes Unslop, the writing skill I use to strip AI habits from prose without sanding off the writer's voice.

## What's inside

- `spudex/` contains the engineering system, playbooks, helper skills, runtime tools, and docs.
- `unslop/` contains the standalone writing skill.

## Install

Clone the repo, then copy either skill into your Codex skills folder:

```sh
git clone https://github.com/micic-mihajlo/cstack.git
cp -R cstack/spudex ~/.codex/skills/
cp -R cstack/unslop ~/.codex/skills/
```

Restart Codex after installing.

Unslop incorporates MIT-licensed material from `blader/humanizer` and `DeweyMarco/declankify`. Its third-party notices are included in the skill folder.
