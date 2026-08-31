import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  linkSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "safe-log.mjs");
const temporaryDirectory = realpathSync(tmpdir());

function run(logfile, values) {
  return spawnSync(process.execPath, [script, logfile, ...values], {
    encoding: "utf8",
  });
}

test("writes a private TSV through the real filesystem", (t) => {
  const root = mkdtempSync(join(tmpdir(), "spudex-safe-log-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const logfile = join(root, "nested", "decision.tsv");
  const first = run(logfile, [
    "build",
    "=choose\u202e\nA",
    "why\there",
    "+evidence",
    "ok\u001b]0;owned\u0007\u2066",
  ]);
  assert.equal(first.status, 0, first.stderr);
  const second = run(logfile, ["verify", "real path", "observed", "runtime", "passed"]);
  assert.equal(second.status, 0, second.stderr);

  const lines = readFileSync(logfile, "utf8").trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "ts\tphase\tdecision\twhy\tevidence\tresult");
  assert.match(lines[1], /\tbuild\t'=choose A\twhy here\t'\+evidence\tok ]0;owned $/);
  assert.doesNotMatch(
    lines[1],
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/
  );
  assert.match(lines[2], /\tverify\treal path\tobserved\truntime\tpassed$/);
  assert.equal(statSync(logfile).mode & 0o777, 0o600);
  assert.equal(statSync(logfile).uid, process.getuid());
});

test("rejects destination and parent symbolic links", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "spudex-safe-log-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const realDirectory = join(root, "real");
  mkdirSync(realDirectory, { mode: 0o700 });
  const protectedFile = join(realDirectory, "protected.tsv");
  const initial = run(protectedFile, ["one", "two", "three", "four", "five"]);
  assert.equal(initial.status, 0, initial.stderr);
  const before = readFileSync(protectedFile, "utf8");

  const destinationLink = join(root, "destination.tsv");
  symlinkSync(protectedFile, destinationLink);
  const destinationResult = run(destinationLink, ["a", "b", "c", "d", "e"]);
  assert.notEqual(destinationResult.status, 0);
  assert.equal(readFileSync(protectedFile, "utf8"), before);

  const hostileLink = join(root, "hostile\u001b]0;owned\u0007\u202e.tsv");
  symlinkSync(protectedFile, hostileLink);
  const hostileResult = run(hostileLink, ["a", "b", "c", "d", "e"]);
  assert.notEqual(hostileResult.status, 0);
  assert.doesNotMatch(
    hostileResult.stderr.trimEnd(),
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/
  );
  assert.equal(readFileSync(protectedFile, "utf8"), before);

  const parentLink = join(root, "linked-parent");
  symlinkSync(realDirectory, parentLink);
  const parentResult = run(join(parentLink, "other.tsv"), ["a", "b", "c", "d", "e"]);
  assert.notEqual(parentResult.status, 0);
});

test("rejects an unrelated or malformed existing file", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "spudex-safe-log-shape-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const unrelated = join(root, "unrelated.tsv");
  writeFileSync(unrelated, "ordinary user data\n", { mode: 0o755 });
  const unrelatedBefore = readFileSync(unrelated, "utf8");
  const unrelatedMode = statSync(unrelated).mode & 0o777;
  const unrelatedResult = run(unrelated, ["a", "b", "c", "d", "e"]);
  assert.notEqual(unrelatedResult.status, 0);
  assert.equal(readFileSync(unrelated, "utf8"), unrelatedBefore);
  assert.equal(statSync(unrelated).mode & 0o777, unrelatedMode);

  const malformed = join(root, "malformed.tsv");
  writeFileSync(
    malformed,
    "ts\tphase\tdecision\twhy\tevidence\tresult\n2026-08-31T10:00:00Z\tonly\tfive\tcells\there\n",
    { mode: 0o600 }
  );
  const malformedBefore = readFileSync(malformed, "utf8");
  const malformedResult = run(malformed, ["a", "b", "c", "d", "e"]);
  assert.notEqual(malformedResult.status, 0);
  assert.equal(readFileSync(malformed, "utf8"), malformedBefore);
});

test("rejects credential-like cells without logging or echoing them", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "spudex-safe-log-secrets-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const logfile = join(root, "decision.tsv");
  const initial = run(logfile, ["verify", "safe row", "observed", "local", "passed"]);
  assert.equal(initial.status, 0, initial.stderr);
  const before = readFileSync(logfile, "utf8");
  const secretCells = [
    "https://operator:very-private@example.invalid/result",
    "https://example.invalid/result?token=very-private",
    "Authorization: Bearer very-private",
    "api_key=very-private",
  ];

  for (const secret of secretCells) {
    const result = run(logfile, ["verify", "reject secret", "safety", secret, "blocked"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /contains credential-like data/);
    assert.doesNotMatch(result.stderr, /very-private|operator/);
    assert.equal(readFileSync(logfile, "utf8"), before);
  }
});

test("refuses an append that would cross the bounded log size", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "spudex-safe-log-size-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const logfile = join(root, "decision.tsv");
  writeFileSync(logfile, "ts\tphase\tdecision\twhy\tevidence\tresult\n", {
    mode: 0o600,
  });
  truncateSync(logfile, 64 * 1024 * 1024 - 1);
  const before = statSync(logfile).size;

  const result = run(logfile, ["size", "bounded", "real file", "bytes", "passed"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot exceed 67108864 bytes/);
  assert.equal(statSync(logfile).size, before);
});

test("recovers an exact initialization link left by an interrupted publisher", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "spudex-safe-log-recover-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const logfile = join(root, "decision.tsv");
  const initialization = join(
    root,
    ".spudex-log-init-999999-0123456789abcdef01234567"
  );
  writeFileSync(logfile, "ts\tphase\tdecision\twhy\tevidence\tresult\n", {
    mode: 0o600,
  });
  linkSync(logfile, initialization);

  const result = run(logfile, ["recover", "append", "real link", "inode", "passed"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(initialization), false);
  assert.match(readFileSync(logfile, "utf8"), /\trecover\tappend\treal link\tinode\tpassed\n$/);
});

test("keeps concurrent rows whole", async (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "spudex-safe-log-concurrent-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const logfile = join(root, "decision.tsv");
  const runs = Array.from({ length: 12 }, (_, index) =>
    new Promise((resolveRun, rejectRun) => {
      const child = spawn(process.execPath, [
        script,
        logfile,
        "parallel",
        `row-${index}`,
        "real process",
        "filesystem",
        "passed",
      ]);
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", rejectRun);
      child.on("close", (code) => {
        if (code === 0) resolveRun();
        else rejectRun(new Error(`logger exited ${code}: ${stderr}`));
      });
    })
  );
  await Promise.all(runs);

  const lines = readFileSync(logfile, "utf8").trimEnd().split("\n");
  assert.equal(lines.filter((line) => line.startsWith("ts\tphase\t")).length, 1);
  assert.equal(lines.length, 13);
  for (let index = 0; index < 12; index += 1) {
    assert.equal(lines.filter((line) => line.includes(`\trow-${index}\t`)).length, 1);
  }
});
