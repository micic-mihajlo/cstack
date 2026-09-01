import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const validator = join(scripts, "validate-model-roles.mjs");
const roleKeys = [
  "feature_refactoring",
  "bug_fix",
  "perf_issue",
  "hillclimb",
  "judgment_and_prose",
  "hardest_tasks",
  "how_explorer",
  "how_explainer",
  "how_critics",
  "why_investigators",
  "why_synthesizer",
  "reflect_tooling",
  "reflect_judgment_divergent_synthesizer",
  "arena_runners",
  "arena_cross_judge_pool",
  "swarm_workers",
  "architect_runners",
  "interrogate_reviewers",
];
const listKeys = new Set([
  "how_critics",
  "arena_runners",
  "arena_cross_judge_pool",
  "architect_runners",
  "interrogate_reviewers",
]);

function workspace(t) {
  const path = mkdtempSync(join(tmpdir(), "cstack-model-roles-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function completeRoles(value = { model: "gpt-5.6-sol", reasoning_effort: "high" }) {
  return Object.fromEntries(
    roleKeys.map((key) => [key, listKeys.has(key) ? [structuredClone(value)] : structuredClone(value)])
  );
}

function capabilities(overrides = {}) {
  return {
    models: {
      "gpt-5.6-sol": ["low", "medium", "high", "xhigh", "max", "ultra"],
      "gpt-5.6-terra": ["low", "medium", "high", "xhigh", "max", "ultra"],
      "gpt-5.4": ["medium", "high"],
    },
    agent_types: {
      default: { overrides: true },
      worker: { overrides: true },
      architect: { overrides: true },
      explorer: {
        overrides: false,
        model: "gpt-5.4",
        reasoning_effort: "medium",
      },
      reviewer: {
        overrides: false,
        model: "gpt-5.4",
        reasoning_effort: "high",
      },
      ...overrides,
    },
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function run(config, capabilityPath, ...args) {
  return spawnSync(process.execPath, [validator, config, ...args, "--capabilities", capabilityPath], {
    encoding: "utf8",
  });
}

test("validates a complete real file and a partial project overlay", (t) => {
  const root = workspace(t);
  const personal = join(root, "personal.yaml");
  const project = join(root, "project.yaml");
  const host = join(root, "host.json");
  writeJson(personal, { version: 2, roles: completeRoles() });
  writeJson(project, {
    version: 2,
    roles: { bug_fix: { model: "gpt-5.6-terra", reasoning_effort: "high" } },
  });
  writeJson(host, capabilities());

  const direct = run(personal, host);
  assert.equal(direct.status, 0, direct.stderr);
  assert.deepEqual(JSON.parse(direct.stdout), { valid: true, roles: 18, overlay: false });

  const overlaid = run(personal, host, "--overlay", project);
  assert.equal(overlaid.status, 0, overlaid.stderr);
  assert.deepEqual(JSON.parse(overlaid.stdout), { valid: true, roles: 18, overlay: true });
});

test("rejects missing and unknown roles", (t) => {
  const root = workspace(t);
  const host = join(root, "host.json");
  writeJson(host, capabilities());

  const missing = join(root, "missing.yaml");
  const missingRoles = completeRoles();
  delete missingRoles.bug_fix;
  writeJson(missing, { version: 2, roles: missingRoles });
  const missingResult = run(missing, host);
  assert.equal(missingResult.status, 1);
  assert.match(missingResult.stderr, /missing roles: bug_fix/);

  const unknown = join(root, "unknown.yaml");
  writeJson(unknown, { version: 2, roles: { ...completeRoles(), surprise: "auto" } });
  const unknownResult = run(unknown, host);
  assert.equal(unknownResult.status, 1);
  assert.match(unknownResult.stderr, /unknown roles: surprise/);
});

test("rejects scalar, list, and alias shape errors", (t) => {
  const root = workspace(t);
  const host = join(root, "host.json");
  writeJson(host, capabilities());

  const scalar = join(root, "scalar.yaml");
  writeJson(scalar, {
    version: 2,
    roles: { ...completeRoles(), bug_fix: [{ model: "gpt-5.6-sol", reasoning_effort: "high" }] },
  });
  assert.match(run(scalar, host).stderr, /role bug_fix must be one value/);

  const list = join(root, "list.yaml");
  writeJson(list, { version: 2, roles: { ...completeRoles(), how_critics: [] } });
  assert.match(run(list, host).stderr, /role how_critics must be a non-empty list/);

  const alias = join(root, "alias.yaml");
  writeJson(alias, { version: 2, roles: { ...completeRoles(), bug_fix: "sometimes" } });
  assert.match(run(alias, host).stderr, /invalid alias sometimes/);
});

test("rejects unavailable model and effort pairs", (t) => {
  const root = workspace(t);
  const host = join(root, "host.json");
  writeJson(host, capabilities());

  const model = join(root, "model.yaml");
  writeJson(model, {
    version: 2,
    roles: { ...completeRoles(), bug_fix: { model: "missing", reasoning_effort: "high" } },
  });
  assert.match(run(model, host).stderr, /uses unavailable model missing/);

  const effort = join(root, "effort.yaml");
  writeJson(effort, {
    version: 2,
    roles: {
      ...completeRoles(),
      bug_fix: { model: "gpt-5.6-sol", reasoning_effort: "impossible" },
    },
  });
  assert.match(run(effort, host).stderr, /uses unsupported effort impossible/);
});

test("rejects linked configuration files", (t) => {
  const root = workspace(t);
  const actual = join(root, "actual.yaml");
  const linked = join(root, "linked.yaml");
  const host = join(root, "host.json");
  writeJson(actual, { version: 2, roles: completeRoles() });
  writeJson(host, capabilities());
  symlinkSync(actual, linked);

  const result = run(linked, host);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a regular file/);
});

test("rejects a workflow pair no permitted agent type can run", (t) => {
  const root = workspace(t);
  const config = join(root, "config.yaml");
  const host = join(root, "host.json");
  writeJson(config, {
    version: 2,
    roles: {
      ...completeRoles(),
      how_explorer: { model: "gpt-5.6-terra", reasoning_effort: "high" },
    },
  });
  writeJson(
    host,
    capabilities({
      default: {
        overrides: false,
        model: "gpt-5.6-sol",
        reasoning_effort: "high",
      },
    })
  );

  const result = run(config, host);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /role how_explorer has no compatible agent type/);
});
