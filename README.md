# cstack

pstack for Codex App and CLI.

This is the engineering setup I use with Codex. It is a Codex-native port of Cursor's [pstack](https://github.com/cursor/plugins/tree/main/pstack), with codebase investigation, planning, implementation, debugging, reviews, verification, PR work, and longer autonomous runs in one skill.

Unslop is included as one of cstack's callable capabilities. It strips AI habits from prose without sanding off the writer's voice.

## What's inside

- `cstack/` contains the main skill, every capability, the playbooks, runtime tools, and docs.

## Install

Clone the repo, then copy cstack into your Codex skills folder:

```sh
git clone https://github.com/micic-mihajlo/cstack.git
cp -R cstack/cstack ~/.codex/skills/
```

Restart Codex after installing.

The bundled Unslop capability incorporates MIT-licensed material from `blader/humanizer` and `DeweyMarco/declankify`. Its third-party notices are included in the capability folder.
