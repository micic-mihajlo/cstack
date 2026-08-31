import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-plan.mjs");
const temporaryDirectory = realpathSync(tmpdir());

function runPlan(t, contents) {
  const root = mkdtempSync(join(temporaryDirectory, "cstack-check-plan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = join(root, "plan.md");
  writeFileSync(plan, contents, { mode: 0o600 });
  return spawnSync(process.execPath, [script, plan], { encoding: "utf8" });
}

test("fails closed on unclosed frontmatter", (t) => {
  const result = runPlan(t, "---\nname: plan\n# Plan\n");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /plan\.md:1: unclosed frontmatter/);
});

test("fails closed on malformed frontmatter delimiters", (t) => {
  const malformedOpening = runPlan(t, "--- trailing\n# Plan\n");
  assert.equal(malformedOpening.status, 1);
  assert.match(
    malformedOpening.stderr,
    /plan\.md:1: malformed frontmatter opening delimiter/
  );

  const malformedClosing = runPlan(t, "---\nname: plan\n --- \n# Plan\n");
  assert.equal(malformedClosing.status, 1);
  assert.match(
    malformedClosing.stderr,
    /plan\.md:3: malformed frontmatter closing delimiter/
  );
});

test("does not invent frontmatter for a regular Markdown document", (t) => {
  const result = runPlan(t, "# Plan\n\nPlain Markdown.\n");
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /frontmatter/);
  assert.match(result.stdout, /structure-only:/);
});
