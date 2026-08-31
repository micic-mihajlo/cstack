import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "worktree-audit.sh");
const temporaryDirectory = realpathSync(tmpdir());

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("audits a real worktree whose path contains spaces without fetching", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "cstack-worktree-audit-test-"));
  const repository = join(root, "repo");
  const worktree = join(root, `worktree with spaces \u001b[31m\u202ered\u2066\u0007 🥔`);
  t.after(() => {
    spawnSync("git", ["worktree", "remove", "--force", worktree], {
      cwd: repository,
      encoding: "utf8",
    });
    rmSync(root, { recursive: true, force: true });
  });
  git(root, "init", "-b", "main", repository);
  git(repository, "config", "user.name", "cstack Test");
  git(repository, "config", "user.email", "cstack-test@example.invalid");
  writeFileSync(join(repository, "tracked.txt"), "base\n");
  git(repository, "add", "tracked.txt");
  git(repository, "commit", "-m", "base");
  git(repository, "worktree", "add", "-b", "feature/space-path", worktree);
  writeFileSync(join(worktree, "tracked.txt"), "changed\n");
  writeFileSync(join(worktree, "untracked file.txt"), "scratch\n");

  const before = readFileSync(join(repository, ".git", "HEAD"), "utf8");
  const indexValue = git(worktree, "rev-parse", "--git-path", "index");
  const worktreeIndex = isAbsolute(indexValue)
    ? indexValue
    : resolve(worktree, indexValue);
  const indexBefore = readFileSync(worktreeIndex);
  const result = spawnSync("bash", [script, repository], {
    encoding: "utf8",
    env: {
      ...process.env,
      CSTACK_BASE_REF: "main",
      GIT_DIR: join(root, "caller-selected-git-dir"),
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.fsmonitor",
      GIT_CONFIG_VALUE_0: "/bin/false",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\twip:1\t/);
  assert.match(result.stdout, /\tnot-queried\t/);
  assert.match(result.stdout, /worktree with spaces red 🥔$/m);
  assert.doesNotMatch(
    result.stdout,
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/
  );
  assert.equal(readFileSync(join(repository, ".git", "HEAD"), "utf8"), before);
  assert.deepEqual(readFileSync(worktreeIndex), indexBefore);
});

test("holds a worktree that contains only untracked scratch files", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "cstack-worktree-scratch-test-"));
  const repository = join(root, "repo");
  const worktree = join(root, "scratch worktree");
  t.after(() => {
    spawnSync("git", ["worktree", "remove", "--force", worktree], {
      cwd: repository,
      encoding: "utf8",
    });
    rmSync(root, { recursive: true, force: true });
  });
  git(root, "init", "-b", "main", repository);
  git(repository, "config", "user.name", "cstack Test");
  git(repository, "config", "user.email", "cstack-test@example.invalid");
  writeFileSync(join(repository, "tracked.txt"), "base\n");
  writeFileSync(join(repository, ".gitignore"), "ignored.txt\n");
  git(repository, "add", "tracked.txt", ".gitignore");
  git(repository, "commit", "-m", "base");
  git(repository, "worktree", "add", "-b", "feature/scratch", worktree);
  writeFileSync(join(worktree, "ignored.txt"), "not disposable\n");

  const result = spawnSync("bash", [script, repository], {
    encoding: "utf8",
    env: { ...process.env, CSTACK_BASE_REF: "main" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\tscratch:1\t/);
  assert.match(result.stdout, /\thold-scratch\t/);
  assert.doesNotMatch(result.stdout, /\tsafe\t/);
});

test("refuses a non-GitHub origin before an explicit fetch", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "cstack-worktree-origin-test-"));
  const repository = join(root, "repo");
  const remote = join(root, "remote.git");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  git(root, "init", "--bare", remote);
  git(root, "init", "-b", "main", repository);
  git(repository, "config", "user.name", "cstack Test");
  git(repository, "config", "user.email", "cstack-test@example.invalid");
  writeFileSync(join(repository, "tracked.txt"), "base\n");
  git(repository, "add", "tracked.txt");
  git(repository, "commit", "-m", "base");
  git(repository, "remote", "add", "origin", remote);
  git(repository, "push", "-u", "origin", "main");

  const result = spawnSync("bash", [script, "--fetch", repository], {
    encoding: "utf8",
    env: { ...process.env, CSTACK_BASE_REF: "origin/main" },
  });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /origin is not a literal GitHub/);
  assert.equal(git(repository, "rev-parse", "origin/main"), git(repository, "rev-parse", "main"));
});

test("rejects executable local Git configuration before auditing", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "cstack-worktree-config-test-"));
  const repository = join(root, "repo");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-b", "main", repository);
  git(repository, "config", "core.fsmonitor", "/bin/false");

  const result = spawnSync("bash", [script, repository], {
    encoding: "utf8",
    env: { ...process.env, CSTACK_BASE_REF: "main" },
  });
  assert.equal(result.status, 64);
  assert.match(
    result.stderr,
    /unsafe executable, path-redirecting, or transport-affecting Git configuration in .*: core\.fsmonitor/
  );
});

test("rejects executable filters from per-worktree Git configuration", (t) => {
  const root = mkdtempSync(join(temporaryDirectory, "cstack-worktree-filter-test-"));
  const repository = join(root, "repo");
  const worktree = join(root, "filtered worktree");
  t.after(() => {
    spawnSync("git", ["worktree", "remove", "--force", worktree], {
      cwd: repository,
      encoding: "utf8",
    });
    rmSync(root, { recursive: true, force: true });
  });
  git(root, "init", "-b", "main", repository);
  git(repository, "config", "user.name", "cstack Test");
  git(repository, "config", "user.email", "cstack-test@example.invalid");
  writeFileSync(join(repository, "tracked.txt"), "base\n");
  git(repository, "add", "tracked.txt");
  git(repository, "commit", "-m", "base");
  git(repository, "config", "extensions.worktreeConfig", "true");
  git(repository, "worktree", "add", "-b", "feature/filter", worktree);
  git(worktree, "config", "--worktree", "filter.hostile.process", "/bin/false");

  const result = spawnSync("bash", [script, repository], {
    encoding: "utf8",
    env: { ...process.env, CSTACK_BASE_REF: "main" },
  });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /filter\.hostile\.process/);
});

test("rejects a fetch refspec disguised as a base ref", () => {
  const root = mkdtempSync(join(temporaryDirectory, "cstack-worktree-ref-test-"));
  try {
    const repository = join(root, "repo");
    git(root, "init", "-b", "main", repository);
    const result = spawnSync("bash", [script, "--fetch", repository], {
      encoding: "utf8",
      env: {
        ...process.env,
        CSTACK_BASE_REF: "origin/main:refs/heads/unexpected",
      },
    });
    assert.equal(result.status, 64);
    assert.match(result.stderr, /invalid base ref/);
    const unexpected = spawnSync(
      "git",
      ["show-ref", "--verify", "--quiet", "refs/heads/unexpected"],
      { cwd: repository, encoding: "utf8" }
    );
    assert.equal(unexpected.status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
