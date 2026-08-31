import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as FS_CONSTANTS, type Dirent, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  readdir,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const UNIT_HEADER = "id\ttrack\tstate\tbranch\tpr\tsha\tbrief";
const LEDGER_HEADER =
  "repository\tpr\tsha\tverdict\treceipt\treceipt_digest\tverifier\tts";
const LOCK_FILE = ".orch.lock";
const LOCK_RECLAIM_FILE = ".orch.lock.reclaim";
const ACTIVE_INBOX = "inbox";
const PENDING_INBOX = "inbox-pending";
const SAFE_DIRECTORY_MODE = 0o700;
const SAFE_FILE_MODE = 0o600;
const SAFE_RECEIPT_MODE = 0o400;
const UNSAFE_ACCESS_BITS = 0o077;
const MAX_STORE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_INBOX_POINTER_BYTES = 16 * 1024;
const MAX_INBOX_BATCH_ENTRIES = 64;
const MAX_INBOX_BATCH_BYTES = 256 * 1024;
const MAX_INBOX_DIRECTORY_ENTRIES = 4096;
const MAX_INBOX_DIRECTORY_BYTES = 16 * 1024 * 1024;
const MAX_PENDING_BATCHES = 1;
const MAX_LOCK_BYTES = 32;
const MAX_PID = 2_147_483_647;
const EXTERNAL_COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_GRAPHITE_STACK_ENTRIES = 256;
const MAX_GRAPHITE_FRONTIER_DURATION_MS = 120_000;
const MAX_GATE_OPTIONS = 16;
const BATCH_PATTERN = /^drain-[1-9]\d{0,15}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isolatedGitEnvironment(
  additions: Readonly<Record<string, string>> = {}
): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith("GIT_")) delete env[name];
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    ...additions,
  };
}

export type Verdict =
  | "live-ui-verified"
  | "unit-test-verified"
  | "type-check-only"
  | "verifier-blocked"
  | "verifier-failed";

export interface Unit {
  readonly id: string;
  readonly track: string;
  readonly state: string;
  readonly branch: string;
  readonly pr: string;
  readonly sha: string;
  readonly brief: string;
}

export interface LedgerEntry {
  readonly repository: string;
  readonly pr: string;
  readonly sha: string;
  readonly verdict: Verdict;
  readonly receipt: string;
  readonly receiptDigest: string;
  readonly verifier: string;
  readonly ts: string;
}

export type VerificationArtifactKind =
  | "live-ui"
  | "unit-test"
  | "type-check"
  | "blocked"
  | "failed";

export interface VerificationReceipt {
  readonly schema: "cstack-verification-receipt/v1";
  readonly repository: string;
  readonly pr: number;
  readonly headSha: string;
  readonly verdict: Verdict;
  readonly verifier: string;
  readonly verifiedAt: string;
  readonly artifact: {
    readonly kind: VerificationArtifactKind;
    readonly command: string;
    readonly surface: string;
    readonly exitStatus: number | null;
    readonly reference: string;
    readonly evidenceDigest: string;
  };
  readonly digest: string;
}

export interface CreateVerificationReceiptParams {
  readonly repository: string;
  readonly pr: number;
  readonly headSha: string;
  readonly verdict: Verdict;
  readonly verifier: string;
  readonly verifiedAt: string;
  readonly artifact: VerificationReceipt["artifact"];
}

export interface WriteVerificationReceiptParams {
  readonly anchor: string;
  readonly repository: string;
  readonly pr: number;
  readonly headSha: string;
  readonly verdict: Verdict;
  readonly verifier: string;
  readonly verifiedAt?: string;
  readonly command: string;
  readonly surface: string;
  readonly exitStatus: number | null;
  readonly evidence: string;
  readonly output: string;
}

export interface InboxPointer {
  readonly ts: string;
  readonly agent: string;
  readonly unit: string;
  readonly status: string;
  readonly report: string;
}

export interface InboxPushResult {
  readonly pointer: InboxPointer;
  readonly filename: string;
}

export interface InboxDrainResult {
  readonly batch: string | null;
  readonly pointers: readonly InboxPointer[];
  readonly replayed: boolean;
}

export interface InboxAckResult {
  readonly batch: string;
  readonly count: number;
}

export interface OpenGate {
  readonly kind: "open";
  readonly id: string;
  readonly question: string;
  readonly options: string;
  readonly defaultAnswer: string;
}

export interface ResolvedGate {
  readonly kind: "resolved";
  readonly id: string;
  readonly question: string;
  readonly options: string;
  readonly defaultAnswer: string;
  readonly answer: string;
  readonly resolvedBy: string;
}

export type Gate = OpenGate | ResolvedGate;

export type FrontierPrState = "OPEN" | "MERGED" | "CLOSED";

export interface FrontierPr {
  readonly pr: number;
  readonly branches: string;
  readonly sha: string;
  readonly state: FrontierPrState;
}

export interface Frontier {
  readonly generation: number;
  readonly prs: readonly FrontierPr[];
  readonly lowestUnmerged: number | null;
}

export type ConstraintProvenance =
  | "direct-user"
  | "repository-policy"
  | "coordinator-safety";

export type ConstraintAuthorityCeiling =
  | "advisory"
  | "read-only"
  | "local-write";

export type ConstraintState =
  | { readonly kind: "active" }
  | {
      readonly kind: "superseded";
      readonly by: string;
      readonly at: string;
    };

export interface ConstraintRecord {
  readonly id: string;
  readonly constraint: string;
  readonly provenance: ConstraintProvenance;
  readonly source: string;
  readonly scope: string;
  readonly authorityCeiling: ConstraintAuthorityCeiling;
  readonly capturedAt: string;
  readonly digest: string;
  readonly state: ConstraintState;
}

export type Counts = Readonly<Record<string, number>>;

export interface StatusSummary {
  readonly unitStates: Counts;
  readonly ledgerVerdicts: Counts;
  readonly frontierGeneration: number;
  readonly openGateIds: readonly string[];
}

export interface StatusReport {
  readonly units: readonly Unit[];
  readonly ledger: readonly LedgerEntry[];
  readonly frontier: Frontier;
  readonly gates: readonly Gate[];
  readonly summary: StatusSummary;
  readonly changed: string;
}

export interface AddUnitParams {
  readonly id: string;
  readonly track: string;
  readonly brief?: string;
}

export interface SetUnitParams {
  readonly id: string;
  readonly state: string;
  readonly branch?: string;
  readonly pr?: number;
  readonly sha?: string;
}

export interface ListUnitsParams {
  readonly state?: string;
  readonly track?: string;
}

export interface RecordLedgerParams {
  readonly repository: string;
  readonly pr: number;
  readonly sha: string;
  readonly verdict: Verdict;
  readonly receipt: string;
}

export interface CheckLedgerParams {
  readonly repository: string;
  readonly pr: number;
  readonly sha: string;
}

export interface GateLedgerParams extends CheckLedgerParams {
  readonly allowTypeCheckOnly?: boolean;
}

export interface PushInboxParams {
  readonly agent: string;
  readonly unit: string;
  readonly status: string;
  readonly report?: string;
}

export interface ParkGateParams {
  readonly id: string;
  readonly question: string;
  readonly options: string;
  readonly defaultAnswer: string;
}

export interface ResolveGateParams {
  readonly id: string;
  readonly answer: string;
  readonly source: string;
}

export interface SetFrontierParams {
  readonly repo: string;
  readonly prs?: readonly number[];
}

export interface AddStandingParams {
  readonly id: string;
  readonly constraint: string;
  readonly provenance: ConstraintProvenance;
  readonly source: string;
  readonly scope: string;
  readonly authorityCeiling: ConstraintAuthorityCeiling;
}

export interface SupersedeStandingParams {
  readonly id: string;
  readonly by: string;
}

export interface OpenStoreOptions {
  readonly force?: boolean;
  readonly onLockStolen?: (holder: string) => void;
  readonly onStaleLock?: (holder: string) => void;
}

export interface Store {
  readonly units: {
    readonly add: (params: AddUnitParams) => Promise<Unit>;
    readonly set: (params: SetUnitParams) => Promise<Unit>;
    readonly get: (id: string) => Promise<Unit>;
    readonly list: (params?: ListUnitsParams) => Promise<readonly Unit[]>;
    readonly counts: () => Promise<Counts>;
  };
  readonly ledger: {
    readonly record: (params: RecordLedgerParams) => Promise<LedgerEntry>;
    readonly check: (params: CheckLedgerParams) => Promise<LedgerEntry>;
    readonly gate: (params: GateLedgerParams) => Promise<LedgerEntry>;
    readonly summary: () => Promise<Counts>;
  };
  readonly inbox: {
    readonly push: (params: PushInboxParams) => Promise<InboxPushResult>;
    readonly drain: () => Promise<InboxDrainResult>;
    readonly ack: (batch: string) => Promise<InboxAckResult>;
    readonly peek: () => Promise<readonly InboxPointer[]>;
    readonly count: () => Promise<number>;
  };
  readonly gates: {
    readonly park: (params: ParkGateParams) => Promise<OpenGate>;
    readonly list: () => Promise<readonly OpenGate[]>;
    readonly resolve: (params: ResolveGateParams) => Promise<ResolvedGate>;
  };
  readonly frontier: {
    readonly set: (params: SetFrontierParams) => Promise<Frontier>;
    readonly show: () => Promise<Frontier>;
  };
  readonly standing: {
    readonly show: () => Promise<readonly ConstraintRecord[]>;
    readonly add: (params: AddStandingParams) => Promise<ConstraintRecord>;
    readonly supersede: (
      params: SupersedeStandingParams
    ) => Promise<ConstraintRecord>;
  };
  readonly status: {
    readonly render: () => Promise<StatusReport>;
  };
  readonly init: () => Promise<{ readonly store: string }>;
  readonly close: () => Promise<void>;
}

export interface NotFoundOutput {
  readonly compact: string;
  readonly json: unknown;
}

export class UserError extends Error {}
export class UsageError extends UserError {}
export class NotFoundError extends UserError {
  public constructor(
    message: string,
    public readonly output?: NotFoundOutput
  ) {
    super(message);
  }
}

function errorCode(error: unknown): string | null {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return safeDiagnostic(error instanceof Error ? error.message : String(error));
}

function safeDiagnostic(value: string): string {
  return value
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/gu,
      "?"
    )
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function verdictOrNull(value: string): Verdict | null {
  switch (value) {
    case "live-ui-verified":
    case "unit-test-verified":
    case "type-check-only":
    case "verifier-blocked":
    case "verifier-failed":
      return value;
    default:
      return null;
  }
}

function frontierPrStateOrNull(value: unknown): FrontierPrState | null {
  switch (value) {
    case "OPEN":
    case "MERGED":
    case "CLOSED":
      return value;
    default:
      return null;
  }
}

export function parseVerdict(value: string): Verdict {
  const verdict = verdictOrNull(value);
  if (verdict === null) {
    throw new UserError(
      "verdict must be live-ui-verified, unit-test-verified, type-check-only, verifier-blocked, or verifier-failed"
    );
  }
  return verdict;
}

const UNSAFE_TEXT_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u;

function rejectUnsafeText(value: string, label: string): void {
  if (UNSAFE_TEXT_PATTERN.test(value)) {
    throw new UserError(
      `${label} contains unsafe control or direction characters`
    );
  }
}

function cleanCell(value: string): string {
  rejectUnsafeText(value, "value");
  const cleaned = value.replace(/[\t\n\r]/g, " ");
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

function requiredCell(value: string, label: string): string {
  rejectUnsafeText(value, label);
  const cleaned = cleanCell(value);
  if (cleaned.trim().length === 0) {
    throw new UserError(`${label} must not be empty`);
  }
  return cleaned;
}

function storedCell(
  value: string,
  label: string,
  allowEmpty = false
): string {
  rejectUnsafeText(value, label);
  if (cleanCell(value) !== value) {
    throw new UserError(`${label} is not safely encoded`);
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw new UserError(`${label} must not be empty`);
  }
  return value;
}

function requiredLine(value: string, label: string): string {
  rejectUnsafeText(value, label);
  const cleaned = value.replace(/[\n\r]/g, " ").trim();
  if (cleaned.length === 0) {
    throw new UserError(`${label} must not be empty`);
  }
  return cleaned;
}

function requiredCommitSha(value: string): string {
  const sha = requiredCell(value, "SHA");
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha)) {
    throw new UserError(
      "SHA must be a complete 40-character SHA-1 or 64-character SHA-256 commit id"
    );
  }
  return sha;
}

function repositoryIdentity(value: string): string {
  const repository = requiredLine(value, "repository").toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(
      repository
    )
  ) {
    throw new UserError(
      "repository must be a canonical host/owner/name identity"
    );
  }
  return repository;
}

function artifactKind(verdict: Verdict): VerificationArtifactKind {
  switch (verdict) {
    case "live-ui-verified":
      return "live-ui";
    case "unit-test-verified":
      return "unit-test";
    case "type-check-only":
      return "type-check";
    case "verifier-blocked":
      return "blocked";
    case "verifier-failed":
      return "failed";
  }
}

function verificationReceiptDigest(
  receipt: Omit<VerificationReceipt, "digest">
): string {
  return createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}

export function createVerificationReceipt(
  params: CreateVerificationReceiptParams
): VerificationReceipt {
  const verdict = parseVerdict(params.verdict);
  const withoutDigest: Omit<VerificationReceipt, "digest"> = {
    schema: "cstack-verification-receipt/v1",
    repository: repositoryIdentity(params.repository),
    pr: positiveInteger(params.pr, "PR"),
    headSha: requiredCommitSha(params.headSha),
    verdict,
    verifier: requiredCell(params.verifier, "verifier"),
    verifiedAt: canonicalTimestamp(params.verifiedAt, "verified time"),
    artifact: {
      kind: params.artifact.kind,
      command: requiredLine(params.artifact.command, "verification command"),
      surface: requiredLine(params.artifact.surface, "verification surface"),
      exitStatus: params.artifact.exitStatus,
      reference: resolve(
        requiredLine(params.artifact.reference, "artifact reference")
      ),
      evidenceDigest: params.artifact.evidenceDigest,
    },
  };
  if (withoutDigest.artifact.kind !== artifactKind(verdict)) {
    throw new UserError(
      `artifact kind for ${verdict} must be ${artifactKind(verdict)}`
    );
  }
  const exitStatus = withoutDigest.artifact.exitStatus;
  const validExitStatus =
    ((verdict === "live-ui-verified" ||
      verdict === "unit-test-verified" ||
      verdict === "type-check-only") &&
      exitStatus === 0) ||
    (verdict === "verifier-blocked" && exitStatus === null) ||
    (verdict === "verifier-failed" &&
      typeof exitStatus === "number" &&
      Number.isSafeInteger(exitStatus) &&
      exitStatus > 0 &&
      exitStatus <= 255);
  if (!validExitStatus) {
    throw new UserError(`receipt exit status is invalid for ${verdict}`);
  }
  if (!/^[0-9a-f]{64}$/.test(withoutDigest.artifact.evidenceDigest)) {
    throw new UserError("receipt evidence digest must be lowercase SHA-256");
  }
  return {
    ...withoutDigest,
    digest: verificationReceiptDigest(withoutDigest),
  };
}

function parseVerificationReceipt(raw: string): VerificationReceipt {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new UserError("verification receipt is not valid JSON");
  }
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 9 ||
    value.schema !== "cstack-verification-receipt/v1" ||
    typeof value.repository !== "string" ||
    typeof value.pr !== "number" ||
    typeof value.headSha !== "string" ||
    typeof value.verdict !== "string" ||
    typeof value.verifier !== "string" ||
    typeof value.verifiedAt !== "string" ||
    !isRecord(value.artifact) ||
    Object.keys(value.artifact).length !== 6 ||
    typeof value.artifact.kind !== "string" ||
    typeof value.artifact.command !== "string" ||
    typeof value.artifact.surface !== "string" ||
    !(
      value.artifact.exitStatus === null ||
      typeof value.artifact.exitStatus === "number"
    ) ||
    typeof value.artifact.reference !== "string" ||
    typeof value.artifact.evidenceDigest !== "string" ||
    typeof value.digest !== "string"
  ) {
    throw new UserError("verification receipt has an invalid shape");
  }
  const artifactKindValue = value.artifact.kind;
  if (
    artifactKindValue !== "live-ui" &&
    artifactKindValue !== "unit-test" &&
    artifactKindValue !== "type-check" &&
    artifactKindValue !== "blocked" &&
    artifactKindValue !== "failed"
  ) {
    throw new UserError("verification receipt has an invalid artifact kind");
  }
  const receipt = createVerificationReceipt({
    repository: value.repository,
    pr: value.pr,
    headSha: value.headSha,
    verdict: parseVerdict(value.verdict),
    verifier: value.verifier,
    verifiedAt: value.verifiedAt,
    artifact: {
      kind: artifactKindValue,
      command: value.artifact.command,
      surface: value.artifact.surface,
      exitStatus: value.artifact.exitStatus,
      reference: value.artifact.reference,
      evidenceDigest: value.artifact.evidenceDigest,
    },
  });
  if (!/^[0-9a-f]{64}$/.test(value.digest) || value.digest !== receipt.digest) {
    throw new UserError("verification receipt has an invalid digest");
  }
  return receipt;
}

export async function computeVerificationEvidenceDigest(
  pathValue: string,
  anchorValue?: string
): Promise<string> {
  const path =
    anchorValue === undefined
      ? resolve(requiredLine(pathValue, "artifact reference"))
      : await anchoredFilePath(anchorValue, pathValue, "artifact reference");
  if (anchorValue === undefined) {
    await assertSafeDirectory(dirname(path));
  }
  const file = await readSafeFile(path);
  if (file.contents.length === 0) {
    throw new UserError(`verification evidence ${path} must not be empty`);
  }
  return createHash("sha256").update(file.contents).digest("hex");
}

async function requiredReceipt(value: string, anchor: string): Promise<{
  readonly path: string;
  readonly receipt: VerificationReceipt;
}> {
  const path = await anchoredFilePath(anchor, value, "receipt");
  const receipt = parseVerificationReceipt(await safeReadFile(path));
  const evidenceDigest = await computeVerificationEvidenceDigest(
    receipt.artifact.reference,
    anchor
  );
  if (evidenceDigest !== receipt.artifact.evidenceDigest) {
    throw new UserError(
      `verification evidence ${receipt.artifact.reference} does not match its receipt digest`
    );
  }
  return {
    path,
    receipt,
  };
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new UserError(`${label} must be a positive integer`);
  }
  return value;
}

interface DirectoryIdentity {
  readonly device: number;
  readonly inode: number;
  readonly canonicalPath: string;
}

interface FileIdentity {
  readonly device: number;
  readonly inode: number;
}

interface SafeFile {
  readonly contents: Buffer;
  readonly identity: FileIdentity;
}

function fileIdentity(stats: Stats): FileIdentity {
  return { device: stats.dev, inode: stats.ino };
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function currentUid(): number {
  const uid = process.getuid?.();
  if (uid === undefined) {
    throw new UserError("orchestrator store requires Unix ownership checks");
  }
  return uid;
}

function assertSafeOwnershipAndMode(stats: Stats, path: string): void {
  if (stats.uid !== currentUid()) {
    throw new UserError(`${path} is not owned by the current user`);
  }
  if ((stats.mode & UNSAFE_ACCESS_BITS) !== 0) {
    throw new UserError(`${path} is accessible by another user`);
  }
}

function assertRegularFile(stats: Stats, path: string): void {
  if (!stats.isFile()) {
    throw new UserError(`${path} must be a regular file`);
  }
  if (stats.nlink !== 1) {
    throw new UserError(`${path} must have exactly one link`);
  }
  assertSafeOwnershipAndMode(stats, path);
}

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function assertSafeDirectory(
  path: string,
  expected?: DirectoryIdentity
): Promise<DirectoryIdentity> {
  const stats = await lstatOrNull(path);
  if (stats === null || !stats.isDirectory() || stats.isSymbolicLink()) {
    throw new UserError(`${path} must be a real directory`);
  }
  assertSafeOwnershipAndMode(stats, path);
  const identity: DirectoryIdentity = {
    device: stats.dev,
    inode: stats.ino,
    canonicalPath: await realpath(path),
  };
  if (identity.canonicalPath !== resolve(path)) {
    throw new UserError(`${path} contains a symbolic-link path component`);
  }
  if (
    expected !== undefined &&
    (identity.device !== expected.device ||
      identity.inode !== expected.inode ||
      identity.canonicalPath !== expected.canonicalPath)
  ) {
    throw new UserError(`${path} changed while the store was open`);
  }
  return identity;
}

function assertPathWithinAnchor(
  anchor: string,
  path: string,
  label: string
): void {
  const suffix = relative(anchor, path);
  if (
    isAbsolute(suffix) ||
    suffix === ".." ||
    suffix.startsWith("../") ||
    suffix.startsWith("..\\")
  ) {
    throw new UserError(`${label} must stay inside the orchestration store`);
  }
}

async function anchoredFilePath(
  anchorValue: string,
  pathValue: string,
  label: string
): Promise<string> {
  const anchor = await assertSafeDirectory(
    resolve(requiredLine(anchorValue, "receipt anchor"))
  );
  const requested = resolve(requiredLine(pathValue, label));
  const parent = await assertSafeDirectory(dirname(requested));
  const canonical = join(parent.canonicalPath, basename(requested));
  assertPathWithinAnchor(anchor.canonicalPath, canonical, label);
  return canonical;
}

async function assertSafeCreationDirectory(
  path: string,
  expected?: DirectoryIdentity
): Promise<DirectoryIdentity> {
  const stats = await lstatOrNull(path);
  if (stats === null || !stats.isDirectory() || stats.isSymbolicLink()) {
    throw new UserError(`${path} must be a real directory`);
  }
  if (stats.uid !== currentUid()) {
    throw new UserError(`${path} is not owned by the current user`);
  }
  if ((stats.mode & 0o022) !== 0) {
    throw new UserError(`${path} is writable by another user`);
  }
  const identity: DirectoryIdentity = {
    device: stats.dev,
    inode: stats.ino,
    canonicalPath: await realpath(path),
  };
  if (identity.canonicalPath !== resolve(path)) {
    throw new UserError(`${path} contains a symbolic-link path component`);
  }
  if (
    expected !== undefined &&
    (identity.device !== expected.device ||
      identity.inode !== expected.inode ||
      identity.canonicalPath !== expected.canonicalPath)
  ) {
    throw new UserError(`${path} changed while the store was created`);
  }
  return identity;
}

async function syncCreationDirectory(
  path: string,
  expected: DirectoryIdentity
): Promise<void> {
  await assertSafeCreationDirectory(path, expected);
  const handle = await open(
    path,
    FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW
  );
  try {
    const stats = await handle.stat();
    if (
      !stats.isDirectory() ||
      stats.uid !== currentUid() ||
      (stats.mode & 0o022) !== 0 ||
      stats.dev !== expected.device ||
      stats.ino !== expected.inode
    ) {
      throw new UserError(`${path} changed before directory sync`);
    }
    try {
      await handle.sync();
    } catch (error) {
      if (errorCode(error) !== "EINVAL" && errorCode(error) !== "ENOTSUP") {
        throw error;
      }
    }
  } finally {
    await handle.close();
  }
  await assertSafeCreationDirectory(path, expected);
}

async function syncDirectory(
  path: string,
  expected: DirectoryIdentity
): Promise<void> {
  await assertSafeDirectory(path, expected);
  const handle = await open(
    path,
    FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW
  );
  try {
    const stats = await handle.stat();
    if (!stats.isDirectory()) {
      throw new UserError(`${path} changed before directory sync`);
    }
    assertSafeOwnershipAndMode(stats, path);
    if (
      stats.dev !== expected.device ||
      stats.ino !== expected.inode
    ) {
      throw new UserError(`${path} changed before directory sync`);
    }
    try {
      await handle.sync();
    } catch (error) {
      if (errorCode(error) !== "EINVAL" && errorCode(error) !== "ENOTSUP") {
        throw error;
      }
    }
  } finally {
    await handle.close();
  }
  await assertSafeDirectory(path, expected);
}

async function createSafeDirectoryTree(path: string): Promise<DirectoryIdentity> {
  const target = resolve(path);
  const missing: string[] = [];
  let ancestor = target;
  while ((await lstatOrNull(ancestor)) === null) {
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      throw new UserError(`cannot find an existing ancestor for ${target}`);
    }
    missing.unshift(basename(ancestor));
    ancestor = parent;
  }
  const ancestorStats = await lstat(ancestor);
  if (!ancestorStats.isDirectory() || ancestorStats.isSymbolicLink()) {
    throw new UserError(`${ancestor} must be a real directory`);
  }
  if (ancestorStats.uid !== currentUid()) {
    throw new UserError(`${ancestor} is not owned by the current user`);
  }
  if ((ancestorStats.mode & 0o022) !== 0) {
    throw new UserError(`${ancestor} is writable by another user`);
  }
  if ((await realpath(ancestor)) !== resolve(ancestor)) {
    throw new UserError(`${ancestor} contains a symbolic-link path component`);
  }

  let current = ancestor;
  let currentIdentity = await assertSafeCreationDirectory(current);
  let currentIsPrivate = false;
  for (const component of missing) {
    if (currentIsPrivate) {
      await assertSafeDirectory(current, currentIdentity);
    } else {
      await assertSafeCreationDirectory(current, currentIdentity);
    }
    const parentIdentity = currentIdentity;
    current = join(current, component);
    await mkdir(current, { mode: SAFE_DIRECTORY_MODE });
    if (currentIsPrivate) {
      await syncDirectory(dirname(current), parentIdentity);
      await assertSafeDirectory(dirname(current), parentIdentity);
    } else {
      await syncCreationDirectory(dirname(current), parentIdentity);
      await assertSafeCreationDirectory(dirname(current), parentIdentity);
    }
    currentIdentity = await assertSafeDirectory(current);
    currentIsPrivate = true;
  }
  return currentIsPrivate
    ? assertSafeDirectory(target, currentIdentity)
    : assertSafeDirectory(target);
}

async function ensureSafeDirectory(
  path: string,
  parent?: DirectoryIdentity
): Promise<DirectoryIdentity> {
  if (parent !== undefined) {
    await assertSafeDirectory(dirname(path), parent);
  }
  const existing = await lstatOrNull(path);
  if (existing === null) {
    await mkdir(path, { mode: SAFE_DIRECTORY_MODE });
    if (parent !== undefined) {
      await syncDirectory(dirname(path), parent);
    }
  }
  const identity = await assertSafeDirectory(path);
  if (parent !== undefined) {
    await assertSafeDirectory(dirname(path), parent);
  }
  return identity;
}

async function readSafeFile(
  path: string,
  maxBytes: number = MAX_STORE_FILE_BYTES
): Promise<SafeFile> {
  let canonicalPath: string;
  try {
    canonicalPath = await realpath(path);
  } catch (error) {
    if (errorCode(error) === "ELOOP") {
      throw new UserError(`${path} must not contain symbolic links`);
    }
    throw error;
  }
  if (canonicalPath !== resolve(path)) {
    throw new UserError(`${path} contains a symbolic-link path component`);
  }
  let handle;
  try {
    handle = await open(
      path,
      FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW
    );
  } catch (error) {
    if (errorCode(error) === "ELOOP") {
      throw new UserError(`${path} must not be a symbolic link`);
    }
    throw error;
  }
  try {
    const stats = await handle.stat();
    assertRegularFile(stats, path);
    if (stats.size > maxBytes) {
      throw new UserError(`${path} exceeds the ${maxBytes}-byte limit`);
    }
    const identity = fileIdentity(stats);
    const contents = await handle.readFile();
    const afterRead = await handle.stat();
    assertRegularFile(afterRead, path);
    if (
      !sameFileIdentity(fileIdentity(afterRead), identity) ||
      afterRead.size !== stats.size ||
      contents.length !== stats.size ||
      contents.length > maxBytes
    ) {
      throw new UserError(`${path} changed size while it was read`);
    }
    const current = await lstatOrNull(path);
    if (
      current === null ||
      !current.isFile() ||
      current.isSymbolicLink() ||
      !sameFileIdentity(fileIdentity(current), identity)
    ) {
      throw new UserError(`${path} changed while it was read`);
    }
    assertRegularFile(current, path);
    return { contents, identity };
  } finally {
    await handle.close();
  }
}

async function safeReadFile(
  path: string,
  maxBytes: number = MAX_STORE_FILE_BYTES
): Promise<string> {
  return (await readSafeFile(path, maxBytes)).contents.toString("utf8");
}

async function assertSafeFileIfPresent(path: string): Promise<boolean> {
  const stats = await lstatOrNull(path);
  if (stats === null) {
    return false;
  }
  assertRegularFile(stats, path);
  return true;
}

async function safeUnlink(
  path: string,
  parent: DirectoryIdentity,
  expected?: FileIdentity
): Promise<void> {
  await assertSafeDirectory(dirname(path), parent);
  const stats = await lstatOrNull(path);
  if (stats === null) {
    return;
  }
  assertRegularFile(stats, path);
  if (
    expected !== undefined &&
    !sameFileIdentity(fileIdentity(stats), expected)
  ) {
    throw new UserError(`${path} changed before deletion`);
  }
  await assertSafeDirectory(dirname(path), parent);
  await unlink(path);
  await syncDirectory(dirname(path), parent);
}


function assertContentSize(
  contents: string,
  maxBytes: number,
  label: string
): void {
  const size = Buffer.byteLength(contents, "utf8");
  if (size > maxBytes) {
    throw new UserError(`${label} exceeds the ${maxBytes}-byte limit`);
  }
}

async function atomicWrite(
  path: string,
  contents: string,
  parent: DirectoryIdentity,
  maxBytes: number = MAX_STORE_FILE_BYTES
): Promise<void> {
  assertContentSize(contents, maxBytes, path);
  await assertSafeDirectory(dirname(path), parent);
  await assertSafeFileIfPresent(path);
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`
  );
  let created = false;
  let temporaryIdentity: FileIdentity | undefined;
  try {
    const handle = await open(
      temporary,
      FS_CONSTANTS.O_WRONLY |
        FS_CONSTANTS.O_CREAT |
        FS_CONSTANTS.O_EXCL |
        FS_CONSTANTS.O_NOFOLLOW,
      SAFE_FILE_MODE
    );
    created = true;
    try {
      const stats = await handle.stat();
      assertRegularFile(stats, temporary);
      temporaryIdentity = fileIdentity(stats);
      await handle.writeFile(contents, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await assertSafeDirectory(dirname(path), parent);
    await assertSafeFileIfPresent(path);
    await rename(temporary, path);
    created = false;
    await syncDirectory(dirname(path), parent);
  } finally {
    if (created) {
      await safeUnlink(temporary, parent, temporaryIdentity);
    }
  }
}

export async function writeVerificationReceipt(
  params: WriteVerificationReceiptParams
): Promise<{ readonly path: string; readonly receipt: VerificationReceipt }> {
  const output = await anchoredFilePath(
    params.anchor,
    params.output,
    "receipt output"
  );
  const evidence = await anchoredFilePath(
    params.anchor,
    params.evidence,
    "verification evidence"
  );
  const evidenceDigest = await computeVerificationEvidenceDigest(
    evidence,
    params.anchor
  );
  const receipt = createVerificationReceipt({
    repository: params.repository,
    pr: params.pr,
    headSha: params.headSha,
    verdict: params.verdict,
    verifier: params.verifier,
    verifiedAt: params.verifiedAt ?? new Date().toISOString(),
    artifact: {
      kind: artifactKind(params.verdict),
      command: params.command,
      surface: params.surface,
      exitStatus: params.exitStatus,
      reference: evidence,
      evidenceDigest,
    },
  });
  const parentPath = dirname(output);
  const parent = await assertSafeDirectory(parentPath);
  if ((await lstatOrNull(output)) !== null) {
    throw new UserError(`verification receipt already exists at ${output}`);
  }
  let created = false;
  let identity: FileIdentity | undefined;
  try {
    const handle = await open(
      output,
      FS_CONSTANTS.O_WRONLY |
        FS_CONSTANTS.O_CREAT |
        FS_CONSTANTS.O_EXCL |
        FS_CONSTANTS.O_NOFOLLOW,
      SAFE_RECEIPT_MODE
    );
    created = true;
    try {
      const stats = await handle.stat();
      assertRegularFile(stats, output);
      identity = fileIdentity(stats);
      const contents = `${JSON.stringify(receipt, null, 2)}\n`;
      assertContentSize(contents, MAX_STORE_FILE_BYTES, output);
      await handle.writeFile(contents, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(parentPath, parent);
    created = false;
    return { path: output, receipt };
  } finally {
    if (created) {
      await safeUnlink(output, parent, identity);
    }
  }
}

async function writeIfMissing(
  path: string,
  contents: string,
  parent: DirectoryIdentity
): Promise<void> {
  if (!(await assertSafeFileIfPresent(path))) {
    await atomicWrite(path, contents, parent);
  }
}

async function requiredFile(path: string): Promise<string> {
  try {
    return await safeReadFile(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new UserError(
        `store is not initialized at ${dirname(path)}; run orch init`
      );
    }
    throw error;
  }
}

function parseLockHolder(raw: string): string {
  const holder = raw.trim();
  if (!/^[1-9]\d{0,9}$/.test(holder)) {
    throw new UserError("store lock contains an invalid PID");
  }
  const pid = Number(holder);
  if (!Number.isSafeInteger(pid) || pid > MAX_PID) {
    throw new UserError("store lock contains an invalid PID");
  }
  return holder;
}

async function readLock(path: string): Promise<{
  readonly holder: string;
  readonly identity: FileIdentity;
}> {
  const file = await readSafeFile(path, MAX_LOCK_BYTES);
  return {
    holder: parseLockHolder(file.contents.toString("utf8")),
    identity: file.identity,
  };
}

function holderIsDead(holder: string): boolean {
  const pid = Number(holder);
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return errorCode(error) === "ESRCH";
  }
}

async function acquireLock(
  store: string,
  storeIdentity: DirectoryIdentity,
  options: OpenStoreOptions
): Promise<() => Promise<void>> {
  const path = join(store, LOCK_FILE);
  const reclaimPath = join(store, LOCK_RECLAIM_FILE);
  const pid = String(process.pid);
  let ownedLock: FileIdentity | null = null;

  const createFile = async (
    target: string,
    contents: string
  ): Promise<FileIdentity> => {
    await assertSafeDirectory(store, storeIdentity);
    let identity: FileIdentity | null = null;
    try {
      const handle = await open(
        target,
        FS_CONSTANTS.O_WRONLY |
          FS_CONSTANTS.O_CREAT |
          FS_CONSTANTS.O_EXCL |
          FS_CONSTANTS.O_NOFOLLOW,
        SAFE_FILE_MODE
      );
      try {
        const stats = await handle.stat();
        assertRegularFile(stats, target);
        identity = fileIdentity(stats);
        await handle.writeFile(contents, { encoding: "utf8" });
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncDirectory(store, storeIdentity);
      return identity;
    } catch (error) {
      if (identity !== null) {
        try {
          await safeUnlink(target, storeIdentity, identity);
        } catch (cleanupError) {
          throw new UserError(
            `failed to create ${target} and could not remove the partial file: ${errorMessage(cleanupError)}`
          );
        }
      }
      throw error;
    }
  };

  const create = async (ownsReclaim: boolean): Promise<FileIdentity> => {
    const requireNoReclaim = async (): Promise<void> => {
      try {
        const reclaim = await readLock(reclaimPath);
        if (holderIsDead(reclaim.holder)) {
          throw new UserError(
            `store lock recovery marker ${reclaimPath} belongs to dead pid ${reclaim.holder}; after confirming no orchestrator process is active for this store, remove that exact marker and retry`
          );
        }
        throw new UserError(
          `store lock recovery is already in progress by pid ${reclaim.holder}`
        );
      } catch (error) {
        if (errorCode(error) === "ENOENT") {
          return;
        }
        throw error;
      }
    };
    if (!ownsReclaim) {
      await requireNoReclaim();
    }
    const identity = await createFile(path, `${pid}\n`);
    try {
      if (!ownsReclaim) {
        await requireNoReclaim();
      }
    } catch (reclaimError) {
      try {
        await safeUnlink(path, storeIdentity, identity);
      } catch (rollbackError) {
        throw new UserError(
          `store lock recovery raced acquisition and rollback failed: ${errorMessage(rollbackError)}`
        );
      }
      throw new UserError(
        `store lock recovery raced acquisition: ${errorMessage(reclaimError)}`
      );
    }
    return identity;
  };

  try {
    ownedLock = await create(false);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") {
      throw error;
    }
    const observed = await readLock(path);
    if (!holderIsDead(observed.holder)) {
      const suffix = options.force
        ? "; --force cannot override a live writer without fencing"
        : "";
      throw new UserError(
        `store lock held by pid ${observed.holder}${suffix}`
      );
    }

    let reclaimIdentity: FileIdentity | null = null;
    try {
      reclaimIdentity = await createFile(
        reclaimPath,
        `${pid}\n`
      );
      const current = await readLock(path);
      if (
        current.holder !== observed.holder ||
        !sameFileIdentity(current.identity, observed.identity)
      ) {
        throw new UserError("store lock changed during stale-lock recovery");
      }
      if (!holderIsDead(current.holder)) {
        throw new UserError(
          `store lock holder pid ${current.holder} became live during recovery`
        );
      }
      await safeUnlink(path, storeIdentity, current.identity);
      ownedLock = await create(true);
      options.onStaleLock?.(current.holder);
    } finally {
      if (reclaimIdentity !== null) {
        await safeUnlink(reclaimPath, storeIdentity, reclaimIdentity);
      }
    }
  }

  return async (): Promise<void> => {
    const expected = ownedLock;
    ownedLock = null;
    if (expected === null) {
      return;
    }
    try {
      const current = await readLock(path);
      if (
        current.holder === pid &&
        sameFileIdentity(current.identity, expected)
      ) {
        await safeUnlink(path, storeIdentity, expected);
      }
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }
    }
  };
}

async function readTsv(
  path: string,
  header: string,
  width: number
): Promise<readonly (readonly string[])[]> {
  const lines = (await requiredFile(path)).replace(/\r/g, "").split("\n");
  if (lines.shift() !== header) {
    throw new UserError(`${basename(path)} has an invalid header`);
  }
  return lines
    .filter((value) => value.length > 0)
    .map((value) => {
      const cells = value.split("\t");
      if (cells.length !== width) {
        throw new UserError(`${basename(path)} has a malformed row`);
      }
      return cells;
    });
}

async function writeTsv(
  path: string,
  header: string,
  rows: readonly (readonly string[])[],
  parent: DirectoryIdentity
): Promise<void> {
  const body = rows.map((row) => row.map(cleanCell).join("\t")).join("\n");
  await atomicWrite(
    path,
    `${header}\n${body}${body.length > 0 ? "\n" : ""}`,
    parent
  );
}

async function readUnits(store: string): Promise<readonly Unit[]> {
  return (await readTsv(join(store, "units.tsv"), UNIT_HEADER, 7)).map(
    (row) => {
      const pr = storedCell(row[4] ?? "", "stored unit PR", true);
      const sha = storedCell(row[5] ?? "", "stored unit SHA", true);
      if (pr.length > 0) {
        if (!/^[1-9]\d*$/.test(pr)) {
          throw new UserError("stored unit PR is not canonical");
        }
        positiveInteger(Number(pr), "stored unit PR");
      }
      if (sha.length > 0) {
        requiredCommitSha(sha);
      }
      return {
        id: storedCell(row[0] ?? "", "stored unit id"),
        track: storedCell(row[1] ?? "", "stored unit track"),
        state: storedCell(row[2] ?? "", "stored unit state"),
        branch: storedCell(row[3] ?? "", "stored unit branch", true),
        pr,
        sha,
        brief: storedCell(row[6] ?? "", "stored unit brief", true),
      };
    }
  );
}

function unitCells(unit: Unit): readonly string[] {
  return [
    unit.id,
    unit.track,
    unit.state,
    unit.branch,
    unit.pr,
    unit.sha,
    unit.brief,
  ];
}

async function saveUnits(
  store: string,
  rows: readonly Unit[],
  storeIdentity: DirectoryIdentity
): Promise<void> {
  await writeTsv(
    join(store, "units.tsv"),
    UNIT_HEADER,
    rows.map(unitCells),
    storeIdentity
  );
}

async function readLedger(store: string): Promise<readonly LedgerEntry[]> {
  return (await readTsv(join(store, "ledger.tsv"), LEDGER_HEADER, 8)).map(
    (row) => {
      const rawVerdict = row[3] ?? "";
      const rawPr = row[1] ?? "";
      const verdict = verdictOrNull(rawVerdict);
      if (verdict === null) {
        throw new UserError(`ledger.tsv has invalid verdict ${rawVerdict}`);
      }
      if (!/^[1-9]\d*$/.test(rawPr)) {
        throw new UserError(`ledger.tsv has invalid PR ${rawPr}`);
      }
      const receiptDigest = requiredCell(
        row[5] ?? "",
        "receipt digest"
      );
      if (!/^[0-9a-f]{64}$/.test(receiptDigest)) {
        throw new UserError("ledger.tsv has an invalid receipt digest");
      }
      return {
        repository: repositoryIdentity(row[0] ?? ""),
        pr: String(positiveInteger(Number(rawPr), "PR")),
        sha: requiredCommitSha(row[2] ?? ""),
        verdict,
        receipt: resolve(requiredLine(row[4] ?? "", "receipt")),
        receiptDigest,
        verifier: requiredCell(row[6] ?? "", "verifier"),
        ts: canonicalTimestamp(row[7] ?? "", "ledger timestamp"),
      };
    }
  );
}

function ledgerCells(row: LedgerEntry): readonly string[] {
  return [
    row.repository,
    row.pr,
    row.sha,
    row.verdict,
    row.receipt,
    row.receiptDigest,
    row.verifier,
    row.ts,
  ];
}

async function saveLedger(
  store: string,
  rows: readonly LedgerEntry[],
  storeIdentity: DirectoryIdentity
): Promise<void> {
  await writeTsv(
    join(store, "ledger.tsv"),
    LEDGER_HEADER,
    rows.map(ledgerCells),
    storeIdentity
  );
}

function pointerCells(pointer: InboxPointer): readonly string[] {
  return [
    pointer.ts,
    pointer.agent,
    pointer.unit,
    pointer.status,
    pointer.report,
  ];
}

interface PointerFile {
  readonly name: string;
  readonly bytes: number;
  readonly identity: FileIdentity;
}

async function pointerFiles(
  directory: string,
  expected: DirectoryIdentity | undefined,
  limits: { readonly entries: number; readonly bytes: number }
): Promise<readonly PointerFile[]> {
  const directoryIdentity = await assertSafeDirectory(directory, expected);
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new UserError(
        `store is not initialized at ${dirname(directory)}; run orch init`
      );
    }
    throw error;
  }
  if (entries.length > limits.entries) {
    throw new UserError(
      `inbox exceeds the ${limits.entries}-entry directory limit`
    );
  }
  let totalBytes = 0;
  const files: PointerFile[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".tsv")) {
      throw new UserError(`inbox contains unsafe entry ${entry.name}`);
    }
    const path = join(directory, entry.name);
    const stats = await lstat(path);
    assertRegularFile(stats, path);
    if (stats.nlink !== 1) {
      throw new UserError(`inbox pointer ${entry.name} must have one link`);
    }
    if (stats.size > MAX_INBOX_POINTER_BYTES) {
      throw new UserError(
        `inbox pointer ${entry.name} exceeds the ${MAX_INBOX_POINTER_BYTES}-byte limit`
      );
    }
    totalBytes += stats.size;
    if (totalBytes > limits.bytes) {
      throw new UserError(
        `inbox exceeds the ${limits.bytes}-byte aggregate limit`
      );
    }
    files.push({
      name: entry.name,
      bytes: stats.size,
      identity: fileIdentity(stats),
    });
  }
  await assertSafeDirectory(directory, directoryIdentity);
  return files;
}

async function readPointers(
  directory: string,
  expected?: DirectoryIdentity,
  limits = {
    entries: MAX_INBOX_BATCH_ENTRIES,
    bytes: MAX_INBOX_BATCH_BYTES,
  }
): Promise<readonly InboxPointer[]> {
  const directoryIdentity = await assertSafeDirectory(directory, expected);
  const result: InboxPointer[] = [];
  const files = await pointerFiles(directory, directoryIdentity, limits);
  for (const entry of files) {
    const raw = (
      await safeReadFile(
        join(directory, entry.name),
        MAX_INBOX_POINTER_BYTES
      )
    ).replace(/\r?\n$/, "");
    const row = raw.split("\t");
    if (/[\r\n]/.test(raw) || row.length !== 5) {
      throw new UserError(`inbox pointer ${entry.name} is malformed`);
    }
    result.push({
      ts: canonicalTimestamp(row[0] ?? "", "inbox timestamp"),
      agent: storedCell(row[1] ?? "", "inbox agent"),
      unit: storedCell(row[2] ?? "", "inbox unit"),
      status: storedCell(row[3] ?? "", "inbox status"),
      report: storedCell(row[4] ?? "", "inbox report", true),
    });
  }
  await assertSafeDirectory(directory, directoryIdentity);
  return result;
}

async function pendingBatches(
  directory: string,
  expected?: DirectoryIdentity
): Promise<readonly string[]> {
  const directoryIdentity = await assertSafeDirectory(directory, expected);
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length > MAX_PENDING_BATCHES) {
    throw new UserError(
      `pending inbox exceeds the ${MAX_PENDING_BATCHES}-batch limit`
    );
  }
  const batches: string[] = [];
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !BATCH_PATTERN.test(entry.name)
    ) {
      throw new UserError(`pending inbox contains unsafe entry ${entry.name}`);
    }
    await assertSafeDirectory(join(directory, entry.name));
    batches.push(entry.name);
  }
  await assertSafeDirectory(directory, directoryIdentity);
  return batches.sort();
}

async function removePointerDirectory({
  directory,
  directoryIdentity,
  parent,
}: {
  directory: string;
  directoryIdentity: DirectoryIdentity;
  parent: DirectoryIdentity;
}): Promise<number> {
  const entries = await pointerFiles(directory, directoryIdentity, {
    entries: MAX_INBOX_BATCH_ENTRIES,
    bytes: MAX_INBOX_BATCH_BYTES,
  });
  let count = 0;
  for (const entry of entries) {
    await safeUnlink(join(directory, entry.name), directoryIdentity);
    count += 1;
  }
  await assertSafeDirectory(directory, directoryIdentity);
  await assertSafeDirectory(dirname(directory), parent);
  await rmdir(directory);
  await syncDirectory(dirname(directory), parent);
  return count;
}

function canonicalGateOptions(value: string): string {
  const raw = requiredLine(value, "gate options");
  const options = raw.split(",").map((option) => option.trim());
  if (options.length < 2 || options.length > MAX_GATE_OPTIONS) {
    throw new UserError(
      `gate options must contain 2 to ${MAX_GATE_OPTIONS} comma-separated tokens`
    );
  }
  if (
    options.some(
      (option) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(option)
    )
  ) {
    throw new UserError(
      "gate options must be simple 1-to-64-character tokens"
    );
  }
  if (new Set(options).size !== options.length) {
    throw new UserError("gate options must not contain duplicates");
  }
  return options.join(",");
}

function gateAnswer(optionsValue: string, answerValue: string): string {
  const options = canonicalGateOptions(optionsValue).split(",");
  const answer = requiredLine(answerValue, "gate answer");
  if (!options.includes(answer)) {
    throw new UserError("gate answer must be one of the declared options");
  }
  return answer;
}

function gateResolutionSource(value: string): string {
  const source = requiredLine(value, "gate resolution source");
  if (!/^user:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(source)) {
    throw new UserError(
      "gate resolution source must be a user: pointer recorded by the coordinator"
    );
  }
  return source;
}

function renderGates(rows: readonly Gate[]): string {
  if (rows.length === 0) {
    return "";
  }
  const blocks = rows.map((gate) => {
    const answer =
      gate.kind === "resolved"
        ? `\n- Answer: ${markdown(gate.answer)}\n- Resolved-by: ${markdown(gate.resolvedBy)}`
        : "";
    return `## ${markdown(gate.id)}

- Status: ${gate.kind}
- Question: ${markdown(gate.question)}
- Options: ${markdown(gate.options)}
- Default: ${markdown(gate.defaultAnswer)}${answer}`;
  });
  return `# Gates\n\n${blocks.join("\n\n")}\n`;
}

async function readGates(store: string): Promise<readonly Gate[]> {
  const raw = (await requiredFile(join(store, "gates.md")))
    .replace(/\r/g, "")
    .trim();
  if (raw.length === 0) {
    return [];
  }
  const prefix = "# Gates\n\n## ";
  if (!raw.startsWith(prefix)) {
    throw new UserError("gates.md has an invalid heading");
  }
  const result: Gate[] = [];
  for (const block of raw.slice(prefix.length).split("\n\n## ")) {
    const lines = block.split("\n").filter((value) => value.length > 0);
    const id = requiredLine(
      unmarkdown(lines.shift() ?? ""),
      "stored gate id"
    );
    const fields = new Map<string, string>();
    for (const value of lines) {
      const match = /^- ([^:]+): (.*)$/.exec(value);
      if (match === null) {
        throw new UserError(`gates.md has a malformed gate ${id}`);
      }
      const field = requiredLine(match[1] ?? "", "stored gate field");
      if (fields.has(field)) {
        throw new UserError(`gates.md has duplicate field ${field} for gate ${id}`);
      }
      fields.set(
        field,
        requiredLine(unmarkdown(match[2] ?? ""), "stored gate value")
      );
    }
    const status = fields.get("Status");
    const question = fields.get("Question");
    const options = fields.get("Options");
    const defaultAnswer = fields.get("Default");
    if (question === undefined || options === undefined || defaultAnswer === undefined) {
      throw new UserError(`gates.md has a malformed gate ${id}`);
    }
    const canonicalOptions = canonicalGateOptions(options);
    if (canonicalOptions !== options) {
      throw new UserError(`gates.md gate ${id} has non-canonical options`);
    }
    const canonicalDefault = gateAnswer(canonicalOptions, defaultAnswer);
    if (status === "open") {
      const allowed = new Set(["Status", "Question", "Options", "Default"]);
      const unknown = [...fields.keys()].filter((field) => !allowed.has(field));
      if (fields.size !== allowed.size || unknown.length > 0) {
        throw new UserError(
          `gates.md open gate ${id} has invalid fields${
            unknown.length > 0 ? `: ${unknown.join(",")}` : ""
          }`
        );
      }
      result.push({
        kind: "open",
        id,
        question,
        options: canonicalOptions,
        defaultAnswer: canonicalDefault,
      });
    } else if (status === "resolved") {
      const allowed = new Set([
        "Status",
        "Question",
        "Options",
        "Default",
        "Answer",
        "Resolved-by",
      ]);
      const unknown = [...fields.keys()].filter((field) => !allowed.has(field));
      if (
        fields.size !== allowed.size ||
        !fields.has("Answer") ||
        !fields.has("Resolved-by") ||
        unknown.length > 0
      ) {
        throw new UserError(
          `gates.md resolved gate ${id} has invalid fields${
            unknown.length > 0 ? `: ${unknown.join(",")}` : ""
          }`
        );
      }
      result.push({
        kind: "resolved",
        id,
        question,
        options: canonicalOptions,
        defaultAnswer: canonicalDefault,
        answer: gateAnswer(canonicalOptions, fields.get("Answer") ?? ""),
        resolvedBy: gateResolutionSource(fields.get("Resolved-by") ?? ""),
      });
    } else {
      throw new UserError(`gates.md has invalid status ${status ?? ""}`);
    }
  }
  if (new Set(result.map((gate) => gate.id)).size !== result.length) {
    throw new UserError("gates.md has duplicate gate ids");
  }
  return result;
}

function parseFrontier(raw: string): Frontier {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new UserError("frontier.json is not valid JSON");
  }
  if (!isRecord(value)) {
    throw new UserError("frontier.json must contain an object");
  }
  if (Object.keys(value).length === 0) {
    return { generation: 0, prs: [], lowestUnmerged: null };
  }
  if (
    Object.keys(value).length !== 3 ||
    typeof value.generation !== "number" ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    !isUnknownArray(value.prs) ||
    !(
      value.lowestUnmerged === null ||
      (typeof value.lowestUnmerged === "number" &&
        Number.isSafeInteger(value.lowestUnmerged) &&
        value.lowestUnmerged > 0)
    )
  ) {
    throw new UserError("frontier.json has an invalid shape");
  }
  const prs: FrontierPr[] = [];
  for (const row of value.prs) {
    const state = isRecord(row)
      ? frontierPrStateOrNull(row.state)
      : null;
    if (
      !isRecord(row) ||
      Object.keys(row).length !== 4 ||
      typeof row.pr !== "number" ||
      !Number.isSafeInteger(row.pr) ||
      row.pr < 1 ||
      typeof row.branches !== "string" ||
      row.branches.length === 0 ||
      typeof row.sha !== "string" ||
      state === null
    ) {
      throw new UserError("frontier.json has an invalid PR row");
    }
    const branches = requiredLine(row.branches, "frontier branch");
    if (branches !== row.branches) {
      throw new UserError("frontier.json has a noncanonical branch");
    }
    prs.push({
      pr: row.pr,
      branches,
      sha: requiredCommitSha(row.sha),
      state,
    });
  }
  if (
    new Set(prs.map((row) => row.pr)).size !== prs.length ||
    new Set(prs.map((row) => row.branches)).size !== prs.length
  ) {
    throw new UserError("frontier.json has duplicate PRs or branches");
  }
  const expectedLowest = prs.find((row) => row.state === "OPEN")?.pr ?? null;
  if (value.lowestUnmerged !== expectedLowest) {
    throw new UserError(
      "frontier.json lowestUnmerged does not match the first open PR"
    );
  }
  return {
    generation: value.generation,
    prs,
    lowestUnmerged: value.lowestUnmerged,
  };
}

async function readFrontier(store: string): Promise<Frontier> {
  return parseFrontier(await requiredFile(join(store, "frontier.json")));
}

const CONSTRAINT_SCHEMA = "cstack-constraint-register/v1";

function constraintId(value: string): string {
  const id = requiredLine(value, "constraint id");
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
    throw new UserError(
      "constraint id must contain only lowercase letters, digits, dot, underscore, or hyphen"
    );
  }
  return id;
}

function normalizedConstraint(value: string, label: string): string {
  const normalized = requiredLine(value, label).replace(/\s+/g, " ");
  if (normalized !== value) {
    throw new UserError(`${label} must already be normalized single-line text`);
  }
  return normalized;
}

export function parseConstraintProvenance(
  value: string
): ConstraintProvenance {
  switch (value) {
    case "direct-user":
    case "repository-policy":
    case "coordinator-safety":
      return value;
    default:
      throw new UserError(
        "provenance must be direct-user, repository-policy, or coordinator-safety"
      );
  }
}

export function parseConstraintAuthorityCeiling(
  value: string
): ConstraintAuthorityCeiling {
  switch (value) {
    case "advisory":
    case "read-only":
    case "local-write":
      return value;
    default:
      throw new UserError(
        "authority ceiling must be advisory, read-only, or local-write"
      );
  }
}

const AUTHORITY_CEILING_RANK: Readonly<
  Record<ConstraintAuthorityCeiling, number>
> = {
  advisory: 0,
  "read-only": 1,
  "local-write": 2,
};

function assertSafeSupersession(
  current: ConstraintRecord,
  replacement: ConstraintRecord
): void {
  if (current.provenance !== replacement.provenance) {
    throw new UserError(
      "a constraint may be superseded only by the same provenance class"
    );
  }
  if (current.scope !== replacement.scope) {
    throw new UserError(
      "a constraint may be superseded only within the identical scope"
    );
  }
  if (
    AUTHORITY_CEILING_RANK[replacement.authorityCeiling] >
    AUTHORITY_CEILING_RANK[current.authorityCeiling]
  ) {
    throw new UserError(
      "a superseding constraint must not broaden the authority ceiling"
    );
  }
}

function validatedSource(
  value: string,
  provenance: ConstraintProvenance
): string {
  const source = requiredLine(value, "source");
  const prefix = {
    "direct-user": "user:",
    "repository-policy": "repo:",
    "coordinator-safety": "cstack:",
  }[provenance];
  if (!source.startsWith(prefix) || source.length === prefix.length) {
    throw new UserError(
      `${provenance} source must be a ${prefix} provenance pointer`
    );
  }
  return source;
}

function canonicalTimestamp(value: string, label: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new UserError(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function constraintDigest(
  record: Omit<ConstraintRecord, "digest">
): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

function withConstraintDigest(
  record: Omit<ConstraintRecord, "digest">
): ConstraintRecord {
  return { ...record, digest: constraintDigest(record) };
}

function parseConstraintState(value: unknown): ConstraintState {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new UserError("preferences.md has an invalid supersession state");
  }
  if (value.kind === "active" && Object.keys(value).length === 1) {
    return { kind: "active" };
  }
  if (
    value.kind === "superseded" &&
    Object.keys(value).length === 3 &&
    typeof value.by === "string" &&
    typeof value.at === "string"
  ) {
    return {
      kind: "superseded",
      by: constraintId(value.by),
      at: canonicalTimestamp(value.at, "superseded time"),
    };
  }
  throw new UserError("preferences.md has an invalid supersession state");
}

function parseConstraintRecord(value: unknown): ConstraintRecord {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 9 ||
    typeof value.id !== "string" ||
    typeof value.constraint !== "string" ||
    typeof value.provenance !== "string" ||
    typeof value.source !== "string" ||
    typeof value.scope !== "string" ||
    typeof value.authorityCeiling !== "string" ||
    typeof value.capturedAt !== "string" ||
    typeof value.digest !== "string"
  ) {
    throw new UserError("preferences.md has an invalid constraint record");
  }
  const provenance = parseConstraintProvenance(value.provenance);
  const withoutDigest: Omit<ConstraintRecord, "digest"> = {
    id: constraintId(value.id),
    constraint: normalizedConstraint(value.constraint, "constraint"),
    provenance,
    source: validatedSource(value.source, provenance),
    scope: normalizedConstraint(value.scope, "scope"),
    authorityCeiling: parseConstraintAuthorityCeiling(
      value.authorityCeiling
    ),
    capturedAt: canonicalTimestamp(value.capturedAt, "captured time"),
    state: parseConstraintState(value.state),
  };
  const digest = constraintDigest(withoutDigest);
  if (!/^[0-9a-f]{64}$/.test(value.digest) || value.digest !== digest) {
    throw new UserError(
      `preferences.md constraint ${withoutDigest.id} has an invalid digest`
    );
  }
  return { ...withoutDigest, digest };
}

function renderStanding(rows: readonly ConstraintRecord[]): string {
  return `${JSON.stringify(
    { schema: CONSTRAINT_SCHEMA, records: rows },
    null,
    2
  )}\n`;
}

async function readStanding(
  store: string
): Promise<readonly ConstraintRecord[]> {
  const raw = await requiredFile(join(store, "preferences.md"));
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new UserError(
      "preferences.md contains legacy or freeform content; replace it with the structured constraint register"
    );
  }
  if (
    !isRecord(value) ||
    value.schema !== CONSTRAINT_SCHEMA ||
    !isUnknownArray(value.records) ||
    Object.keys(value).length !== 2
  ) {
    throw new UserError("preferences.md has an invalid constraint register");
  }
  const rows = value.records.map(parseConstraintRecord);
  const ids = new Set(rows.map((row) => row.id));
  if (ids.size !== rows.length) {
    throw new UserError("preferences.md has duplicate constraint ids");
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    if (row.state.kind === "superseded") {
      const replacement = byId.get(row.state.by);
      if (replacement === undefined || replacement.id === row.id) {
        throw new UserError(
          `preferences.md constraint ${row.id} has an invalid superseding id`
        );
      }
      assertSafeSupersession(row, replacement);

      const seen = new Set([row.id]);
      let cursor: ConstraintRecord = replacement;
      while (cursor.state.kind === "superseded") {
        if (seen.has(cursor.id)) {
          throw new UserError("preferences.md has a supersession cycle");
        }
        seen.add(cursor.id);
        const next = byId.get(cursor.state.by);
        if (next === undefined) {
          throw new UserError(
            `preferences.md constraint ${cursor.id} has an invalid superseding id`
          );
        }
        cursor = next;
      }
    }
  }
  return rows;
}

function countValues(values: readonly string[]): Counts {
  const result = new Map<string, number>();
  for (const value of values) {
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...result.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
}

function summarize(
  unitRows: readonly Unit[],
  ledgerRows: readonly LedgerEntry[],
  currentFrontier: Frontier,
  gateRows: readonly Gate[]
): StatusSummary {
  return {
    unitStates: countValues(unitRows.map((unit) => unit.state)),
    ledgerVerdicts: countValues(ledgerRows.map((row) => row.verdict)),
    frontierGeneration: currentFrontier.generation,
    openGateIds: gateRows
      .filter((gate): gate is OpenGate => gate.kind === "open")
      .map((gate) => gate.id)
      .sort(),
  };
}

function countRecord(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) {
    return null;
  }
  const result = new Map<string, number>();
  for (const [name, count] of Object.entries(value)) {
    rejectUnsafeText(name, "status summary key");
    if (
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      return null;
    }
    result.set(name, count);
  }
  return Object.fromEntries(result);
}

function previousSummary(raw: string): StatusSummary | null {
  const match = /<!-- orch-summary ([A-Za-z0-9_-]+) -->/.exec(raw);
  if (match === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(match[1] ?? "", "base64url").toString("utf8")
    );
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.frontierGeneration !== "number" ||
    !isUnknownArray(value.openGateIds)
  ) {
    return null;
  }
  const unitStates = countRecord(value.unitStates);
  const ledgerVerdicts = countRecord(value.ledgerVerdicts);
  const openGateIds = value.openGateIds.filter(
    (item): item is string => typeof item === "string"
  );
  if (
    unitStates === null ||
    ledgerVerdicts === null ||
    openGateIds.length !== value.openGateIds.length
  ) {
    return null;
  }
  return {
    unitStates,
    ledgerVerdicts,
    frontierGeneration: value.frontierGeneration,
    openGateIds,
  };
}

function changed(before: StatusSummary | null, after: StatusSummary): string {
  if (before === null) {
    return "first render";
  }
  const result: string[] = [];
  const groups: readonly {
    readonly label: string;
    readonly oldCounts: Counts;
    readonly newCounts: Counts;
  }[] = [
    {
      label: "units",
      oldCounts: before.unitStates,
      newCounts: after.unitStates,
    },
    {
      label: "ledger",
      oldCounts: before.ledgerVerdicts,
      newCounts: after.ledgerVerdicts,
    },
  ];
  for (const { label, oldCounts, newCounts } of groups) {
    const names = [
      ...new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)]),
    ].sort();
    for (const name of names) {
      const oldCount = oldCounts[name] ?? 0;
      const newCount = newCounts[name] ?? 0;
      if (oldCount !== newCount) {
        result.push(`${label} ${name} ${oldCount}->${newCount}`);
      }
    }
  }
  if (before.frontierGeneration !== after.frontierGeneration) {
    result.push(
      `frontier generation ${before.frontierGeneration}->${after.frontierGeneration}`
    );
  }
  if (before.openGateIds.join("\0") !== after.openGateIds.join("\0")) {
    result.push(
      `open gates ${before.openGateIds.length}->${after.openGateIds.length}`
    );
  }
  return result.length === 0 ? "no derived changes" : result.join("; ");
}

const MARKDOWN_PUNCTUATION = new Set(
  "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
);

function markdown(value: string): string {
  rejectUnsafeText(value, "rendered value");
  return [...value]
    .map((character) =>
      MARKDOWN_PUNCTUATION.has(character)
        ? `&#x${character.codePointAt(0)?.toString(16).toUpperCase()};`
        : character
    )
    .join("");
}

function unmarkdown(value: string): string {
  if (/&#x[0-9A-F]+;/i.test(value)) {
    return value.replace(/&#x([0-9A-F]+);/gi, (encoded, digits: string) => {
      const codePoint = Number.parseInt(digits, 16);
      const character = String.fromCodePoint(codePoint);
      return MARKDOWN_PUNCTUATION.has(character) ? character : encoded;
    });
  }
  // Read stores written by the pre-hardening encoder so an upgrade does not
  // strand existing gates. New writes use numeric entities exclusively.
  return value
    .replace(/\\\|/g, "|")
    .replace(/\\\\/g, "\\")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): string {
  if (rows.length === 0) {
    return "(none)";
  }
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdown).join(" | ")} |`),
  ].join("\n");
}

function statusMarkdown(
  unitRows: readonly Unit[],
  ledgerRows: readonly LedgerEntry[],
  currentFrontier: Frontier,
  gateRows: readonly Gate[],
  currentSummary: StatusSummary
): string {
  return `# Orchestrate status

Generated: ${new Date().toISOString()}

## Units

States: ${countLine(currentSummary.unitStates)}

${table(
  ["ID", "Track", "State", "Branch", "PR", "SHA", "Brief"],
  unitRows.map(unitCells)
)}

## Verification ledger

Verdicts: ${countLine(currentSummary.ledgerVerdicts)}

${table(
  [
    "Repository",
    "PR",
    "SHA",
    "Verdict",
    "Receipt",
    "Receipt digest",
    "Verifier",
    "Timestamp",
  ],
  ledgerRows.map(ledgerCells)
)}

## Frontier

Generation: ${currentFrontier.generation}
Lowest unmerged: ${currentFrontier.lowestUnmerged ?? "none"}

${table(
  ["Branch", "PR", "SHA", "State"],
  currentFrontier.prs.map((row) => [
    row.branches,
    String(row.pr),
    row.sha,
    row.state,
  ])
)}

## Gates

${table(
  ["ID", "Status", "Question", "Options", "Default", "Answer"],
  gateRows.map((gate) => [
    gate.id,
    gate.kind,
    gate.question,
    gate.options,
    gate.defaultAnswer,
    gate.kind === "resolved" ? gate.answer : "",
  ])
)}

<!-- orch-summary ${Buffer.from(
    JSON.stringify(currentSummary),
    "utf8"
  ).toString("base64url")} -->
`;
}

function countLine(value: Counts): string {
  const entries = Object.entries(value);
  return entries.length === 0
    ? "none"
    : entries.map(([name, count]) => `${markdown(name)}=${count}`).join(", ");
}

const OPEN_GT_PR_STATUSES = new Set([
  "Trunk branch locked",
  "Changes requested",
  "Waiting on PRs in this stack to merge",
  "Waiting on downstack merge state",
  "Draft",
  "Required checks failed",
  "Undergoing failure detection",
  "Merge queue failed on current head commit",
  "Handed off to merge queue...",
  "Waiting on downstack",
  "Merge conflicts",
  "Needs reviewers",
  "Needs approvals",
  "Needs restack",
  "Queued to merge...",
  "Ready to merge",
  "Ready to merge as stack",
  "Rebasing...",
  "Waiting on CI...",
  "Stale, needs rebase onto trunk",
  "Unresolved comments",
  "Waiting on required CI",
  "Waiting to merge...",
]);

interface GtPullRequest {
  readonly pr: number;
  readonly state: FrontierPrState;
}

interface GtFrontierEntry extends GtPullRequest {
  readonly branches: string;
}

function gitBranchName(value: string, label: string, deadline: number): string {
  const branch = requiredLine(value, label);
  if (branch !== value || branch.startsWith("-")) {
    throw new UserError(`${label} is not a safe Git branch name`);
  }
  try {
    const checked = execFileSync(
      "git",
      ["check-ref-format", "--branch", branch],
      {
        encoding: "utf8",
        env: isolatedGitEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
        timeout: remainingCommandTimeout(deadline, `git check-ref-format ${label}`),
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      }
    ).trim();
    if (checked !== branch) {
      throw new UserError(`${label} is not a canonical Git branch name`);
    }
  } catch (error) {
    if (error instanceof UserError) {
      throw error;
    }
    throw new UserError(`${label} is not a valid Git branch: ${errorMessage(error)}`);
  }
  return branch;
}

export function parseGtPullRequest({
  branch,
  detail,
}: {
  branch: string;
  detail: string;
}, deadline = Date.now() + MAX_GRAPHITE_FRONTIER_DURATION_MS): GtPullRequest {
  const safeBranch = gitBranchName(branch, "gt info branch", deadline);
  rejectUnsafeText(detail, "gt info row");
  const match =
    /^(?:\[origin\] )?PR #([1-9]\d*)(?: \(([^)\r\n]+)\))?(?: .+)?$/.exec(
      detail
    );
  const pr = Number(match?.[1] ?? 0);
  if (match === null || !Number.isSafeInteger(pr)) {
    throw new UserError(
      `gt info output has an invalid PR row for branch ${safeBranch}: ${detail}`
    );
  }
  const status = match[2];
  if (status === "Merged") {
    return { pr, state: "MERGED" };
  }
  if (status === "Closed") {
    return { pr, state: "CLOSED" };
  }
  if (status === undefined || OPEN_GT_PR_STATUSES.has(status)) {
    return { pr, state: "OPEN" };
  }
  throw new UserError(
    `gt info output has an unknown PR state for branch ${safeBranch}: ${status}`
  );
}

export function parseGtBranches(
  raw: string,
  deadline = Date.now() + MAX_GRAPHITE_FRONTIER_DURATION_MS
): readonly string[] {
  const branches: string[] = [];
  const seen = new Set<string>();
  const lines = raw.replace(/\r/g, "").split("\n");
  const rowCount = lines.filter((line) => line.length > 0).length;
  if (rowCount > MAX_GRAPHITE_STACK_ENTRIES + 1) {
    throw new UserError(
      `gt log short output exceeds the ${MAX_GRAPHITE_STACK_ENTRIES}-branch stack limit`
    );
  }
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) {
      continue;
    }
    const branchMatch =
      /^(?:│ )*[◯◉] +([^\s]+)((?: \([^()\r\n]*\))*)$/.exec(line);
    if (branchMatch === null) {
      throw new UserError(
        `gt log short output has an unparseable line ${index + 1}: ${JSON.stringify(line)}`
      );
    }
    const branch = gitBranchName(
      branchMatch[1] ?? "",
      `gt log branch on line ${index + 1}`,
      deadline
    );
    if (seen.has(branch)) {
      throw new UserError(
        `gt log short output contains duplicate branch ${branch}`
      );
    }
    seen.add(branch);
    branches.push(branch);
    if (branches.length > MAX_GRAPHITE_STACK_ENTRIES + 1) {
      throw new UserError(
        `gt log short output exceeds the ${MAX_GRAPHITE_STACK_ENTRIES}-branch stack limit`
      );
    }
  }
  const trunk = branches[0];
  if (trunk === undefined) {
    throw new UserError("gt log short output did not contain a stack");
  }
  return branches.slice(1);
}

function remainingCommandTimeout(deadline: number, label: string): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new UserError(
      `${label} exceeded the ${MAX_GRAPHITE_FRONTIER_DURATION_MS}ms aggregate deadline`
    );
  }
  return Math.min(EXTERNAL_COMMAND_TIMEOUT_MS, remaining);
}

function graphitePullRequest({
  branch,
  repo,
  deadline,
}: {
  branch: string;
  repo: string;
  deadline: number;
}): GtPullRequest {
  const safeBranch = gitBranchName(branch, "gt info branch", deadline);
  let raw: string;
  try {
    raw = execFileSync("gt", ["--no-interactive", "info", safeBranch], {
      cwd: repo,
      encoding: "utf8",
      env: isolatedGitEnvironment({ NO_COLOR: "1" }),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: remainingCommandTimeout(deadline, `gt info ${safeBranch}`),
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    });
  } catch (error) {
    throw new UserError(
      `gt info ${safeBranch} failed: ${errorMessage(error)}`
    );
  }
  const rows = raw
    .replace(/\r/g, "")
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("PR #") || line.startsWith("[origin] PR #")
    );
  if (rows.length === 0) {
    throw new UserError(
      `gt info output branch ${safeBranch} has no pull request; this clone's gt metadata may predate the submit, so resolve the frontier from the stacker's clone or after gt sync`
    );
  }
  if (rows.length > 1) {
    throw new UserError(
      `gt info output contains multiple PRs for branch ${branch}`
    );
  }
  return parseGtPullRequest(
    { branch: safeBranch, detail: rows[0] ?? "" },
    deadline
  );
}

function graphiteFrontier(
  repo: string,
  deadline: number
): readonly GtFrontierEntry[] {
  let raw: string;
  try {
    raw = execFileSync(
      "gt",
      ["--no-interactive", "log", "short", "--stack", "--reverse"],
      {
        cwd: repo,
        encoding: "utf8",
        env: isolatedGitEnvironment({ NO_COLOR: "1" }),
        stdio: ["ignore", "pipe", "pipe"],
        timeout: remainingCommandTimeout(deadline, "gt log short --stack --reverse"),
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      }
    );
  } catch (error) {
    throw new UserError(
      `gt log short --stack --reverse failed: ${errorMessage(error)}`
    );
  }
  const result = parseGtBranches(raw, deadline).map((branch) => ({
    branches: branch,
    ...graphitePullRequest({ branch, repo, deadline }),
  }));
  if (new Set(result.map((row) => row.pr)).size !== result.length) {
    throw new UserError("gt info output contains duplicate pull requests");
  }
  return result;
}

function branchSha({
  branch,
  repo,
  deadline,
}: {
  branch: string;
  repo: string;
  deadline: number;
}): string {
  const safeBranch = gitBranchName(branch, "frontier branch", deadline);
  let raw: string;
  try {
    raw = execFileSync(
      "git",
      [
        "rev-parse",
        "--verify",
        "--end-of-options",
        `${safeBranch}^{commit}`,
      ],
      {
      cwd: repo,
      encoding: "utf8",
      env: isolatedGitEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: remainingCommandTimeout(deadline, `git rev-parse ${safeBranch}`),
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      }
    );
  } catch (error) {
    throw new UserError(
      `git rev-parse ${safeBranch} failed: ${errorMessage(error)}`
    );
  }
  const sha = raw.trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha)) {
    throw new UserError(`git rev-parse ${safeBranch} returned an invalid SHA`);
  }
  return sha;
}

function resolveFrontier(repo: string): readonly FrontierPr[] {
  const deadline = Date.now() + MAX_GRAPHITE_FRONTIER_DURATION_MS;
  return graphiteFrontier(repo, deadline).map((row) => ({
    ...row,
    sha: branchSha({ branch: row.branches, repo, deadline }),
  }));
}

export function validateFrontierPin({
  actual,
  expected,
}: {
  actual: readonly number[];
  expected: readonly number[];
}): void {
  if (
    actual.length === expected.length &&
    actual.every((pr, index) => pr === expected[index])
  ) {
    return;
  }
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((pr) => !actualSet.has(pr));
  const extra = actual.filter((pr) => !expectedSet.has(pr));
  const drift: string[] = [];
  if (missing.length > 0) {
    drift.push(`missing from gt: ${missing.join(",")}`);
  }
  if (extra.length > 0) {
    drift.push(`extra in gt: ${extra.join(",")}`);
  }
  if (missing.length === 0 && extra.length === 0) {
    drift.push(
      `order differs: expected ${expected.join(",")}; gt ${actual.join(",")}`
    );
  }
  throw new UserError(`frontier pin mismatch: ${drift.join("; ")}`);
}

export function openStore(
  directory: string,
  options: OpenStoreOptions = {}
): Store {
  const store = resolve(directory);
  let closed = false;
  let storeIdentity: DirectoryIdentity | null = null;
  let releaseLock: (() => Promise<void>) | null = null;
  let lockRequest: Promise<void> | null = null;
  let writeQueue: Promise<void> = Promise.resolve();

  const ensureOpen = (): void => {
    if (closed) {
      throw new UserError("store is closed");
    }
  };

  const currentStoreIdentity = (): DirectoryIdentity => {
    if (storeIdentity === null) {
      throw new UserError("store identity is unavailable");
    }
    return storeIdentity;
  };

  const ensureStore = async (create: boolean): Promise<void> => {
    ensureOpen();
    const existing = await lstatOrNull(store);
    if (existing === null) {
      if (!create) {
        throw new UserError(
          `store is not initialized at ${store}; run orch init`
        );
      }
      storeIdentity = await createSafeDirectoryTree(store);
    }
    if (storeIdentity === null) {
      storeIdentity = await assertSafeDirectory(store);
    } else {
      await assertSafeDirectory(store, storeIdentity);
    }
  };

  const ensureLock = async (): Promise<void> => {
    ensureOpen();
    if (releaseLock !== null) {
      return;
    }
    if (lockRequest === null) {
      lockRequest = acquireLock(
        store,
        currentStoreIdentity(),
        options
      ).then((release) => {
          releaseLock = release;
        });
    }
    try {
      await lockRequest;
    } catch (error) {
      lockRequest = null;
      throw error;
    }
  };

  const beginRead = async (): Promise<void> => {
    await ensureStore(false);
  };

  const beginWrite = async (): Promise<void> => {
    await ensureStore(false);
    await ensureLock();
    await assertSafeDirectory(store, currentStoreIdentity());
  };

  const serializeWrite = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = writeQueue.then(operation);
    writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const api: Store = {
    units: {
      add: async (params) => {
        await beginWrite();
        const row: Unit = {
          id: requiredCell(params.id, "unit id"),
          track: requiredCell(params.track, "track"),
          state: "pending",
          branch: "",
          pr: "",
          sha: "",
          brief:
            params.brief === undefined
              ? ""
              : requiredCell(params.brief, "brief"),
        };
        const rows = [...(await readUnits(store))];
        if (rows.some((unit) => unit.id === row.id)) {
          throw new UserError(`unit ${row.id} already exists`);
        }
        rows.push(row);
        await saveUnits(store, rows, currentStoreIdentity());
        return row;
      },
      set: async (params) => {
        await beginWrite();
        const id = requiredCell(params.id, "unit id");
        const state = requiredCell(params.state, "state");
        const rows = [...(await readUnits(store))];
        const index = rows.findIndex((unit) => unit.id === id);
        const old = rows[index];
        if (index < 0 || old === undefined) {
          throw new NotFoundError(`unit ${id} not found`);
        }
        const row: Unit = {
          ...old,
          state,
          branch:
            params.branch === undefined
              ? old.branch
              : requiredCell(params.branch, "branch"),
          pr:
            params.pr === undefined
              ? old.pr
              : String(positiveInteger(params.pr, "PR")),
          sha:
            params.sha === undefined
              ? old.sha
              : requiredCommitSha(params.sha),
        };
        rows[index] = row;
        await saveUnits(store, rows, currentStoreIdentity());
        return row;
      },
      get: async (id) => {
        await beginRead();
        const cleanId = requiredCell(id, "unit id");
        const row = (await readUnits(store)).find(
          (unit) => unit.id === cleanId
        );
        if (row === undefined) {
          throw new NotFoundError(`unit ${cleanId} not found`);
        }
        return row;
      },
      list: async (params = {}) => {
        await beginRead();
        const state =
          params.state === undefined
            ? undefined
            : requiredCell(params.state, "state");
        const track =
          params.track === undefined
            ? undefined
            : requiredCell(params.track, "track");
        return (await readUnits(store)).filter(
          (unit) =>
            (state === undefined || unit.state === state) &&
            (track === undefined || unit.track === track)
        );
      },
      counts: async () => {
        await beginRead();
        return countValues(
          (await readUnits(store)).map((unit) => unit.state)
        );
      },
    },
    ledger: {
      record: async (params) => {
        await beginWrite();
        const repository = repositoryIdentity(params.repository);
        const pr = positiveInteger(params.pr, "PR");
        const sha = requiredCommitSha(params.sha);
        const verdict = parseVerdict(params.verdict);
        const verified = await requiredReceipt(params.receipt, store);
        if (
          verified.receipt.repository !== repository ||
          verified.receipt.pr !== pr ||
          verified.receipt.headSha !== sha ||
          verified.receipt.verdict !== verdict
        ) {
          throw new UserError(
            "verification receipt does not match repository, PR, head SHA, and verdict"
          );
        }
        const row: LedgerEntry = {
          repository,
          pr: String(pr),
          sha,
          verdict,
          receipt: verified.path,
          receiptDigest: verified.receipt.digest,
          verifier: verified.receipt.verifier,
          ts: verified.receipt.verifiedAt,
        };
        const rows = [...(await readLedger(store))];
        const index = rows.findIndex(
          (old) =>
            old.repository === row.repository &&
            old.pr === row.pr &&
            old.sha === row.sha
        );
        if (index < 0) {
          rows.push(row);
        } else {
          rows[index] = row;
        }
        await saveLedger(store, rows, currentStoreIdentity());
        return row;
      },
      check: async (params) => {
        await beginRead();
        const repository = repositoryIdentity(params.repository);
        const pr = String(positiveInteger(params.pr, "PR"));
        const sha = requiredCommitSha(params.sha);
        const row = (await readLedger(store)).find(
          (value) =>
            value.repository === repository &&
            value.pr === pr &&
            value.sha === sha
        );
        if (row === undefined) {
          throw new NotFoundError("NOT-VERIFIED", {
            compact: "NOT-VERIFIED",
            json: { repository, pr, sha, verdict: "NOT-VERIFIED" },
          });
        }
        return row;
      },
      gate: async (params) => {
        await beginRead();
        const repository = repositoryIdentity(params.repository);
        const pr = String(positiveInteger(params.pr, "PR"));
        const sha = requiredCommitSha(params.sha);
        const row = (await readLedger(store)).find(
          (value) =>
            value.repository === repository &&
            value.pr === pr &&
            value.sha === sha
        );
        if (row === undefined) {
          throw new NotFoundError("NOT-VERIFIED", {
            compact: "NOT-VERIFIED",
            json: { repository, pr, sha, verdict: "NOT-VERIFIED" },
          });
        }
        const verified = await requiredReceipt(row.receipt, store);
        if (
          verified.receipt.digest !== row.receiptDigest ||
          verified.receipt.repository !== repository ||
          String(verified.receipt.pr) !== pr ||
          verified.receipt.headSha !== sha ||
          verified.receipt.verdict !== row.verdict ||
          verified.receipt.verifier !== row.verifier ||
          verified.receipt.verifiedAt !== row.ts
        ) {
          throw new UserError(
            `verification receipt for ${repository}#${pr}@${sha} changed or no longer matches the ledger`
          );
        }
        if (
          row.verdict === "live-ui-verified" ||
          row.verdict === "unit-test-verified" ||
          (row.verdict === "type-check-only" && params.allowTypeCheckOnly)
        ) {
          return row;
        }
        if (row.verdict === "type-check-only") {
          throw new UserError(
            `${repository}#${pr}@${sha} has only type-check evidence; pass --allow-type-check-only only when the completion contract permits it`
          );
        }
        throw new UserError(
          `${repository}#${pr}@${sha} is not complete: ${row.verdict}`
        );
      },
      summary: async () => {
        await beginRead();
        return countValues(
          (await readLedger(store)).map((row) => row.verdict)
        );
      },
    },
    inbox: {
      push: async (params) => {
        await beginWrite();
        const pointer: InboxPointer = {
          ts: new Date().toISOString(),
          agent: requiredCell(params.agent, "agent"),
          unit: requiredCell(params.unit, "unit"),
          status: requiredCell(params.status, "status"),
          report:
            params.report === undefined
              ? ""
              : requiredCell(params.report, "report"),
        };
        const inbox = join(store, ACTIVE_INBOX);
        const inboxIdentity = await ensureSafeDirectory(
          inbox,
          currentStoreIdentity()
        );
        await ensureSafeDirectory(
          join(store, PENDING_INBOX),
          currentStoreIdentity()
        );
        const timestamp = pointer.ts.replace(/[:.]/g, "-");
        const filename = `${timestamp}-${process.pid}-${randomUUID()}.tsv`;
        const contents = `${pointerCells(pointer).map(cleanCell).join("\t")}\n`;
        const existing = await pointerFiles(inbox, inboxIdentity, {
          entries: MAX_INBOX_DIRECTORY_ENTRIES,
          bytes: MAX_INBOX_DIRECTORY_BYTES,
        });
        const existingBytes = existing.reduce(
          (total, entry) => total + entry.bytes,
          0
        );
        if (
          existing.length >= MAX_INBOX_DIRECTORY_ENTRIES ||
          existingBytes + Buffer.byteLength(contents, "utf8") >
            MAX_INBOX_DIRECTORY_BYTES
        ) {
          throw new UserError("active inbox is at its bounded capacity");
        }
        await atomicWrite(
          join(inbox, filename),
          contents,
          inboxIdentity,
          MAX_INBOX_POINTER_BYTES
        );
        return { pointer, filename };
      },
      drain: async () => {
        await beginWrite();
        const inbox = join(store, ACTIVE_INBOX);
        const pending = join(store, PENDING_INBOX);
        const inboxIdentity = await ensureSafeDirectory(
          inbox,
          currentStoreIdentity()
        );
        const pendingIdentity = await ensureSafeDirectory(
          pending,
          currentStoreIdentity()
        );
        const existingBatches = await pendingBatches(
          pending,
          pendingIdentity
        );
        const existingBatch = existingBatches[0];
        if (existingBatch !== undefined) {
          const claimed = join(pending, existingBatch);
          const claimedIdentity = await assertSafeDirectory(claimed);
          return {
            batch: existingBatch,
            pointers: await readPointers(claimed, claimedIdentity),
            replayed: true,
          };
        }

        const entries = await pointerFiles(inbox, inboxIdentity, {
          entries: MAX_INBOX_DIRECTORY_ENTRIES,
          bytes: MAX_INBOX_DIRECTORY_BYTES,
        });
        if (entries.length === 0) {
          return { batch: null, pointers: [], replayed: false };
        }
        const selected: PointerFile[] = [];
        let selectedBytes = 0;
        for (const entry of entries) {
          if (
            selected.length >= MAX_INBOX_BATCH_ENTRIES ||
            selectedBytes + entry.bytes > MAX_INBOX_BATCH_BYTES
          ) {
            break;
          }
          selected.push(entry);
          selectedBytes += entry.bytes;
        }
        if (selected.length === 0) {
          throw new UserError("no inbox pointer fits within the batch limits");
        }
        const batch = `drain-${Date.now()}-${randomUUID()}`;
        const claimed = join(pending, batch);
        if ((await lstatOrNull(claimed)) !== null) {
          throw new UserError(`inbox batch ${batch} already exists`);
        }
        await assertSafeDirectory(inbox, inboxIdentity);
        await assertSafeDirectory(pending, pendingIdentity);
        await mkdir(claimed, { mode: SAFE_DIRECTORY_MODE });
        await syncDirectory(pending, pendingIdentity);
        const claimedIdentity = await assertSafeDirectory(claimed);
        for (const entry of selected) {
          const source = join(inbox, entry.name);
          const current = await lstat(source);
          assertRegularFile(current, source);
          if (
            current.nlink !== 1 ||
            !sameFileIdentity(fileIdentity(current), entry.identity)
          ) {
            throw new UserError(`inbox pointer ${entry.name} changed before claim`);
          }
          await rename(source, join(claimed, entry.name));
        }
        await syncDirectory(inbox, inboxIdentity);
        await syncDirectory(claimed, claimedIdentity);
        await syncDirectory(pending, pendingIdentity);
        return {
          batch,
          pointers: await readPointers(claimed, claimedIdentity),
          replayed: false,
        };
      },
      ack: async (batchValue) => {
        await beginWrite();
        const batch = requiredLine(batchValue, "inbox batch");
        if (!BATCH_PATTERN.test(batch)) {
          throw new UserError("inbox batch has an invalid id");
        }
        const pending = join(store, PENDING_INBOX);
        const pendingIdentity = await ensureSafeDirectory(
          pending,
          currentStoreIdentity()
        );
        const claimed = join(pending, batch);
        const stats = await lstatOrNull(claimed);
        if (stats === null) {
          throw new NotFoundError(`inbox batch ${batch} not found`);
        }
        const claimedIdentity = await assertSafeDirectory(claimed);
        await readPointers(claimed, claimedIdentity);
        const count = await removePointerDirectory({
          directory: claimed,
          directoryIdentity: claimedIdentity,
          parent: pendingIdentity,
        });
        return { batch, count };
      },
      peek: async () => {
        await beginRead();
        const inbox = join(store, ACTIVE_INBOX);
        const inboxIdentity = await assertSafeDirectory(inbox);
        const pending = join(store, PENDING_INBOX);
        const pendingStats = await lstatOrNull(pending);
        const rows: InboxPointer[] = [];
        if (pendingStats !== null) {
          const pendingIdentity = await assertSafeDirectory(pending);
          const batches = await pendingBatches(
            pending,
            pendingIdentity
          );
          for (const batch of batches) {
            const claimed = join(pending, batch);
            const claimedIdentity = await assertSafeDirectory(claimed);
            rows.push(...(await readPointers(claimed, claimedIdentity)));
          }
          if (batches.length > 0) {
            const active = await pointerFiles(inbox, inboxIdentity, {
              entries: MAX_INBOX_DIRECTORY_ENTRIES,
              bytes: MAX_INBOX_DIRECTORY_BYTES,
            });
            if (active.length > 0) {
              throw new UserError(
                "inbox peek is bounded to one claimed batch; ack it before peeking active pointers"
              );
            }
            return rows;
          }
        }
        rows.push(
          ...(await readPointers(inbox, inboxIdentity, {
            entries: MAX_INBOX_BATCH_ENTRIES,
            bytes: MAX_INBOX_BATCH_BYTES,
          }))
        );
        return rows;
      },
      count: async () => {
        await beginRead();
        const inbox = join(store, ACTIVE_INBOX);
        const inboxIdentity = await assertSafeDirectory(inbox);
        const pending = join(store, PENDING_INBOX);
        const pendingStats = await lstatOrNull(pending);
        let count = (
          await pointerFiles(inbox, inboxIdentity, {
            entries: MAX_INBOX_DIRECTORY_ENTRIES,
            bytes: MAX_INBOX_DIRECTORY_BYTES,
          })
        ).length;
        if (pendingStats !== null) {
          const pendingIdentity = await assertSafeDirectory(pending);
          for (const batch of await pendingBatches(
            pending,
            pendingIdentity
          )) {
            const claimed = join(pending, batch);
            const claimedIdentity = await assertSafeDirectory(claimed);
            count += (
              await pointerFiles(claimed, claimedIdentity, {
                entries: MAX_INBOX_BATCH_ENTRIES,
                bytes: MAX_INBOX_BATCH_BYTES,
              })
            ).length;
          }
        }
        return count;
      },
    },
    gates: {
      park: async (params) => {
        await beginWrite();
        const options = canonicalGateOptions(params.options);
        const gate: OpenGate = {
          kind: "open",
          id: requiredLine(params.id, "gate id"),
          question: requiredLine(params.question, "question"),
          options,
          defaultAnswer: gateAnswer(options, params.defaultAnswer),
        };
        const rows = [...(await readGates(store))];
        const index = rows.findIndex((old) => old.id === gate.id);
        if (index < 0) {
          rows.push(gate);
        } else {
          rows[index] = gate;
        }
        await atomicWrite(
          join(store, "gates.md"),
          renderGates(rows),
          currentStoreIdentity()
        );
        return gate;
      },
      list: async () => {
        await beginRead();
        return (await readGates(store)).filter(
          (gate): gate is OpenGate => gate.kind === "open"
        );
      },
      resolve: async (params) => {
        await beginWrite();
        const id = requiredLine(params.id, "gate id");
        const rows = [...(await readGates(store))];
        const index = rows.findIndex((gate) => gate.id === id);
        const old = rows[index];
        if (index < 0 || old === undefined) {
          throw new NotFoundError(`gate ${id} not found`);
        }
        if (old.kind !== "open") {
          throw new UserError(`gate ${id} is already resolved`);
        }
        const gate: ResolvedGate = {
          kind: "resolved",
          id: old.id,
          question: old.question,
          options: old.options,
          defaultAnswer: old.defaultAnswer,
          answer: gateAnswer(old.options, params.answer),
          resolvedBy: gateResolutionSource(params.source),
        };
        rows[index] = gate;
        await atomicWrite(
          join(store, "gates.md"),
          renderGates(rows),
          currentStoreIdentity()
        );
        return gate;
      },
    },
    frontier: {
      set: async (params) => {
        await beginWrite();
        const repo = resolve(requiredLine(params.repo, "repo directory"));
        const pin =
          params.prs === undefined
            ? undefined
            : params.prs.map((pr) => positiveInteger(pr, "PR"));
        if (pin !== undefined && new Set(pin).size !== pin.length) {
          throw new UserError("--prs must not contain duplicates");
        }
        const old = await readFrontier(store);
        const prs = resolveFrontier(repo);
        if (pin !== undefined) {
          validateFrontierPin({
            actual: prs.map((row) => row.pr),
            expected: pin,
          });
        }
        const value: Frontier = {
          generation: old.generation + 1,
          prs,
          lowestUnmerged: prs.find((row) => row.state === "OPEN")?.pr ?? null,
        };
        await atomicWrite(
          join(store, "frontier.json"),
          `${JSON.stringify(value, null, 2)}\n`,
          currentStoreIdentity()
        );
        return value;
      },
      show: async () => {
        await beginRead();
        return readFrontier(store);
      },
    },
    standing: {
      show: async () => {
        await beginRead();
        return readStanding(store);
      },
      add: async (params) => {
        await beginWrite();
        const rows = [...(await readStanding(store))];
        const provenance = parseConstraintProvenance(params.provenance);
        const item = withConstraintDigest({
          id: constraintId(params.id),
          constraint: normalizedConstraint(params.constraint, "constraint"),
          provenance,
          source: validatedSource(params.source, provenance),
          scope: normalizedConstraint(params.scope, "scope"),
          authorityCeiling: parseConstraintAuthorityCeiling(
            params.authorityCeiling
          ),
          capturedAt: new Date().toISOString(),
          state: { kind: "active" },
        });
        if (rows.some((row) => row.id === item.id)) {
          throw new UserError(`constraint ${item.id} already exists`);
        }
        rows.push(item);
        await atomicWrite(
          join(store, "preferences.md"),
          renderStanding(rows),
          currentStoreIdentity()
        );
        return item;
      },
      supersede: async (params) => {
        await beginWrite();
        const id = constraintId(params.id);
        const by = constraintId(params.by);
        const rows = [...(await readStanding(store))];
        const index = rows.findIndex((row) => row.id === id);
        const old = rows[index];
        if (old === undefined) {
          throw new NotFoundError(`constraint ${id} not found`);
        }
        const replacement = rows.find((row) => row.id === by);
        if (replacement === undefined || replacement.state.kind !== "active") {
          throw new UserError(
            `superseding constraint ${by} must exist and be active`
          );
        }
        if (id === by) {
          throw new UserError("a constraint cannot supersede itself");
        }
        assertSafeSupersession(old, replacement);
        if (old.state.kind === "superseded") {
          if (old.state.by === by) {
            return old;
          }
          throw new UserError(
            `constraint ${id} is already superseded by ${old.state.by}`
          );
        }
        const { digest: _oldDigest, ...withoutDigest } = old;
        const item = withConstraintDigest({
          ...withoutDigest,
          state: {
            kind: "superseded",
            by,
            at: new Date().toISOString(),
          },
        });
        rows[index] = item;
        await atomicWrite(
          join(store, "preferences.md"),
          renderStanding(rows),
          currentStoreIdentity()
        );
        return item;
      },
    },
    status: {
      render: async () => {
        await beginWrite();
        const unitRows = await readUnits(store);
        const ledgerRows = await readLedger(store);
        const currentFrontier = await readFrontier(store);
        const gateRows = await readGates(store);
        const currentSummary = summarize(
          unitRows,
          ledgerRows,
          currentFrontier,
          gateRows
        );
        const path = join(store, "status.md");
        const before = (await assertSafeFileIfPresent(path))
          ? previousSummary(await safeReadFile(path))
          : null;
        const change = changed(before, currentSummary);
        await atomicWrite(
          path,
          statusMarkdown(
            unitRows,
            ledgerRows,
            currentFrontier,
            gateRows,
            currentSummary
          ),
          currentStoreIdentity()
        );
        return {
          units: unitRows,
          ledger: ledgerRows,
          frontier: currentFrontier,
          gates: gateRows,
          summary: currentSummary,
          changed: change,
        };
      },
    },
    init: async () => {
      await ensureStore(true);
      await ensureLock();
      const identity = currentStoreIdentity();
      await writeIfMissing(
        join(store, "units.tsv"),
        `${UNIT_HEADER}\n`,
        identity
      );
      await writeIfMissing(
        join(store, "ledger.tsv"),
        `${LEDGER_HEADER}\n`,
        identity
      );
      await ensureSafeDirectory(join(store, ACTIVE_INBOX), identity);
      await ensureSafeDirectory(join(store, PENDING_INBOX), identity);
      await writeIfMissing(join(store, "gates.md"), "", identity);
      await writeIfMissing(
        join(store, "preferences.md"),
        renderStanding([]),
        identity
      );
      await readStanding(store);
      await writeIfMissing(join(store, "frontier.json"), "{}\n", identity);
      return { store };
    },
    close: async () => {
      if (closed) {
        return;
      }
      if (lockRequest !== null) {
        try {
          await lockRequest;
        } catch {
          // A failed acquisition has no lock to release.
        }
      }
      const release = releaseLock;
      releaseLock = null;
      closed = true;
      if (release !== null) {
        await release();
      }
    },
  };

  return {
    ...api,
    units: {
      ...api.units,
      add: (params) => serializeWrite(() => api.units.add(params)),
      set: (params) => serializeWrite(() => api.units.set(params)),
    },
    ledger: {
      ...api.ledger,
      record: (params) => serializeWrite(() => api.ledger.record(params)),
    },
    inbox: {
      ...api.inbox,
      push: (params) => serializeWrite(() => api.inbox.push(params)),
      drain: () => serializeWrite(() => api.inbox.drain()),
      ack: (batch) => serializeWrite(() => api.inbox.ack(batch)),
    },
    gates: {
      ...api.gates,
      park: (params) => serializeWrite(() => api.gates.park(params)),
      resolve: (params) => serializeWrite(() => api.gates.resolve(params)),
    },
    frontier: {
      ...api.frontier,
      set: (params) => serializeWrite(() => api.frontier.set(params)),
    },
    standing: {
      ...api.standing,
      add: (params) => serializeWrite(() => api.standing.add(params)),
      supersede: (params) =>
        serializeWrite(() => api.standing.supersede(params)),
    },
    status: {
      render: () => serializeWrite(() => api.status.render()),
    },
    init: () => serializeWrite(() => api.init()),
    close: () => serializeWrite(() => api.close()),
  };
}
