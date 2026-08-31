import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runBoundedProcess } from "./bootstrap.ts";

const scripts = dirname(fileURLToPath(import.meta.url));
const temporaryDirectory = realpathSync(tmpdir());

function launch(directory) {
  return new Promise((resolveLaunch, rejectLaunch) => {
    const child = spawn(process.execPath, [join(directory, "launcher.ts")], {
      cwd: directory,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectLaunch);
    child.on("close", (code) => resolveLaunch({ code, stdout, stderr }));
  });
}

test("bounds a real child by elapsed time and captured output", () => {
  const timed = runBoundedProcess(
    [process.execPath, "-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000)"],
    scripts,
    { timeoutMilliseconds: 100, maxOutputBytes: 1024 }
  );
  assert.equal(timed.exitedDueToTimeout, true);
  assert.notEqual(timed.exitCode, 0);

  const noisy = runBoundedProcess(
    [process.execPath, "-e", "process.stdout.write(\"x\".repeat(1024 * 1024))"],
    scripts,
    { timeoutMilliseconds: 5_000, maxOutputBytes: 1024 }
  );
  assert.equal(noisy.exitedDueToMaxBuffer, true);
  assert.notEqual(noisy.exitCode, 0);

  const credentialName = "CSTACK_BOOTSTRAP_TEST_CREDENTIAL";
  const credentialValue = "must-not-reach-child";
  process.env[credentialName] = credentialValue;
  try {
    const isolated = runBoundedProcess(
      [
        process.execPath,
        "-e",
        `process.stdout.write(process.env.${credentialName} ?? "absent")`,
      ],
      scripts,
      { timeoutMilliseconds: 5_000, maxOutputBytes: 1024 },
      { PATH: process.env.PATH }
    );
    assert.equal(isolated.exitCode, 0);
    assert.equal(isolated.stdout.toString("utf8"), "absent");
  } finally {
    delete process.env[credentialName];
  }
});

test("fails closed on a stale lock and serializes two real installers", async (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "cstack-bootstrap-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const filename of ["bootstrap.ts", "package.json", "bun.lock"]) {
    copyFileSync(join(scripts, filename), join(root, filename));
  }
  writeFileSync(
    join(root, "launcher.ts"),
    'import { ensureDependenciesInstalled } from "./bootstrap.ts";\n' +
      'ensureDependenciesInstalled();\nconsole.log("bootstrap-ready");\n',
    { mode: 0o600 }
  );

  const lock = join(root, ".cstack-tools-install.lock");
  writeFileSync(lock, "99999999\n", { mode: 0o600 });
  chmodSync(lock, 0o600);
  const stale = await launch(root);
  assert.notEqual(stale.code, 0);
  assert.match(stale.stderr, /stale cstack dependency-install lock for dead PID 99999999/);
  assert.equal(existsSync(join(root, "node_modules")), false);
  unlinkSync(lock);

  const [first, second] = await Promise.all([launch(root), launch(root)]);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  assert.match(first.stdout, /bootstrap-ready/);
  assert.match(second.stdout, /bootstrap-ready/);
  assert.equal(existsSync(lock), false);
  assert.deepEqual(
    readdirSync(root).filter((name) =>
      name.startsWith(".cstack-tools-stage-") ||
      name.startsWith(".cstack-tools-backup-")
    ),
    []
  );
  const marker = join(root, "node_modules", ".cstack-tools-install-key");
  const integrity = join(root, "node_modules", ".cstack-tools-integrity.json");
  assert.equal(statSync(marker).mode & 0o777, 0o600);
  assert.equal(statSync(integrity).mode & 0o777, 0o600);
  assert.doesNotThrow(() => JSON.parse(readFileSync(integrity, "utf8")));
});
