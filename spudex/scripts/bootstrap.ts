import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

const scriptsDirectory = import.meta.dir;
const nodeModulesDirectory = join(scriptsDirectory, "node_modules");
const lockPath = join(scriptsDirectory, ".spudex-tools-install.lock");
const installWaitMilliseconds = 55_000;
const installTimeoutMilliseconds = 120_000;
const installMaxOutputBytes = 4 * 1024 * 1024;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

export interface BoundedProcessLimits {
  readonly timeoutMilliseconds: number;
  readonly maxOutputBytes: number;
}

export type BoundedProcessEnvironment = Readonly<
  Record<string, string | undefined>
>;

export function runBoundedProcess(
  command: readonly string[],
  cwd: string,
  limits: BoundedProcessLimits,
  env?: BoundedProcessEnvironment
): Bun.SyncSubprocess<"pipe", "pipe"> {
  if (command.length === 0) throw new Error("bounded process command must not be empty");
  if (
    !Number.isSafeInteger(limits.timeoutMilliseconds) ||
    limits.timeoutMilliseconds < 1 ||
    !Number.isSafeInteger(limits.maxOutputBytes) ||
    limits.maxOutputBytes < 1
  ) {
    throw new Error("bounded process limits must be positive safe integers");
  }
  return Bun.spawnSync([...command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: limits.timeoutMilliseconds,
    maxBuffer: limits.maxOutputBytes,
    killSignal: "SIGKILL",
    ...(env === undefined ? {} : { env }),
  });
}

interface IntegrityEntry {
  readonly path: string;
  readonly kind: "file" | "symlink";
  readonly sha256: string;
}

interface TreePaths {
  readonly root: string;
  readonly commander: string;
  readonly installKey: string;
  readonly integrity: string;
}

interface LockIdentity {
  readonly dev: number;
  readonly ino: number;
}

function pathsFor(root: string): TreePaths {
  return {
    root,
    commander: join(root, "commander", "package.json"),
    installKey: join(root, ".spudex-tools-install-key"),
    integrity: join(root, ".spudex-tools-integrity.json"),
  };
}

function currentInstallKey(): string {
  return createHash("sha256")
    .update(readFileSync(join(scriptsDirectory, "package.json")))
    .update("\0")
    .update(readFileSync(join(scriptsDirectory, "bun.lock")))
    .digest("hex");
}

function currentUid(): number {
  if (process.getuid === undefined) {
    throw new Error("Spudex dependency integrity requires a POSIX user identity");
  }
  return process.getuid();
}

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export function ensureDependenciesInstalled(): void {
  const installKey = currentInstallKey();
  if (installedTreeIsTrusted(nodeModulesDirectory, installKey)) return;

  const lock = acquireInstallLock(installKey);
  if (lock === null) return;
  try {
    if (!installedTreeIsTrusted(nodeModulesDirectory, installKey)) {
      installAndPublish(installKey);
    }
  } finally {
    releaseInstallLock(lock);
  }

  const restarted = Bun.spawnSync([process.execPath, ...process.argv.slice(1)], {
    cwd: process.cwd(),
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(restarted.exitCode ?? 1);
}

function acquireInstallLock(installKey: string): LockIdentity | null {
  const deadline = Date.now() + installWaitMilliseconds;
  while (true) {
    const temporaryLock = join(
      scriptsDirectory,
      `.spudex-tools-lock-${process.pid}-${randomBytes(8).toString("hex")}`
    );
    let descriptor: number | undefined;
    try {
      descriptor = openSync(
        temporaryLock,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      );
      const value = Buffer.from(`${process.pid}\n`, "utf8");
      const written = writeSync(descriptor, value, 0, value.length, null);
      if (written !== value.length) {
        throw new Error(`short dependency-lock write: ${written}/${value.length} bytes`);
      }
      fchmodSync(descriptor, 0o600);
      fsyncSync(descriptor);
      const metadata = fstatSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      linkSync(temporaryLock, lockPath);
      unlinkSync(temporaryLock);
      return { dev: metadata.dev, ino: metadata.ino };
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      try {
        unlinkSync(temporaryLock);
      } catch (unlinkError) {
        if (errorCode(unlinkError) !== "ENOENT") throw unlinkError;
      }
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }
    }

    if (installedTreeIsTrusted(nodeModulesDirectory, installKey)) return null;
    if (!installLockIsActive()) continue;
    if (Date.now() >= deadline) {
      throw new Error("timed out waiting for the Spudex dependency installer");
    }
    Atomics.wait(waitBuffer, 0, 0, 100);
  }
}

function installLockIsActive(): boolean {
  try {
    const metadata = lstatSync(lockPath);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.uid !== currentUid() ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size > 32
    ) {
      throw new Error("unsafe Spudex dependency-install lock");
    }
    const value = readOwnedFile(lockPath, 32).toString("utf8").trim();
    if (!/^[1-9][0-9]*$/.test(value)) {
      throw new Error("invalid Spudex dependency-install lock owner");
    }
    const owner = Number(value);
    try {
      process.kill(owner, 0);
      return true;
    } catch (error) {
      if (errorCode(error) !== "ESRCH") return true;
    }
    throw new Error(
      `stale Spudex dependency-install lock for dead PID ${owner}; ` +
        `remove ${lockPath} only after confirming no installer is running`
    );
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function releaseInstallLock(identity: LockIdentity): void {
  try {
    const current = lstatSync(lockPath);
    if (current.dev === identity.dev && current.ino === identity.ino) {
      unlinkSync(lockPath);
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  }
}

function installAndPublish(installKey: string): void {
  const stage = mkdtempSync(join(scriptsDirectory, ".spudex-tools-stage-"));
  chmodSync(stage, 0o700);
  const candidate = join(stage, "node_modules");
  const backup = join(
    scriptsDirectory,
    `.spudex-tools-backup-${process.pid}-${randomBytes(8).toString("hex")}`
  );
  let originalMoved = false;
  let candidateMoved = false;

  try {
    for (const filename of ["package.json", "bun.lock"]) {
      const destination = join(stage, filename);
      copyFileSync(join(scriptsDirectory, filename), destination);
      chmodSync(destination, 0o600);
    }
    const result = runBoundedProcess(
      [process.execPath, "install", "--frozen-lockfile"],
      stage,
      {
        timeoutMilliseconds: installTimeoutMilliseconds,
        maxOutputBytes: installMaxOutputBytes,
      },
      {
        PATH: process.env.PATH,
        HOME: stage,
        TMPDIR: stage,
        XDG_CACHE_HOME: join(stage, ".cache"),
        BUN_INSTALL_CACHE_DIR: join(stage, ".bun-cache"),
        CI: "true",
        NO_COLOR: "1",
      }
    );
    if (result.exitedDueToTimeout) {
      throw new Error(
        `bun install --frozen-lockfile exceeded ${installTimeoutMilliseconds}ms`
      );
    }
    if (result.exitedDueToMaxBuffer) {
      throw new Error(
        `bun install --frozen-lockfile exceeded ${installMaxOutputBytes} output bytes`
      );
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `bun install --frozen-lockfile exited with status ${result.exitCode}`
      );
    }
    if (!existsSync(pathsFor(candidate).commander)) {
      throw new Error(
        "bun install --frozen-lockfile completed without installing commander"
      );
    }

    prepareInstalledTree(candidate, installKey);
    if (!installedTreeIsTrusted(candidate, installKey)) {
      throw new Error("staged dependency tree failed integrity verification");
    }

    if (existsSync(nodeModulesDirectory)) {
      renameSync(nodeModulesDirectory, backup);
      originalMoved = true;
    }
    renameSync(candidate, nodeModulesDirectory);
    candidateMoved = true;
    if (!installedTreeIsTrusted(nodeModulesDirectory, installKey)) {
      throw new Error("published dependency tree failed integrity verification");
    }

    // The verified candidate is now the committed tree. Backup cleanup must
    // never re-arm rollback or discard this trusted publication.
    candidateMoved = false;
    if (originalMoved) {
      originalMoved = false;
      try {
        rmSync(backup, { recursive: true, force: true });
      } catch {
        // A stale, private backup is safer than rolling back a verified tree.
      }
    }
  } catch (error) {
    if (candidateMoved && existsSync(nodeModulesDirectory)) {
      rmSync(nodeModulesDirectory, { recursive: true, force: true });
      candidateMoved = false;
    }
    if (originalMoved && existsSync(backup)) {
      renameSync(backup, nodeModulesDirectory);
      originalMoved = false;
    }
    throw error;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function prepareInstalledTree(root: string, installKey: string): void {
  const paths = pathsFor(root);
  hardenPermissions(root, root);
  writePrivateFile(paths.installKey, `${installKey}\n`);
  writePrivateFile(
    paths.integrity,
    `${JSON.stringify(integrityEntries(root), null, 2)}\n`
  );
}

function writePrivateFile(path: string, value: string): void {
  const descriptor = openSync(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600
  );
  try {
    const data = Buffer.from(value, "utf8");
    const written = writeSync(descriptor, data, 0, data.length, null);
    if (written !== data.length) {
      throw new Error(`short private-file write: ${written}/${data.length} bytes`);
    }
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function insideTree(root: string, path: string): boolean {
  const canonicalRoot = realpathSync(root);
  const target = realpathSync(path);
  return target === canonicalRoot || target.startsWith(`${canonicalRoot}${sep}`);
}

function walk(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap<string>((entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) return [path];
      return entry.isDirectory() ? [path, ...walk(path)] : [path];
    });
}

function integrityEntries(root: string): readonly IntegrityEntry[] {
  const paths = pathsFor(root);
  return walk(root).flatMap<IntegrityEntry>((path): IntegrityEntry[] => {
    if (path === paths.installKey || path === paths.integrity) return [];
    const metadata = lstatSync(path);
    const name = relative(root, path).replaceAll("\\", "/");
    if (metadata.isSymbolicLink()) {
      if (!insideTree(root, path)) {
        throw new Error(`dependency symlink escapes node_modules: ${name}`);
      }
      return [{
        path: name,
        kind: "symlink",
        sha256: sha256(readlinkSync(path)),
      }];
    }
    if (metadata.isDirectory()) return [];
    if (!metadata.isFile()) {
      throw new Error(`unsupported dependency entry: ${name}`);
    }
    return [{ path: name, kind: "file", sha256: sha256(readOwnedFile(path)) }];
  });
}

function hardenPermissions(root: string, path: string): void {
  const metadata = lstatSync(path);
  if (metadata.uid !== currentUid()) {
    throw new Error(`dependency entry is not owned by the current user: ${path}`);
  }
  if (metadata.isSymbolicLink()) {
    if (!insideTree(root, path)) {
      throw new Error(
        `dependency symlink escapes node_modules: ${relative(root, path)}`
      );
    }
    return;
  }
  chmodSync(path, metadata.mode & 0o755);
  if (metadata.isDirectory()) {
    for (const entry of readdirSync(path)) {
      hardenPermissions(root, join(path, entry));
    }
  }
}

function readOwnedFile(path: string, maxBytes = 64 * 1024 * 1024): Buffer {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      metadata.uid !== currentUid() ||
      (metadata.mode & 0o022) !== 0 ||
      metadata.size > maxBytes
    ) {
      throw new Error(`unsafe dependency file: ${path}`);
    }
    const value = readFileSync(descriptor);
    if (value.length !== metadata.size) {
      throw new Error(`dependency file changed while reading: ${path}`);
    }
    return value;
  } finally {
    closeSync(descriptor);
  }
}

function installedTreeIsTrusted(root: string, installKey: string): boolean {
  try {
    const paths = pathsFor(root);
    if (
      !existsSync(paths.commander) ||
      !existsSync(paths.installKey) ||
      !existsSync(paths.integrity)
    ) {
      return false;
    }
    const rootMetadata = lstatSync(root);
    if (
      rootMetadata.isSymbolicLink() ||
      !rootMetadata.isDirectory() ||
      rootMetadata.uid !== currentUid() ||
      (rootMetadata.mode & 0o022) !== 0
    ) {
      return false;
    }
    for (const marker of [paths.installKey, paths.integrity]) {
      const metadata = lstatSync(marker);
      if (
        metadata.isSymbolicLink() ||
        !metadata.isFile() ||
        metadata.uid !== currentUid() ||
        metadata.nlink !== 1 ||
        (metadata.mode & 0o777) !== 0o600
      ) {
        return false;
      }
    }
    if (readOwnedFile(paths.installKey, 128).toString("utf8").trim() !== installKey) {
      return false;
    }
    for (const path of walk(root)) {
      const metadata = lstatSync(path);
      if (metadata.uid !== currentUid()) return false;
      if (metadata.isSymbolicLink()) {
        if (!insideTree(root, path)) return false;
      } else if ((metadata.mode & 0o022) !== 0) {
        return false;
      }
    }
    const expected = JSON.parse(
      readOwnedFile(paths.integrity, 16 * 1024 * 1024).toString("utf8")
    ) as unknown;
    return JSON.stringify(expected) === JSON.stringify(integrityEntries(root));
  } catch {
    return false;
  }
}
