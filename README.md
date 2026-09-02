# cstack

Engineering mode for Codex App and CLI.

Codex produces code fast. I kept running into the same problem: a plausible diff is not the same as finished engineering work. The agent still needs to understand the system, find the real cause, stay out of other agents' way, and run the thing it changed.

cstack is how I make that behavior the default. It gives Codex one front door for investigation, design, implementation, debugging, review, verification, PR work, and longer autonomous runs. I want the smallest sound change and a receipt that it works.

## Install

```sh
git clone https://github.com/micic-mihajlo/cstack.git
cp -R cstack/cstack ~/.codex/skills/
```

Restart Codex after installing.

## Get started

Run `$cstack setup-cstack` if you want to choose which Codex models handle coding, judgment, research, and review.

Then put `$cstack` at the start of a task:

```text
$cstack this PR has a subtle bug where scrolling drifts while idle. reproduce it first, then fix and verify.
```

That is the main interface. You do not need to choose a playbook or call every capability yourself. cstack reads the task, picks the workflow, and pulls in the right tools as the work changes.

## What it does

- investigates the code and its history before editing
- chooses from 23 playbooks for bugs, features, refactors, performance work, reviews, PRs, and long-running jobs
- routes work by model strength and gives parallel agents clear ownership
- keeps plans and decision trails for work that spans multiple steps or tasks
- checks the real artifact before claiming success
- cleans up user-facing writing with the bundled Unslop capability

Verification is deliberately strict. Mocks, fakes, monkey patches, and fake service responses do not count as proof.

## A few prompts

```text
$cstack explain how retries work here, then tell me why this path was designed this way.

$cstack reproduce this timeout, find the root cause, fix it, and show me the failing-then-passing evidence.

$cstack review this PR like you are the maintainer who has to own it for two years.

$cstack I am stepping away. migrate every caller in an isolated worktree, delete the old API, and keep a decision log.
```

## Go deeper

The full [cstack reference](cstack/README.md) lists every playbook, capability, and principle. The [guide](cstack/docs/guide/README.md) walks through a real task from setup to verification and shipping.

cstack is a Codex-native adaptation of Cursor's [pstack](https://github.com/cursor/plugins/tree/main/pstack). The port keeps the engineering ideas while translating the workflow to Codex App and CLI. See the [parity manifest](cstack/references/parity-manifest.md) for the exact mapping and the [third-party notices](cstack/THIRD_PARTY_NOTICES.md) for attribution.

MIT.
