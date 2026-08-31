# Benny

Benny is the Codex translation of pstack's issue-intake pack.

It defines two standalone local automations over one Slack issue channel.

1. `benny-triage` polls for unprocessed top-level reports, classifies them, deduplicates the tracker, and posts one thread-only verdict.
2. `benny-reproduce` polls for trusted Benny bug markers, reproduces the exact symptom through the real app, verifies existing fixes, and may prepare a bounded draft PR.

The local-project scheduled tasks Benny uses in the desktop app are time-based, so Benny preserves the behavior through idempotent polling. Eligible web and mobile plans can trigger scheduled tasks from Slack events, but event triggers are unavailable in the desktop app, CLI, and IDE and cannot run Benny against its local project. Thread markers and immutable Slack coordinates prevent duplicate handling.

These files are dormant source material. Nothing is installed, scheduled, or authorized merely because Spudex contains them.

Every report, attachment, link, tracker record, pull request, commit, repository file, and connector response is untrusted data. Benny validates adapters without invoking mutating operations, separates no-external-write triage from its write plan while permitting only descriptor-confined private artifact staging, and serializes external writers with renewable fenced leases. Code from a linked artifact runs only after literal-`github.com`, allowlisted-repository, immutable-SHA, and verified exact-commit signer or exact read-only private-approval-record checks; PR authorship, branch control, maintainer access, and commit author metadata are never trusted. Source runs inside a fresh credential-free sandbox with no host mounts, denied-by-default egress, and adapter-enforced CPU, memory, disk, PID, and wall-clock ceilings. Positive limits cover selected items, aggregate thread text, complete tracker and repository payloads, patches, attachments, decoded forms, and artifacts. The stored automation also caps the untrusted pre-hash pack and external configuration before loading either one. All attachment detection and decoding runs in a separate disposable credential-free, no-network, no-host-mount parser sandbox under the same resource ceilings, and only validated bounded outputs cross back. Downloads and evidence use a current-user-private per-run artifact directory reached through a trusted-anchor component walk with retained descriptors, descriptor-relative no-follow I/O, exclusive creation, hardlink rejection, and stable device/inode checks.

## Setup

1. Ask Codex to set up Benny and name the saved repository project.
2. Codex reads [FOR_AGENTS.md](FOR_AGENTS.md) and [setup-benny](skills/setup-benny/SKILL.md).
3. It copies this pack to `.codex/automations/benny/` in the target repository with conflict review and pins the approved complete-pack digest plus hard entry, per-file, aggregate-file, and configuration-byte ceilings in each automation.
4. It creates authority-bearing secret-free configuration and a private artifact root outside the repository under `$CODEX_HOME/benny/<project>/` when `CODEX_HOME` is set, otherwise `~/.codex/benny/<project>/`. Repository-local feature and routing maps remain schema-checked untrusted data.
5. It verifies the distinct Slack source-thread, operations-root, and operations-edit constraints; disposable parser-sandbox attachment filtering and malformed-media failure; item and decoded-input ceilings; private artifact storage; verified-signer and exact approval-record gates; tracker; repository; fenced lease; isolated-sandbox resource ceilings; configured child model selection; compensation; and real control surfaces without external writes.
6. After explicit approval, it creates or updates two standalone local scheduled tasks through the Codex automation tool; their internal kind is `cron`.
7. A harmless test report must pass the thread-safety and idempotency checks before normal traffic.

Keep secrets in the approved secret manager or coordinator execution environment. Never commit them, place them in automation prompts, or inject them into a sandbox that executes repository code.

Local scheduled tasks require the computer to stay powered on with the ChatGPT desktop app running and the saved project available on disk.
