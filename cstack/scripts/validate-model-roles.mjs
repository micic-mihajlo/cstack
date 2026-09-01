#!/usr/bin/env bun

import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const aliases = new Set(["inherit-parent", "auto"]);
const roleAgentCandidates = {
  feature_refactoring: ["worker", "default"],
  bug_fix: ["worker", "default"],
  perf_issue: ["worker", "default"],
  hillclimb: ["worker", "default"],
  judgment_and_prose: ["default"],
  hardest_tasks: ["default"],
  how_explorer: ["explorer", "default"],
  how_explainer: ["explorer", "default"],
  how_critics: ["reviewer", "architect", "default"],
  why_investigators: ["explorer", "default"],
  why_synthesizer: ["explorer", "default"],
  reflect_tooling: ["reviewer", "default"],
  reflect_judgment_divergent_synthesizer: ["reviewer", "default"],
  arena_runners: ["worker", "default"],
  arena_cross_judge_pool: ["reviewer", "default"],
  swarm_workers: ["worker", "default"],
  architect_runners: ["architect", "default"],
  interrogate_reviewers: [
    "reviewer",
    "code-reviewer",
    "security-reviewer",
    "default",
  ],
};

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "usage: validate-model-roles.mjs <personal.yaml> [--overlay <project.yaml>] [--capabilities <models.json>]\n"
  );
  process.exit(64);
}

function parseArgs(argv) {
  if (argv.length < 1) usage();
  const result = { config: argv[0], overlay: undefined, capabilities: undefined };
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) usage(`missing value for ${flag}`);
    if (flag === "--overlay") result.overlay = value;
    else if (flag === "--capabilities") result.capabilities = value;
    else usage(`unknown option ${flag}`);
  }
  return result;
}

function readRegularFile(path) {
  const absolute = resolve(path);
  const metadata = lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${absolute} is not a regular file`);
  }
  return { absolute, contents: readFileSync(absolute, "utf8") };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePair(value, label, models) {
  if (typeof value === "string") {
    if (!aliases.has(value)) throw new Error(`${label} has invalid alias ${value}`);
    return;
  }
  if (!isPlainObject(value)) throw new Error(`${label} must be an alias or mapping`);
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "model,reasoning_effort") {
    throw new Error(`${label} must contain only model and reasoning_effort`);
  }
  if (typeof value.model !== "string" || typeof value.reasoning_effort !== "string") {
    throw new Error(`${label} model and reasoning_effort must be strings`);
  }
  if (models) {
    const efforts = models[value.model];
    if (!Array.isArray(efforts)) throw new Error(`${label} uses unavailable model ${value.model}`);
    if (!efforts.includes(value.reasoning_effort)) {
      throw new Error(
        `${label} uses unsupported effort ${value.reasoning_effort} for ${value.model}`
      );
    }
  }
}

function validateCompatibility(value, role, label, agentTypes) {
  if (!agentTypes) return;
  const compatible = roleAgentCandidates[role].some((agentType) => {
    const capability = agentTypes[agentType];
    if (!capability) return false;
    if (capability.overrides === true) return true;
    if (typeof value === "string") return false;
    return (
      capability.model === value.model &&
      capability.reasoning_effort === value.reasoning_effort
    );
  });
  if (!compatible) {
    throw new Error(
      `${label} has no compatible agent type among ${roleAgentCandidates[role].join(", ")}`
    );
  }
}

function parseConfig(path, partial, capabilities) {
  const file = readRegularFile(path);
  const document = Bun.YAML.parse(file.contents);
  if (!isPlainObject(document) || document.version !== 2 || !isPlainObject(document.roles)) {
    throw new Error(`${file.absolute} must contain version 2 and a roles mapping`);
  }
  const keys = Object.keys(document.roles);
  const unknown = keys.filter((key) => !roleKeys.includes(key));
  if (unknown.length) throw new Error(`${file.absolute} has unknown roles: ${unknown.join(", ")}`);
  if (!partial) {
    const missing = roleKeys.filter((key) => !keys.includes(key));
    if (missing.length) throw new Error(`${file.absolute} is missing roles: ${missing.join(", ")}`);
  }
  for (const key of keys) {
    const value = document.roles[key];
    if (listKeys.has(key)) {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${file.absolute} role ${key} must be a non-empty list`);
      }
      value.forEach((item, index) =>
        validatePair(item, `${file.absolute} role ${key}[${index}]`, capabilities?.models)
      );
      value.forEach((item, index) =>
        validateCompatibility(
          item,
          key,
          `${file.absolute} role ${key}[${index}]`,
          capabilities?.agentTypes
        )
      );
    } else {
      if (Array.isArray(value)) throw new Error(`${file.absolute} role ${key} must be one value`);
      validatePair(value, `${file.absolute} role ${key}`, capabilities?.models);
      validateCompatibility(
        value,
        key,
        `${file.absolute} role ${key}`,
        capabilities?.agentTypes
      );
    }
  }
  return document.roles;
}

function readCapabilities(path) {
  if (!path) return undefined;
  const file = readRegularFile(path);
  const document = JSON.parse(file.contents);
  if (
    !isPlainObject(document) ||
    !isPlainObject(document.models) ||
    !isPlainObject(document.agent_types)
  ) {
    throw new Error(`${file.absolute} must contain models and agent_types mappings`);
  }
  for (const [model, efforts] of Object.entries(document.models)) {
    if (!Array.isArray(efforts) || efforts.some((effort) => typeof effort !== "string")) {
      throw new Error(`${file.absolute} model ${model} must map to an effort list`);
    }
  }
  for (const [agentType, capability] of Object.entries(document.agent_types)) {
    if (!isPlainObject(capability) || typeof capability.overrides !== "boolean") {
      throw new Error(`${file.absolute} agent type ${agentType} must declare overrides`);
    }
    if (
      capability.overrides === false &&
      (typeof capability.model !== "string" ||
        typeof capability.reasoning_effort !== "string")
    ) {
      throw new Error(
        `${file.absolute} fixed agent type ${agentType} must declare model and reasoning_effort`
      );
    }
  }
  return { models: document.models, agentTypes: document.agent_types };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const capabilities = readCapabilities(args.capabilities);
  const personal = parseConfig(args.config, false, capabilities);
  const merged = args.overlay
    ? { ...personal, ...parseConfig(args.overlay, true, capabilities) }
    : personal;
  const missing = roleKeys.filter((key) => !(key in merged));
  if (missing.length) throw new Error(`merged configuration is missing roles: ${missing.join(", ")}`);
  process.stdout.write(
    `${JSON.stringify({ valid: true, roles: roleKeys.length, overlay: Boolean(args.overlay) })}\n`
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
