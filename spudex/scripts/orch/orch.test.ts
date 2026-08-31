import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NotFoundError,
  UserError,
  computeVerificationEvidenceDigest,
  createVerificationReceipt,
  openStore,
  parseGtBranches,
  parseGtPullRequest,
  parseVerdict,
  validateFrontierPin,
  writeVerificationReceipt,
  type Verdict,
  type OpenStoreOptions,
  type Store,
} from "./store.ts";

const SCRIPT = join(import.meta.dir, "orch.ts");
const SHA_A = "a".repeat(40);
const REPOSITORY = "local.test/example/project";
const directories: string[] = [];
const handles: Store[] = [];

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface RealEvidence {
  readonly path: string;
  readonly repository: string;
  readonly headSha: string;
  readonly command: string;
  readonly surface: string;
  readonly exitStatus: number | null;
}

async function makeDirectory(): Promise<string> {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "spudex-orch-"))
  );
  directories.push(directory);
  return directory;
}

function useStore(directory: string, options?: OpenStoreOptions): Store {
  const store = openStore(directory, options);
  handles.push(store);
  return store;
}

async function initializedStore(): Promise<{
  readonly directory: string;
  readonly store: Store;
}> {
  const directory = await makeDirectory();
  const store = useStore(directory);
  await store.init();
  return { directory, store };
}

function requiredProcess(
  command: readonly string[],
  cwd: string
): RunResult {
  const result = Bun.spawnSync([...command], { cwd, env: process.env });
  const value = {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
  if (value.code !== 0) {
    throw new Error(
      `real fixture command failed: ${JSON.stringify(command)}\n${value.stderr}`
    );
  }
  return value;
}

async function gitFixture(
  directory: string,
  name: string
): Promise<{ readonly repo: string; readonly sha: string }> {
  const repo = join(directory, name);
  await mkdir(repo, { mode: 0o700 });
  requiredProcess(["git", "init", "--quiet"], repo);
  requiredProcess(["git", "config", "user.name", "Orch Fixture"], repo);
  requiredProcess(
    ["git", "config", "user.email", "orch-fixture@local.invalid"],
    repo
  );
  requiredProcess(
    ["git", "remote", "add", "origin", `https://${REPOSITORY}.git`],
    repo
  );
  await writeFile(
    join(repo, "math.ts"),
    "export function add(left: number, right: number): number { return left + right; }\n",
    { mode: 0o600 }
  );
  await writeFile(
    join(repo, "math.test.ts"),
    'import { expect, test } from "bun:test";\nimport { add } from "./math.ts";\ntest("adds real values", () => expect(add(2, 3)).toBe(5));\n',
    { mode: 0o600 }
  );
  await writeFile(
    join(repo, "app.ts"),
    'import { add } from "./math.ts";\nprocess.stdout.write(`┌─ Orch fixture ─┐\\n│ ready: ${add(2, 3)}       │\\n└────────────────┘\\n`);\n',
    { mode: 0o600 }
  );
  requiredProcess(
    ["git", "add", "math.ts", "math.test.ts", "app.ts"],
    repo
  );
  requiredProcess(["git", "commit", "--quiet", "-m", "fixture"], repo);
  const sha = requiredProcess(["git", "rev-parse", "HEAD"], repo).stdout.trim();
  return { repo, sha };
}

function assertFixtureIdentity(repo: string, headSha: string): void {
  const actualHead = requiredProcess(["git", "rev-parse", "HEAD"], repo).stdout.trim();
  const remote = requiredProcess(
    ["git", "remote", "get-url", "origin"],
    repo
  ).stdout.trim();
  if (actualHead !== headSha || remote !== `https://${REPOSITORY}.git`) {
    throw new Error("real evidence fixture identity changed before verification");
  }
}

async function processEvidence({
  directory,
  name,
  command,
  cwd,
  headSha,
  requiredStdout,
  surface,
}: {
  directory: string;
  name: string;
  command: readonly string[];
  cwd: string;
  headSha: string;
  requiredStdout?: string;
  surface: string;
}): Promise<RealEvidence> {
  assertFixtureIdentity(cwd, headSha);
  const result = Bun.spawnSync([...command], { cwd, env: process.env });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (
    requiredStdout !== undefined &&
    (result.exitCode !== 0 || !stdout.includes(requiredStdout))
  ) {
    throw new Error(
      `real fixture surface did not contain ${JSON.stringify(requiredStdout)}: ${stderr}`
    );
  }
  const path = join(directory, `${name}.evidence.json`);
  await writeFile(
    path,
    `${JSON.stringify(
      {
        command,
        cwd,
        repository: REPOSITORY,
        headSha,
        exitStatus: result.exitCode,
        stdout,
        stderr,
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
  return {
    path,
    repository: REPOSITORY,
    headSha,
    command: JSON.stringify(command),
    surface,
    exitStatus: result.exitCode,
  };
}

async function liveTerminalEvidence(
  directory: string,
  name: string,
  fixture: { readonly repo: string; readonly sha: string }
): Promise<RealEvidence> {
  return processEvidence({
    directory,
    name,
    command: [process.execPath, "run", "app.ts"],
    cwd: fixture.repo,
    headSha: fixture.sha,
    requiredStdout: "│ ready: 5",
    surface: "committed terminal UI executed in a real Bun subprocess",
  });
}

async function blockedFileEvidence(
  directory: string,
  name: string,
  fixture: { readonly repo: string; readonly sha: string }
): Promise<RealEvidence> {
  assertFixtureIdentity(fixture.repo, fixture.sha);
  const requiredPath = join(fixture.repo, `${name}.required`);
  let blocked = false;
  try {
    await stat(requiredPath);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      blocked = true;
    } else {
      throw error;
    }
  }
  if (!blocked) {
    throw new Error("blocked fixture unexpectedly had its required artifact");
  }
  const path = join(directory, `${name}.evidence.json`);
  const command = `require existing artifact ${requiredPath} before verification`;
  await writeFile(
    path,
    `${JSON.stringify(
      {
        procedure: command,
        repository: REPOSITORY,
        headSha: fixture.sha,
        result: "blocked: artifact absent",
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
  return {
    path,
    repository: REPOSITORY,
    headSha: fixture.sha,
    command,
    surface: "real filesystem prerequisite check",
    exitStatus: null,
  };
}

async function receipt({
  directory,
  name,
  pr,
  sha,
  verdict,
  proof,
}: {
  directory: string;
  name: string;
  pr: number;
  sha: string;
  verdict: Verdict;
  proof: RealEvidence;
}): Promise<{ readonly path: string; readonly evidence: string }> {
  if (proof.repository !== REPOSITORY || proof.headSha !== sha) {
    throw new Error("receipt proof does not match its repository and head SHA");
  }
  const result = await writeVerificationReceipt({
    anchor: directory,
    repository: REPOSITORY,
    pr,
    headSha: sha,
    verdict,
    verifier: "real-test-verifier",
    command: proof.command,
    surface: proof.surface,
    exitStatus: proof.exitStatus,
    evidence: proof.path,
    output: join(directory, `${name}.receipt.json`),
  });
  return { path: result.path, evidence: proof.path };
}

function runCli(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env
): RunResult {
  const result = Bun.spawnSync([process.execPath, SCRIPT, ...args], { env });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

async function startRealLockHolder(directory: string) {
  const script = join(directory, "real-lock-holder.ts");
  await writeFile(
    script,
    `import { openStore } from ${JSON.stringify(join(import.meta.dir, "store.ts"))};\nconst store = openStore(process.argv[2] ?? "");\nawait store.units.add({ id: "held-by-child", track: "process" });\nprocess.stdout.write("ready\\n");\nawait Bun.sleep(30_000);\nawait store.close();\n`,
    { mode: 0o600 }
  );
  const child = Bun.spawn([process.execPath, script, directory], {
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const lockPath = join(directory, ".orch.lock");
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if ((await readFile(lockPath, "utf8")).trim() === String(child.pid)) {
        return child;
      }
    } catch {
      // The child has not published and synced its lock yet.
    }
    if (child.exitCode !== null) {
      const stderr = await new Response(child.stderr).text();
      throw new Error(`real lock holder exited early: ${stderr}`);
    }
    await Bun.sleep(10);
  }
  child.kill();
  await child.exited;
  throw new Error("real lock holder did not acquire the store lock");
}

function createReceiptCli({
  directory,
  pr,
  sha,
  verdict,
  proof,
  output,
}: {
  directory: string;
  pr: number;
  sha: string;
  verdict: Verdict;
  proof: RealEvidence;
  output: string;
}): RunResult {
  if (proof.repository !== REPOSITORY || proof.headSha !== sha) {
    throw new Error("CLI receipt proof does not match its repository and head SHA");
  }
  return runCli([
    "--store",
    directory,
    "ledger",
    "receipt",
    String(pr),
    sha,
    verdict,
    "--repo",
    REPOSITORY,
    "--verifier",
    "real-cli-verifier",
    "--command",
    proof.command,
    "--surface",
    proof.surface,
    "--exit-status",
    proof.exitStatus === null ? "none" : String(proof.exitStatus),
    "--evidence",
    proof.path,
    "--out",
    output,
  ]);
}

afterEach(async () => {
  for (const store of handles.splice(0).reverse()) {
    await store.close();
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("real on-disk orchestration store", () => {
  it("initializes idempotently with private managed paths and releases its lock", async () => {
    const directory = await makeDirectory();
    const store = useStore(directory);

    expect(await store.init()).toEqual({ store: directory });
    const firstUnits = await readFile(join(directory, "units.tsv"), "utf8");
    const firstLedger = await readFile(join(directory, "ledger.tsv"), "utf8");
    expect(await store.init()).toEqual({ store: directory });
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(firstUnits);
    expect(await readFile(join(directory, "ledger.tsv"), "utf8")).toBe(firstLedger);
    expect((await readdir(directory)).sort()).toEqual([
      ".orch.lock",
      "frontier.json",
      "gates.md",
      "inbox",
      "inbox-pending",
      "ledger.tsv",
      "preferences.md",
      "units.tsv",
    ]);
    for (const name of await readdir(directory)) {
      expect((await stat(join(directory, name))).mode & 0o077).toBe(0);
    }

    await store.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("composes unit add, set, get, list, and counts", async () => {
    const { store } = await initializedStore();
    expect(
      await store.units.add({ id: "u1", track: "build", brief: "briefs/u1.md" })
    ).toMatchObject({ id: "u1", state: "pending" });
    expect(await store.units.add({ id: "=SUM(A1)", track: "+build" })).toMatchObject({
      id: "'=SUM(A1)",
      track: "'+build",
    });

    const updated = await store.units.set({
      id: "u1",
      state: "done",
      branch: "spudex/u1",
      pr: 101,
      sha: SHA_A,
    });
    expect(await store.units.get("u1")).toEqual(updated);
    expect(await store.units.list({ state: "done", track: "build" })).toEqual([
      updated,
    ]);
    expect(await store.units.counts()).toEqual({ done: 1, pending: 1 });
    await expect(store.units.add({ id: "u1", track: "build" })).rejects.toThrow(
      "unit u1 already exists"
    );
    await expect(
      store.units.set({ id: "missing", state: "done" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("serializes same-process write transactions without losing updates", async () => {
    const { store } = await initializedStore();
    await Promise.all([
      store.units.add({ id: "u1", track: "build" }),
      store.units.add({ id: "u2", track: "review" }),
      store.units.add({ id: "u3", track: "verify" }),
    ]);
    expect((await store.units.list()).map((unit) => unit.id).sort()).toEqual([
      "u1",
      "u2",
      "u3",
    ]);

    await Promise.all([
      store.inbox.push({ agent: "worker-1", unit: "u1", status: "done" }),
      store.inbox.push({ agent: "worker-2", unit: "u2", status: "done" }),
      store.inbox.push({ agent: "worker-3", unit: "u3", status: "done" }),
    ]);
    expect(await store.inbox.count()).toBe(3);
  });

  it("rejects oversized and terminal-control input before persisting it", async () => {
    const { store } = await initializedStore();
    await expect(
      store.inbox.push({
        agent: "worker",
        unit: "u1",
        status: "done",
        report: "x".repeat(20 * 1024),
      })
    ).rejects.toThrow("16384-byte limit");
    await expect(
      store.units.add({ id: "\u001b]0;poison\u0007", track: "build" })
    ).rejects.toThrow("unsafe control");
    expect(await store.inbox.count()).toBe(0);
    expect(await store.units.list()).toEqual([]);
  });

  it("records, replaces, checks, gates, and summarizes verification evidence", async () => {
    const { directory, store } = await initializedStore();
    const fixture = await gitFixture(directory, "ledger-repository");
    const unitProof = await processEvidence({
      directory,
      name: "unit",
      command: [process.execPath, "test", "math.test.ts"],
      cwd: fixture.repo,
      headSha: fixture.sha,
      surface: "committed fixture unit test executed by Bun",
    });
    expect(unitProof.exitStatus).toBe(0);
    const unitDigest = await computeVerificationEvidenceDigest(unitProof.path);
    await expect(
      store.ledger.check({ repository: REPOSITORY, pr: 101, sha: SHA_A })
    ).rejects.toBeInstanceOf(NotFoundError);
    for (const length of [41, 63]) {
      expect(() =>
        createVerificationReceipt({
          repository: REPOSITORY,
          pr: 101,
          headSha: "a".repeat(length),
          verdict: "unit-test-verified",
          verifier: "real-test-verifier",
          verifiedAt: new Date().toISOString(),
          artifact: {
            kind: "unit-test",
            command: unitProof.command,
            surface: unitProof.surface,
            exitStatus: unitProof.exitStatus,
            reference: unitProof.path,
            evidenceDigest: unitDigest,
          },
        })
      ).toThrow("40-character SHA-1 or 64-character SHA-256");
    }
    await expect(
      store.ledger.record({
        repository: REPOSITORY,
        pr: 101,
        sha: "abc123",
        verdict: "unit-test-verified",
        receipt: join(directory, "missing.receipt.json"),
      })
    ).rejects.toThrow("SHA must be a complete");
    await expect(
      store.ledger.record({
        repository: REPOSITORY,
        pr: 101,
        sha: SHA_A,
        verdict: "unit-test-verified",
        receipt: join(directory, "missing.receipt.json"),
      })
    ).rejects.toThrow();
    expect(() => parseVerdict("looks-good")).toThrow("verdict must be");

    const unit = await receipt({
      directory,
      name: "unit",
      pr: 101,
      sha: fixture.sha,
      verdict: "unit-test-verified",
      proof: unitProof,
    });
    const recorded = await store.ledger.record({
      repository: REPOSITORY,
      pr: 101,
      sha: fixture.sha,
      verdict: "unit-test-verified",
      receipt: unit.path,
    });
    expect((await stat(unit.path)).mode & 0o777).toBe(0o400);
    expect(
      await store.ledger.check({
        repository: REPOSITORY,
        pr: 101,
        sha: fixture.sha,
      })
    ).toEqual(recorded);
    expect(
      await store.ledger.gate({
        repository: REPOSITORY,
        pr: 101,
        sha: fixture.sha,
      })
    ).toEqual(recorded);
    await unlink(unit.evidence);
    await expect(
      store.ledger.gate({
        repository: REPOSITORY,
        pr: 101,
        sha: fixture.sha,
      })
    ).rejects.toThrow();

    const typeCheck = await receipt({
      directory,
      name: "type-check",
      pr: 101,
      sha: fixture.sha,
      verdict: "type-check-only",
      proof: await processEvidence({
        directory,
        name: "type-check",
        command: [
          join(import.meta.dir, "..", "node_modules", ".bin", "tsc"),
          "--noEmit",
          "--strict",
          "--target",
          "esnext",
          "--module",
          "esnext",
          "math.ts",
        ],
        cwd: fixture.repo,
        headSha: fixture.sha,
        surface: "committed fixture TypeScript source checked by tsc",
      }),
    });
    await store.ledger.record({
      repository: REPOSITORY,
      pr: 101,
      sha: fixture.sha,
      verdict: "type-check-only",
      receipt: typeCheck.path,
    });
    await expect(
      store.ledger.gate({
        repository: REPOSITORY,
        pr: 101,
        sha: fixture.sha,
      })
    ).rejects.toThrow(`${REPOSITORY}#101@${fixture.sha}`);
    expect(
      (
        await store.ledger.gate({
          repository: REPOSITORY,
          pr: 101,
          sha: fixture.sha,
          allowTypeCheckOnly: true,
        })
      ).verdict
    ).toBe("type-check-only");

    const blocked = await receipt({
      directory,
      name: "blocked",
      pr: 101,
      sha: fixture.sha,
      verdict: "verifier-blocked",
      proof: await blockedFileEvidence(directory, "blocked", fixture),
    });
    await store.ledger.record({
      repository: REPOSITORY,
      pr: 101,
      sha: fixture.sha,
      verdict: "verifier-blocked",
      receipt: blocked.path,
    });
    await expect(
      store.ledger.gate({
        repository: REPOSITORY,
        pr: 101,
        sha: fixture.sha,
      })
    ).rejects.toThrow("verifier-blocked");
    const live = await receipt({
      directory,
      name: "live",
      pr: 101,
      sha: fixture.sha,
      verdict: "live-ui-verified",
      proof: await liveTerminalEvidence(directory, "live", fixture),
    });
    await expect(
      store.ledger.record({
        repository: "local.test/example/other-project",
        pr: 101,
        sha: fixture.sha,
        verdict: "live-ui-verified",
        receipt: live.path,
      })
    ).rejects.toThrow(
      "verification receipt does not match repository, PR, head SHA, and verdict"
    );
    await store.ledger.record({
      repository: REPOSITORY,
      pr: 101,
      sha: fixture.sha,
      verdict: "live-ui-verified",
      receipt: live.path,
    });
    expect(
      (
        await store.ledger.gate({
          repository: REPOSITORY,
          pr: 101,
          sha: fixture.sha,
        })
      ).verdict
    ).toBe("live-ui-verified");
    const liveReceipt = await readFile(live.path, "utf8");
    await chmod(live.path, 0o600);
    await writeFile(
      live.path,
      liveReceipt.replace("real-test-verifier", "tampered-verifier"),
      { mode: 0o600 }
    );
    await chmod(live.path, 0o400);
    await expect(
      store.ledger.gate({
        repository: REPOSITORY,
        pr: 101,
        sha: fixture.sha,
      })
    ).rejects.toThrow("invalid digest");
    expect(await store.ledger.summary()).toEqual({ "live-ui-verified": 1 });
  });

  it("keeps receipt and evidence paths inside the private store anchor", async () => {
    const { directory } = await initializedStore();
    const outside = await makeDirectory();
    const insideEvidence = join(directory, "inside-evidence.txt");
    const outsideEvidence = join(outside, "outside-evidence.txt");
    await writeFile(insideEvidence, "inside\n", { mode: 0o600 });
    await writeFile(outsideEvidence, "outside\n", { mode: 0o600 });
    const base = {
      anchor: directory,
      repository: REPOSITORY,
      pr: 101,
      headSha: SHA_A,
      verdict: "unit-test-verified" as const,
      verifier: "real-test-verifier",
      command: "real local verification",
      surface: "real filesystem",
      exitStatus: 0,
    };
    await expect(
      writeVerificationReceipt({
        ...base,
        evidence: outsideEvidence,
        output: join(directory, "outside-evidence.receipt.json"),
      })
    ).rejects.toThrow("must stay inside the orchestration store");
    await expect(
      writeVerificationReceipt({
        ...base,
        evidence: insideEvidence,
        output: join(outside, "outside-output.receipt.json"),
      })
    ).rejects.toThrow("must stay inside the orchestration store");
  });

  it("claims, replays, and acknowledges inbox pointers without early deletion", async () => {
    const { directory, store } = await initializedStore();
    await store.inbox.push({
      agent: "worker-1",
      unit: "u1",
      status: "done",
      report: "reports/u1.md",
    });
    await store.inbox.push({ agent: "worker-2", unit: "u2", status: "failed" });

    const claimed = await store.inbox.drain();
    expect(claimed.batch).not.toBeNull();
    expect(claimed.pointers).toHaveLength(2);
    expect(claimed.replayed).toBe(false);
    expect(await store.inbox.count()).toBe(2);
    expect(await readdir(join(directory, "inbox"))).toEqual([]);

    const replayed = await store.inbox.drain();
    expect(replayed).toEqual({ ...claimed, replayed: true });
    await store.inbox.push({ agent: "worker-3", unit: "u3", status: "done" });
    await expect(store.inbox.peek()).rejects.toThrow("ack it before peeking");
    expect(await store.inbox.count()).toBe(3);
    expect((await store.inbox.drain()).batch).toBe(claimed.batch);

    const batch = claimed.batch;
    if (batch === null) throw new Error("expected a claimed batch");
    expect(await store.inbox.ack(batch)).toEqual({ batch, count: 2 });
    expect(await store.inbox.count()).toBe(1);
    expect(await store.inbox.peek()).toHaveLength(1);
    const next = await store.inbox.drain();
    expect(next.pointers).toHaveLength(1);
    if (next.batch === null) throw new Error("expected a second batch");
    await store.inbox.ack(next.batch);
    expect(await store.inbox.count()).toBe(0);
  });

  it("claims a bounded deterministic inbox chunk and leaves the remainder active", async () => {
    const { store } = await initializedStore();
    for (let index = 0; index < 70; index += 1) {
      await store.inbox.push({
        agent: `worker-${index.toString().padStart(2, "0")}`,
        unit: `unit-${index.toString().padStart(2, "0")}`,
        status: "done",
      });
    }
    const first = await store.inbox.drain();
    expect(first.pointers).toHaveLength(64);
    expect(await store.inbox.count()).toBe(70);
    if (first.batch === null) throw new Error("expected first bounded batch");
    await store.inbox.ack(first.batch);
    const second = await store.inbox.drain();
    expect(second.pointers).toHaveLength(6);
    if (second.batch === null) throw new Error("expected second bounded batch");
    await store.inbox.ack(second.batch);
    expect(await store.inbox.count()).toBe(0);
  });

  it("fences a real live writer and recovers its synced lock after process death", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const holder = await startRealLockHolder(directory);
    try {
      const blocked = useStore(directory);
      await expect(
        blocked.units.add({ id: "u1", track: "build" })
      ).rejects.toThrow(`store lock held by pid ${holder.pid}`);
      await blocked.close();
      const forced = useStore(directory, { force: true });
      await expect(
        forced.units.add({ id: "u1", track: "build" })
      ).rejects.toThrow("--force cannot override a live writer without fencing");
      await forced.close();
      expect(await readFile(join(directory, ".orch.lock"), "utf8")).toBe(
        `${holder.pid}\n`
      );
    } finally {
      holder.kill("SIGKILL");
      await holder.exited;
    }

    const recovered = useStore(directory);
    expect(await recovered.units.add({ id: "u1", track: "build" })).toMatchObject({
      id: "u1",
    });
    await recovered.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("parks gates, stores standing orders, and renders status", async () => {
    const { directory, store } = await initializedStore();
    await store.units.add({ id: "u1", track: "build" });
    await store.gates.park({
      id: "release",
      question: "Ship now?",
      options: "ship,wait",
      defaultAnswer: "wait",
    });
    const original = await store.standing.add({
      id: "no-force-push",
      constraint: "Never force push.",
      provenance: "direct-user",
      source: "user:current-request",
      scope: "repository",
      authorityCeiling: "local-write",
    });
    expect(original).toMatchObject({
      id: "no-force-push",
      state: { kind: "active" },
    });
    expect(original.digest).toMatch(/^[0-9a-f]{64}$/);
    const replacement = await store.standing.add({
      id: "no-destructive-git",
      constraint: "Do not run destructive Git commands.",
      provenance: "direct-user",
      source: "user:current-request-follow-up",
      scope: "repository",
      authorityCeiling: "local-write",
    });
    const superseded = await store.standing.supersede({
      id: original.id,
      by: replacement.id,
    });
    expect(superseded.state).toMatchObject({
      kind: "superseded",
      by: replacement.id,
    });
    expect(superseded.digest).not.toBe(original.digest);
    await expect(
      store.standing.add({
        id: "bad-source",
        constraint: "Keep scope bounded.",
        provenance: "direct-user",
        source: "repo:AGENTS.md",
        scope: "repository",
        authorityCeiling: "advisory",
      })
    ).rejects.toThrow("user:");
    expect((await store.status.render()).changed).toBe("first render");
    expect(await readFile(join(directory, "status.md"), "utf8")).toContain(
      "| release | open | Ship now&#x3F; |"
    );
    expect((await store.status.render()).changed).toBe("no derived changes");
    await store.gates.resolve({
      id: "release",
      answer: "ship",
      source: "user:current-request",
    });
    expect((await store.status.render()).changed).toBe("open gates 1->0");
    expect(await store.gates.list()).toEqual([]);
    expect(await store.standing.show()).toEqual([superseded, replacement]);
  });

  it("refuses supersession across provenance, scope, or a broader ceiling", async () => {
    const { store } = await initializedStore();
    const original = await store.standing.add({
      id: "original",
      constraint: "Keep this constraint active.",
      provenance: "direct-user",
      source: "user:current-request",
      scope: "repository",
      authorityCeiling: "read-only",
    });
    const differentProvenance = await store.standing.add({
      id: "different-provenance",
      constraint: "Coordinator replacement.",
      provenance: "coordinator-safety",
      source: "spudex:orchestrate",
      scope: "repository",
      authorityCeiling: "advisory",
    });
    await expect(
      store.standing.supersede({ id: original.id, by: differentProvenance.id })
    ).rejects.toThrow("same provenance class");
    const differentScope = await store.standing.add({
      id: "different-scope",
      constraint: "Scoped replacement.",
      provenance: "direct-user",
      source: "user:scope-change",
      scope: "subdirectory",
      authorityCeiling: "advisory",
    });
    await expect(
      store.standing.supersede({ id: original.id, by: differentScope.id })
    ).rejects.toThrow("identical scope");
    const broader = await store.standing.add({
      id: "broader",
      constraint: "Broader replacement.",
      provenance: "direct-user",
      source: "user:authority-change",
      scope: "repository",
      authorityCeiling: "local-write",
    });
    await expect(
      store.standing.supersede({ id: original.id, by: broader.id })
    ).rejects.toThrow("must not broaden");
    expect((await store.standing.show()).find((row) => row.id === original.id))
      .toMatchObject({ state: { kind: "active" } });
  });

  it("rejects a re-digested persisted supersession that bypasses authority", async () => {
    const { directory, store } = await initializedStore();
    const original = await store.standing.add({
      id: "user-constraint",
      constraint: "Retain the user constraint.",
      provenance: "direct-user",
      source: "user:current-request",
      scope: "repository",
      authorityCeiling: "read-only",
    });
    const replacement = await store.standing.add({
      id: "coordinator-constraint",
      constraint: "Coordinator suggestion.",
      provenance: "coordinator-safety",
      source: "spudex:orchestrate",
      scope: "repository",
      authorityCeiling: "advisory",
    });
    const path = join(directory, "preferences.md");
    const register = JSON.parse(await readFile(path, "utf8")) as {
      records: Array<Record<string, unknown>>;
    };
    const row = register.records.find((item) => item.id === original.id);
    expect(row).toBeDefined();
    if (row === undefined) throw new Error("missing persisted constraint");
    row.state = {
      kind: "superseded",
      by: replacement.id,
      at: "2026-01-01T00:00:00.000Z",
    };
    delete row.digest;
    row.digest = createHash("sha256")
      .update(JSON.stringify(row))
      .digest("hex");
    await writeFile(path, `${JSON.stringify(register, null, 2)}\n`, {
      mode: 0o600,
    });
    await expect(store.standing.show()).rejects.toThrow(
      "same provenance class"
    );
  });

  it("rejects duplicate, unknown, and status-incompatible gate fields", async () => {
    const { directory, store } = await initializedStore();
    const gatePath = join(directory, "gates.md");
    const base = `# Gates\n\n## release\n\n- Status: open\n- Question: Ship now?\n- Options: ship,wait\n- Default: wait`;
    await writeFile(gatePath, `${base}\n- Default: ship\n`, { mode: 0o600 });
    await expect(store.gates.list()).rejects.toThrow("duplicate field Default");
    await writeFile(gatePath, `${base}\n- Extra: ignored\n`, { mode: 0o600 });
    await expect(store.gates.list()).rejects.toThrow("invalid fields: Extra");
    await writeFile(gatePath, `${base}\n- Answer: ship\n`, { mode: 0o600 });
    await expect(store.gates.list()).rejects.toThrow("invalid fields: Answer");
    await writeFile(
      gatePath,
      `${base.replace("Status: open", "Status: resolved")}\n`,
      { mode: 0o600 }
    );
    await expect(store.gates.list()).rejects.toThrow(
      "resolved gate release has invalid fields"
    );
  });

  it("binds gate defaults and resolutions to declared options and user provenance", async () => {
    const { store } = await initializedStore();
    await expect(
      store.gates.park({
        id: "bad-default",
        question: "Ship?",
        options: "ship,wait",
        defaultAnswer: "later",
      })
    ).rejects.toThrow("one of the declared options");
    await expect(
      store.gates.park({
        id: "duplicate-options",
        question: "Ship?",
        options: "ship,ship",
        defaultAnswer: "ship",
      })
    ).rejects.toThrow("must not contain duplicates");
    await store.gates.park({
      id: "release",
      question: "Ship?",
      options: "ship,wait",
      defaultAnswer: "wait",
    });
    await expect(
      store.gates.resolve({
        id: "release",
        answer: "later",
        source: "user:current-request",
      })
    ).rejects.toThrow("one of the declared options");
    await expect(
      store.gates.resolve({
        id: "release",
        answer: "ship",
        source: "agent:guess",
      })
    ).rejects.toThrow("user: pointer");
    await expect(
      store.gates.resolve({
        id: "release",
        answer: "ship",
        source: "user:current-request",
      })
    ).resolves.toMatchObject({
      answer: "ship",
      resolvedBy: "user:current-request",
    });
  });

  it("escapes active Markdown content and encodes the summary marker", async () => {
    const { directory, store } = await initializedStore();
    const question =
      "Render ![pixel](https://attacker.invalid/pixel), `code`, *bold*, or <img src=x onerror=alert(1)>?";
    await store.gates.park({
      id: "release-->spoof",
      question,
      options: "ship,wait",
      defaultAnswer: "wait",
    });
    expect(await store.gates.list()).toEqual([
      {
        kind: "open",
        id: "release-->spoof",
        question,
        options: "ship,wait",
        defaultAnswer: "wait",
      },
    ]);
    await store.status.render();
    const gates = await readFile(join(directory, "gates.md"), "utf8");
    const status = await readFile(join(directory, "status.md"), "utf8");
    expect(gates).not.toContain("<img");
    expect(gates).not.toContain("![pixel]");
    expect(gates).not.toContain("https://attacker.invalid/pixel");
    expect(gates).toContain("&#x21;&#x5B;pixel&#x5D;&#x28;https");
    expect(gates).toContain("&#x3C;img");
    expect(status).not.toContain("<img");
    expect(status).not.toContain("![pixel]");
    expect(status).not.toContain("https://attacker.invalid/pixel");
    expect(status).toContain("&#x21;&#x5B;pixel&#x5D;&#x28;https");
    expect(status).toContain("&#x3C;img");
    expect(status.match(/-->/g)).toHaveLength(1);
    expect(status).toMatch(/<!-- orch-summary [A-Za-z0-9_-]+ -->/);
  });

  it("parses ordered Graphite frontier states and validates an exact pin", () => {
    expect(
      parseGtBranches("◯ main\n│ ◯ stack/base\n│ │ ◉ stack/top (current)\n")
    ).toEqual(["stack/base", "stack/top"]);
    expect(
      parseGtPullRequest({ branch: "stack/base", detail: "PR #10 (Merged) title" })
    ).toEqual({ pr: 10, state: "MERGED" });
    expect(
      parseGtPullRequest({
        branch: "stack/top",
        detail: "PR #11 (Needs approvals) title",
      })
    ).toEqual({ pr: 11, state: "OPEN" });
    expect(() =>
      validateFrontierPin({ actual: [10, 11], expected: [10, 11] })
    ).not.toThrow();
    expect(() =>
      validateFrontierPin({ actual: [10, 11], expected: [10, 12] })
    ).toThrow("missing from gt: 12; extra in gt: 11");
    expect(() =>
      validateFrontierPin({ actual: [10, 11], expected: [11, 10] })
    ).toThrow("order differs");
  });

  it("rejects malformed Graphite output and unknown states", () => {
    expect(() => parseGtBranches("◯ main\nnot a stack row\n")).toThrow(
      'unparseable line 2: "not a stack row"'
    );
    expect(() =>
      parseGtPullRequest({ branch: "stack/a", detail: "nothing useful" })
    ).toThrow("invalid PR row");
    expect(() =>
      parseGtPullRequest({ branch: "stack/a", detail: "PR #10 (Future state) title" })
    ).toThrow("unknown PR state");
    expect(() => parseGtBranches("◯ main\n│ ◯ -help\n")).toThrow(
      "not a safe Git branch name"
    );
    expect(() => parseGtBranches("◯ main\n│ ◯ stack/\u001bpoison\n")).toThrow(
      "unsafe control"
    );
    const oversized = [
      "◯ main",
      ...Array.from({ length: 257 }, (_, index) => `│ ◯ stack/branch-${index}`),
      "",
    ].join("\n");
    expect(() => parseGtBranches(oversized)).toThrow("256-branch stack limit");
  });

  it("counts hostile-looking state names without prototype collisions", async () => {
    const { store } = await initializedStore();
    for (const [index, state] of ["__proto__", "constructor", "toString"].entries()) {
      const id = `state-${index}`;
      await store.units.add({ id, track: "counting" });
      await store.units.set({ id, state });
    }
    expect(await store.units.counts()).toEqual(
      Object.fromEntries([
        ["__proto__", 1],
        ["constructor", 1],
        ["toString", 1],
      ])
    );
    expect((await store.status.render()).changed).toBe("first render");
    expect((await store.status.render()).changed).toBe("no derived changes");
  });

  it("rejects malformed TSV, verdict, frontier, and inbox data", async () => {
    const { directory, store } = await initializedStore();
    await writeFile(join(directory, "units.tsv"), "wrong\n", { mode: 0o600 });
    await expect(store.units.list()).rejects.toThrow("invalid header");
    await writeFile(
      join(directory, "units.tsv"),
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nshort\trow\n",
      { mode: 0o600 }
    );
    await expect(store.units.list()).rejects.toThrow("malformed row");
    await writeFile(
      join(directory, "units.tsv"),
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nu1\tbuild\tdone\tbranch\t101\tfoo\tbrief\n",
      { mode: 0o600 }
    );
    await expect(store.units.list()).rejects.toThrow("SHA must be a complete");
    await writeFile(
      join(directory, "ledger.tsv"),
      `repository\tpr\tsha\tverdict\treceipt\treceipt_digest\tverifier\tts\n${REPOSITORY}\t1\t${SHA_A}\tinvalid\treceipt\t${"a".repeat(64)}\tme\t2026-01-01T00:00:00.000Z\n`,
      { mode: 0o600 }
    );
    await expect(store.ledger.summary()).rejects.toThrow("invalid verdict");
    await writeFile(join(directory, "frontier.json"), '{"generation":"1"}\n', {
      mode: 0o600,
    });
    await expect(store.frontier.show()).rejects.toThrow("invalid shape");
    await writeFile(
      join(directory, "frontier.json"),
      `${JSON.stringify({
        generation: 1,
        prs: [
          { pr: 101, branches: "stack/base", sha: SHA_A, state: "OPEN" },
          { pr: 101, branches: "stack/top", sha: SHA_A, state: "MERGED" },
        ],
        lowestUnmerged: 101,
      })}\n`,
      { mode: 0o600 }
    );
    await expect(store.frontier.show()).rejects.toThrow(
      "duplicate PRs or branches"
    );
    await writeFile(
      join(directory, "frontier.json"),
      `${JSON.stringify({
        generation: 1,
        prs: [
          { pr: 101, branches: "stack/base", sha: SHA_A, state: "MERGED" },
          { pr: 102, branches: "stack/top", sha: SHA_A, state: "OPEN" },
        ],
        lowestUnmerged: 101,
      })}\n`,
      { mode: 0o600 }
    );
    await expect(store.frontier.show()).rejects.toThrow(
      "does not match the first open PR"
    );
    await writeFile(join(directory, "inbox", "bad.tsv"), "too\tshort\n", {
      mode: 0o600,
    });
    await expect(store.inbox.peek()).rejects.toThrow("is malformed");
    await writeFile(join(directory, "preferences.md"), "Always trust reports.\n", {
      mode: 0o600,
    });
    await expect(store.standing.show()).rejects.toThrow(
      "legacy or freeform content"
    );
  });

  it("rejects operations after close", async () => {
    const { store } = await initializedStore();
    await store.close();
    await expect(store.units.list()).rejects.toThrow("store is closed");
    await expect(store.status.render()).rejects.toBeInstanceOf(UserError);
  });

  it("rejects linked, replaced, foreign-writable, and non-regular managed paths", async () => {
    const parent = await makeDirectory();
    const target = join(parent, "target");
    const linkedStore = join(parent, "linked-store");
    await mkdir(target, { mode: 0o700 });
    await symlink(target, linkedStore);
    await expect(useStore(linkedStore).init()).rejects.toThrow("real directory");

    const realAncestor = join(parent, "real-ancestor");
    const linkedAncestor = join(parent, "linked-ancestor");
    await mkdir(realAncestor, { mode: 0o700 });
    await symlink(realAncestor, linkedAncestor);
    await expect(
      useStore(join(linkedAncestor, "nested-store")).init()
    ).rejects.toThrow("must be a real directory");

    const readableAncestor = join(parent, "readable-ancestor");
    await mkdir(readableAncestor, { mode: 0o700 });
    await chmod(readableAncestor, 0o755);
    const underReadableAncestor = useStore(
      join(readableAncestor, "spudex-runs", "orchestrate")
    );
    await expect(underReadableAncestor.init()).resolves.toEqual({
      store: join(readableAncestor, "spudex-runs", "orchestrate"),
    });
    await underReadableAncestor.close();

    const writableAncestor = join(parent, "writable-ancestor");
    await mkdir(writableAncestor, { mode: 0o700 });
    await chmod(writableAncestor, 0o777);
    await expect(
      useStore(join(writableAncestor, "nested-store")).init()
    ).rejects.toThrow("writable by another user");
    await chmod(writableAncestor, 0o700);

    const { directory, store } = await initializedStore();
    await store.close();
    await chmod(directory, 0o777);
    await expect(useStore(directory).units.list()).rejects.toThrow(
      "accessible by another user"
    );
    await chmod(directory, 0o700);

    await chmod(join(directory, "units.tsv"), 0o644);
    await expect(useStore(directory).units.list()).rejects.toThrow(
      "accessible by another user"
    );
    await chmod(join(directory, "units.tsv"), 0o600);

    const hardlink = join(parent, "units-hardlink.tsv");
    await link(join(directory, "units.tsv"), hardlink);
    await expect(useStore(directory).units.list()).rejects.toThrow(
      "exactly one link"
    );
    await unlink(hardlink);

    const outside = join(parent, "outside.tsv");
    await writeFile(outside, "outside\n", { mode: 0o600 });
    await unlink(join(directory, "units.tsv"));
    await symlink(outside, join(directory, "units.tsv"));
    await expect(useStore(directory).units.list()).rejects.toThrow();
    expect(await readFile(outside, "utf8")).toBe("outside\n");
  });

  it("bounds and validates lock PIDs and refuses linked lock removal", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    await writeFile(join(directory, ".orch.lock"), `${"9".repeat(40)}\n`, {
      mode: 0o600,
    });
    await expect(
      useStore(directory).units.add({ id: "u1", track: "build" })
    ).rejects.toThrow(
      "exceeds the 32-byte limit"
    );

    await writeFile(join(directory, ".orch.lock"), "12garbage\n", {
      mode: 0o600,
    });
    await expect(useStore(directory).units.add({ id: "u1", track: "build" })).rejects.toThrow(
      "invalid PID"
    );
    await expect(
      useStore(directory, { force: true }).units.add({ id: "u1", track: "build" })
    ).rejects.toThrow("invalid PID");
    await unlink(join(directory, ".orch.lock"));

    const exited = Bun.spawn(["true"]);
    await exited.exited;
    await writeFile(join(directory, ".orch.lock.reclaim"), `${exited.pid}\n`, {
      mode: 0o600,
    });
    await expect(
      useStore(directory).units.add({ id: "u1", track: "build" })
    ).rejects.toThrow(
      "after confirming no orchestrator process is active for this store, remove that exact marker and retry"
    );
    expect(await readFile(join(directory, ".orch.lock.reclaim"), "utf8")).toBe(
      `${exited.pid}\n`
    );
    await unlink(join(directory, ".orch.lock.reclaim"));

    const recovered = useStore(directory);
    await recovered.units.add({ id: "u1", track: "build" });
    await recovered.close();

    const lockTarget = join(directory, "lock-target");
    await writeFile(lockTarget, `${process.pid}\n`, { mode: 0o600 });
    await symlink(lockTarget, join(directory, ".orch.lock"));
    await expect(
      useStore(directory, { force: true }).units.add({ id: "u2", track: "build" })
    ).rejects.toThrow();
    expect(await readFile(lockTarget, "utf8")).toBe(`${process.pid}\n`);
  });

  it("replays a batch after an interrupted claim and refuses linked acknowledgements", async () => {
    const { directory, store } = await initializedStore();
    await store.inbox.push({ agent: "worker", unit: "u1", status: "done" });
    await store.close();

    const batch = "drain-1000000000000-00000000-0000-4000-8000-000000000000";
    await rename(join(directory, "inbox"), join(directory, "inbox-pending", batch));
    const resumed = useStore(directory);
    const replayed = await resumed.inbox.drain();
    expect(replayed.batch).toBe(batch);
    expect(replayed.replayed).toBe(true);
    expect(replayed.pointers).toHaveLength(1);
    expect(await readdir(join(directory, "inbox"))).toEqual([]);
    await resumed.inbox.ack(batch);

    const outside = join(directory, "outside-batch");
    await mkdir(outside, { mode: 0o700 });
    const linkedBatch = "drain-1000000000001-00000000-0000-4000-8000-000000000001";
    await symlink(outside, join(directory, "inbox-pending", linkedBatch));
    await expect(resumed.inbox.ack(linkedBatch)).rejects.toThrow();
    expect(await readdir(outside)).toEqual([]);
  });
});

describe("real orch CLI process", () => {
  it("prints help and rejects invalid parsing with exit 1", async () => {
    const help = runCli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Commands:");
    expect(help.stdout).toContain("ledger");
    expect(help.stdout).toContain("inbox");
    const directory = await makeDirectory();
    const invalid = runCli(["--store", directory, "unit", "add", "u1"]);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("required option '--track <track>'");
  });

  it("accepts ORCH_STORE and emits complete JSON", async () => {
    const directory = await makeDirectory();
    const env = { ...process.env, ORCH_STORE: directory };
    expect(runCli(["init"], env).code).toBe(0);
    const added = runCli(["unit", "add", "u1", "--track", "build", "--json"], env);
    expect(added.code).toBe(0);
    expect(JSON.parse(added.stdout)).toEqual({
      id: "u1",
      track: "build",
      state: "pending",
      branch: "",
      pr: "",
      sha: "",
      brief: "",
    });
  });

  it("renders user-controlled paths as one terminal-safe compact record", async () => {
    const parent = await makeDirectory();
    const directory = join(parent, "store\n\t\u202ename");
    await mkdir(directory, { mode: 0o700 });
    const result = runCli(["--store", directory, "init"]);
    expect(result.code).toBe(0);
    expect(result.stdout.split("\n").filter(Boolean)).toHaveLength(1);
    expect(result.stdout).not.toContain("\t");
    expect(result.stdout).not.toContain("\u202e");
    expect(result.stdout).toContain("store???name");
  });

  it("maps usage, missing records, and completion gates to distinct nonzero exits", async () => {
    const directory = await makeDirectory();
    const fixture = await gitFixture(directory, "cli-repository");
    const unitProof = await processEvidence({
      directory,
      name: "cli-unit",
      command: [process.execPath, "test", "math.test.ts"],
      cwd: fixture.repo,
      headSha: fixture.sha,
      surface: "committed fixture unit test executed by Bun",
    });
    const typeProof = await processEvidence({
      directory,
      name: "cli-type",
      command: [
        join(import.meta.dir, "..", "node_modules", ".bin", "tsc"),
        "--noEmit",
        "--strict",
        "--target",
        "esnext",
        "--module",
        "esnext",
        "math.ts",
      ],
      cwd: fixture.repo,
      headSha: fixture.sha,
      surface: "committed fixture TypeScript source checked by tsc",
    });
    const failedProof = await processEvidence({
      directory,
      name: "cli-failed",
      command: ["git", "cat-file", "-e", "f".repeat(40)],
      cwd: fixture.repo,
      headSha: fixture.sha,
      surface: "committed fixture Git object lookup",
    });
    expect(unitProof.exitStatus).toBe(0);
    expect(typeProof.exitStatus).toBe(0);
    expect(failedProof.exitStatus).toBeGreaterThan(0);
    expect(runCli(["--store", directory, "init"]).code).toBe(0);
    const missingRepo = runCli(["--store", directory, "frontier", "set"]);
    expect(missingRepo.code).toBe(1);
    expect(missingRepo.stderr).toContain("set --repo <dir> or ORCH_REPO");

    const missingUnit = runCli(["--store", directory, "unit", "get", "missing"]);
    expect(missingUnit.code).toBe(2);
    const missingLedger = runCli([
      "--store",
      directory,
      "--json",
      "ledger",
      "gate",
      "101",
      SHA_A,
      "--repo",
      REPOSITORY,
    ]);
    expect(missingLedger.code).toBe(2);
    expect(JSON.parse(missingLedger.stdout)).toEqual({
      repository: REPOSITORY,
      pr: "101",
      sha: SHA_A,
      verdict: "NOT-VERIFIED",
    });

    const failedReceipt = join(directory, "failed.receipt.json");
    expect(
      createReceiptCli({
        directory,
        pr: 101,
        sha: fixture.sha,
        verdict: "verifier-failed",
        proof: failedProof,
        output: failedReceipt,
      }).code
    ).toBe(0);
    expect(
      runCli([
        "--store",
        directory,
        "ledger",
        "record",
        "101",
        fixture.sha,
        "verifier-failed",
        "--repo",
        REPOSITORY,
        "--receipt",
        failedReceipt,
      ]).code
    ).toBe(0);
    expect(
      runCli([
        "--store",
        directory,
        "ledger",
        "gate",
        "101",
        fixture.sha,
        "--repo",
        REPOSITORY,
      ]).code
    ).toBe(1);

    const typeReceipt = join(directory, "type.receipt.json");
    expect(
      createReceiptCli({
        directory,
        pr: 102,
        sha: fixture.sha,
        verdict: "type-check-only",
        proof: typeProof,
        output: typeReceipt,
      }).code
    ).toBe(0);
    expect(
      runCli([
        "--store",
        directory,
        "ledger",
        "record",
        "102",
        fixture.sha,
        "type-check-only",
        "--repo",
        REPOSITORY,
        "--receipt",
        typeReceipt,
      ]).code
    ).toBe(0);
    expect(
      runCli([
        "--store",
        directory,
        "ledger",
        "gate",
        "102",
        fixture.sha,
        "--repo",
        REPOSITORY,
      ]).code
    ).toBe(1);
    expect(
      runCli([
        "--store",
        directory,
        "ledger",
        "gate",
        "102",
        fixture.sha,
        "--repo",
        REPOSITORY,
        "--allow-type-check-only",
      ]).code
    ).toBe(0);

    const unitReceipt = join(directory, "unit.receipt.json");
    expect(
      createReceiptCli({
        directory,
        pr: 103,
        sha: fixture.sha,
        verdict: "unit-test-verified",
        proof: unitProof,
        output: unitReceipt,
      }).code
    ).toBe(0);
    expect(
      runCli([
        "--store",
        directory,
        "ledger",
        "record",
        "103",
        fixture.sha,
        "unit-test-verified",
        "--repo",
        REPOSITORY,
        "--receipt",
        unitReceipt,
      ]).code
    ).toBe(0);
    expect(
      runCli([
        "--store",
        directory,
        "ledger",
        "gate",
        "103",
        fixture.sha,
        "--repo",
        REPOSITORY,
      ]).code
    ).toBe(0);
    expect(
      createReceiptCli({
        directory,
        pr: 103,
        sha: fixture.sha,
        verdict: "unit-test-verified",
        proof: unitProof,
        output: unitReceipt,
      }).code
    ).toBe(1);

    const poisoned = runCli([
      "--store",
      directory,
      "unit",
      "add",
      "\u001b]0;poison\u0007",
      "--track",
      "build",
    ]);
    expect(poisoned.code).toBe(1);
    expect(poisoned.stderr).not.toContain("\u001b");
    expect(
      runCli([
        "--store",
        directory,
        "inbox",
        "push",
        "worker",
        "u1",
        "done",
        "--report",
        "x".repeat(20 * 1024),
      ]).code
    ).toBe(1);
  });
});
