# Third-party notices

cstack is a Codex-native adaptation of [`pstack`](https://github.com/cursor/plugins/tree/main/pstack), pinned for this port at commit `fd878692de15a3069c21c8f429eb0b9f2fe178fa`.

The upstream project is Copyright (c) 2026 Lauren Tan and licensed under the MIT License. The original license is preserved in [LICENSE](LICENSE).

The adaptation keeps the upstream workflow, principle, automation, guide, agent, and runtime intent while replacing Cursor-only surfaces with documented Codex app and CLI behavior. The local prohibition on mocks, fakes, and monkey patches is stricter than upstream.

The runtime helper lockfile installs these packages; generated `node_modules` content is not part of the skill bundle:

- Commander 14.0.0, Copyright (c) TJ Holowaychuk and contributors, MIT License.
- TypeScript 7.0.2, Copyright (c) Microsoft Corporation, Apache License 2.0.
- Bun type definitions 1.3.14, Copyright (c) Oven Sh, MIT License.
- Node.js type definitions 26.1.2 from DefinitelyTyped, MIT License.
- Undici type definitions 8.3.0, Copyright (c) Matteo Collina and Undici contributors, MIT License.

Package versions and integrity hashes are pinned in [scripts/bun.lock](scripts/bun.lock). Their full license texts are installed with the packages by `bun install --frozen-lockfile`.
