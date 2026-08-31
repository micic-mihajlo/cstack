import { spawn } from "node:child_process";
import type * as T from "./types.ts";
import { nonEmpty, parseGitObjectId, parsePrNumber } from "./types.ts";
export const REVIEW_THREADS_QUERY =
  "\nquery ReviewThreads($owner: String!, $repo: String!, $pr: Int!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      reviewThreads(first: 100, after: $after) {\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n        nodes {\n          id\n          isResolved\n          comments(first: 1) {\n            nodes {\n              body\n              createdAt\n              path\n              line\n              author { login }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const PR_COMMIT_STATUS_QUERY =
  "\nquery PrCommitStatuses($owner: String!, $repo: String!, $pr: Int!) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 50) {\n        nodes {\n          commit {\n            oid\n            statusCheckRollup {\n              state\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const OPEN_PULL_REQUESTS_QUERY =
  "\nquery OpenPullRequests($owner: String!, $repo: String!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequests(first: 100, after: $after, states: OPEN) {\n      totalCount\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      nodes {\n        number\n        headRefName\n        baseRefName\n        headRepository { nameWithOwner }\n      }\n    }\n  }\n}\n";

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
export class WatcherQueryError extends Error {
  readonly failure: T.QueryFailure;
  constructor(failure: T.QueryFailure) {
    super(failure.detail);
    this.name = "WatcherQueryError";
    this.failure = failure;
  }
}
export class ChecksUnavailable extends WatcherQueryError {
  constructor(detail: string) {
    super({ kind: "checks-unavailable", retryable: true, detail });
    this.name = "ChecksUnavailable";
  }
}
const firstLine = (value: string): string =>
  value.trim().split(/\r?\n/, 1)[0]?.slice(0, 240) ?? "";
export const DEFAULT_COMMAND_TIMEOUT_MILLISECONDS = 30_000;
const MAX_COMMAND_OUTPUT_CHARACTERS = 4 * 1024 * 1024;
export function runBoundedCommand(
  argv: readonly [string, ...string[]],
  timeoutMilliseconds = DEFAULT_COMMAND_TIMEOUT_MILLISECONDS
): Promise<CommandResult> {
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0)
    return Promise.resolve({
      code: 124,
      stdout: "",
      stderr: "command deadline expired before invocation",
    });
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      env: commandEnvironment(argv[0]),
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputExceeded = false;
    let settled = false;
    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, Math.ceil(timeoutMilliseconds));
    timer.unref();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length + stderr.length > MAX_COMMAND_OUTPUT_CHARACTERS) {
        outputExceeded = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stdout.length + stderr.length > MAX_COMMAND_OUTPUT_CHARACTERS) {
        outputExceeded = true;
        child.kill("SIGKILL");
      }
    });
    child.on("error", (error) => {
      finish({
        code: 127,
        stdout,
        stderr: `could not execute ${argv[0]}: ${error.message}`.slice(0, 240),
      });
    });
    child.on("close", (code) => {
      if (timedOut)
        return finish({
          code: 124,
          stdout,
          stderr: `command exceeded ${Math.ceil(timeoutMilliseconds)}ms`,
        });
      if (outputExceeded)
        return finish({
          code: 125,
          stdout: stdout.slice(0, MAX_COMMAND_OUTPUT_CHARACTERS),
          stderr: "command output exceeded 4 MiB",
        });
      return finish({ code: code ?? -1, stdout, stderr });
    });
  });
}

function commandEnvironment(executable: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (executable === "git" || executable.endsWith("/git")) {
    for (const name of Object.keys(env)) {
      if (name.startsWith("GIT_")) delete env[name];
    }
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_CONFIG_GLOBAL = "/dev/null";
    env.GIT_TERMINAL_PROMPT = "0";
  }
  if (executable === "gh" || executable.endsWith("/gh")) {
    delete env.GH_HOST;
    delete env.GH_REPO;
    delete env.GH_CONFIG_DIR;
    env.GH_PROMPT_DISABLED = "1";
    env.GH_PAGER = "cat";
    env.NO_COLOR = "1";
  }
  return env;
}
function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WatcherQueryError({
      kind: "json-parse",
      retryable: true,
      detail: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
async function runJson(
  argv: readonly [string, ...string[]],
  timeoutMilliseconds: number
): Promise<unknown> {
  const result = await runBoundedCommand(argv, timeoutMilliseconds);
  if (result.code !== 0)
    throw new WatcherQueryError({
      kind: "command-exit",
      retryable: true,
      code: result.code,
      detail:
        firstLine(result.stderr) || `${argv.join(" ")} exited ${result.code}`,
    });
  return parseJson(result.stdout, argv.join(" "));
}
async function runJsonLines(
  argv: readonly [string, ...string[]],
  timeoutMilliseconds: number
): Promise<readonly unknown[]> {
  const result = await runBoundedCommand(argv, timeoutMilliseconds);
  if (result.code !== 0)
    throw new WatcherQueryError({
      kind: "command-exit",
      retryable: true,
      code: result.code,
      detail:
        firstLine(result.stderr) || `${argv.join(" ")} exited ${result.code}`,
    });
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0)
    throw new WatcherQueryError({
      kind: "json-parse",
      retryable: true,
      detail: `${argv.join(" ")}: empty paginated response`,
    });
  return lines.map((line, index) =>
    parseJson(line, `${argv.join(" ")} page ${index + 1}`)
  );
}
function raw(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function missing(path: string, value?: unknown): never {
  throw new WatcherQueryError({
    kind: "missing-key",
    retryable: true,
    detail:
      value === undefined
        ? `missing ${path}`
        : `invalid ${path}: ${raw(value)}`,
    ...(value === undefined ? {} : { rawValue: raw(value) }),
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) missing(path, value);
  return value;
}
function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) missing(path, value);
  return value;
}
function at(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    const object = record(current, path.join("."));
    if (!(key in object)) missing(path.join("."));
    current = object[key];
  }
  return current;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string") missing(path, value);
  return value;
}
const optionalString = (value: unknown, path: string): string | null =>
  value === null ? null : string(value, path);
function objectId(value: unknown, path: string): T.GitObjectId {
  try {
    return parseGitObjectId(value, path);
  } catch {
    return missing(path, value);
  }
}
const optionalObjectId = (
  value: unknown,
  path: string
): T.GitObjectId | null => (value === null ? null : objectId(value, path));
export function nextPageCursor(
  label: string,
  hasNextPage: boolean,
  endCursor: string | null
): string | null {
  if (hasNextPage && !endCursor) missing(`${label}.endCursor`, endCursor);
  return hasNextPage ? endCursor : null;
}
export const MAX_CONNECTION_PAGES = 20;
export const MAX_CONNECTION_ITEMS = 2_000;
export const MAX_REVIEW_BODY_CHARACTERS = 1024 * 1024;
export function assertConnectionWithinBounds(args: {
  readonly label: string;
  readonly pages: number;
  readonly items: number;
  readonly bodyCharacters: number;
}): void {
  if (
    args.pages > MAX_CONNECTION_PAGES ||
    args.items > MAX_CONNECTION_ITEMS ||
    args.bodyCharacters > MAX_REVIEW_BODY_CHARACTERS
  )
    throw new ChecksUnavailable(
      `${args.label} exceeded the bounded read limit (${args.pages} pages, ${args.items} items, ${args.bodyCharacters} body characters)`
    );
}
function enumValue<const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] {
  if (typeof value === "string")
    for (const candidate of values) if (candidate === value) return candidate;
  return missing(path, value);
}
const nullableEnum = <const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] | null => (value === null ? null : enumValue(value, values, path));
const MERGE_STATES = [
  "BEHIND",
  "BLOCKED",
  "CLEAN",
  "CONFLICTING",
  "DIRTY",
  "DRAFT",
  "HAS_HOOKS",
  "UNKNOWN",
  "UNSTABLE",
] as const satisfies readonly T.MergeStateStatus[];
const ROLLUP_STATES = [
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
] as const;
const REVIEW_DECISIONS = [
  "APPROVED",
  "CHANGES_REQUESTED",
  "REVIEW_REQUIRED",
] as const;
// `gh pr view` reports no review decision as "", not null. Only this field does
// it, so the normalization stays here rather than in nullableEnum, where it
// would stop a genuinely unexpected rollup state from failing closed.
const reviewDecision = (value: unknown): T.ReviewDecision =>
  nullableEnum(
    value === "" ? null : value,
    REVIEW_DECISIONS,
    "pull request.reviewDecision"
  );
function parseRemote(value: string): T.Repository | null {
  let normalized = value.trim();
  if (normalized.startsWith("git@github.com:"))
    normalized = `https://github.com/${normalized.slice(15)}`;
  if (normalized.startsWith("ssh://git@github.com/"))
    normalized = `https://github.com/${normalized.slice(21)}`;
  try {
    const url = new URL(normalized);
    const parts = url.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2
    )
      return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}
function parsePrUrl(value: string): T.PrContext {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 4 ||
      parts[2] !== "pull"
    )
      throw new Error("not a canonical GitHub pull URL");
    return {
      owner: parts[0],
      repo: parts[1],
      number: parsePrNumber(Number(parts[3])),
    };
  } catch (error) {
    throw new WatcherQueryError({
      kind: "invalid-context-url",
      retryable: false,
      rawValue: value,
      detail: `could not infer owner/repo from PR URL: ${value} (${error instanceof Error ? error.message : String(error)})`,
    });
  }
}
// The owner-approval gate is excluded from pending everywhere, so the rule has
// one home. Classifying it as pending on either read path makes the watcher
// wait on a human, which is the behaviour #172004 removed from the Python.
function pendingOrGate(
  details: {
    readonly name: string;
    readonly link: string;
  },
  reportedState: string
): T.Check {
  return details.name === "Code Review Gate"
    ? {
        ...details,
        kind: "code-review-gate",
        name: "Code Review Gate",
        reportedState,
      }
    : { ...details, kind: "pending", reportedState };
}

export interface ExactHeadGate {
  readonly identity: string;
  readonly headRefOid: T.GitObjectId;
  readonly check: T.Check;
}
export interface ExactHeadGatePage {
  readonly totalCount: number;
  readonly gates: readonly ExactHeadGate[];
}
export function completeExactHeadGates(args: {
  readonly label: string;
  readonly expectedHeadRefOid: T.GitObjectId;
  readonly pages: readonly ExactHeadGatePage[];
  readonly incompleteAtOrAbove?: number;
}): readonly T.Check[] {
  const first = args.pages[0];
  if (first === undefined) missing(`${args.label}.pages`);
  if (
    !Number.isSafeInteger(first.totalCount) ||
    first.totalCount < 0
  )
    missing(`${args.label}.total_count`, first.totalCount);
  if (
    args.incompleteAtOrAbove !== undefined &&
    first.totalCount >= args.incompleteAtOrAbove
  )
    throw new ChecksUnavailable(
      `${args.label} reported ${first.totalCount} rows at or above its completeness limit`
    );
  const identities = new Set<string>();
  const checks: T.Check[] = [];
  for (const page of args.pages) {
    if (page.totalCount !== first.totalCount)
      missing(`${args.label}.stable total_count`, page.totalCount);
    for (const gate of page.gates) {
      if (gate.headRefOid !== args.expectedHeadRefOid)
        missing(`${args.label}.head_sha`, gate.headRefOid);
      if (!gate.identity || identities.has(gate.identity))
        missing(`${args.label}.unique identity`, gate.identity);
      identities.add(gate.identity);
      checks.push(gate.check);
    }
  }
  if (checks.length !== first.totalCount)
    missing(
      `${args.label}.complete row count`,
      `${checks.length}/${first.totalCount}`
    );
  return checks;
}

function naturalNumber(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) missing(path, value);
  return Number(value);
}
function externalLink(value: unknown, path: string): string {
  if (value === null) return "";
  const candidate = string(value, path);
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    )
      return "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}
function restPages(value: unknown, label: string): readonly unknown[] {
  const pages = list(value, `${label}.pages`);
  if (pages.length === 0) missing(`${label}.pages`);
  return pages;
}
function parseCheckRunPages(
  value: unknown,
  expectedHeadRefOid: T.GitObjectId
): readonly ExactHeadGatePage[] {
  return restPages(value, "check-runs").map((rawPage, pageIndex) => {
    const page = record(rawPage, `check-runs.pages[${pageIndex}]`);
    const totalCount = naturalNumber(
      page.total_count,
      `check-runs.pages[${pageIndex}].total_count`
    );
    const runs = list(
      page.check_runs,
      `check-runs.pages[${pageIndex}].check_runs`
    );
    return {
      totalCount,
      gates: runs.map((rawRun, runIndex) => {
        const path = `check-runs.pages[${pageIndex}].check_runs[${runIndex}]`;
        const run = record(rawRun, path);
        const identity = string(run.node_id, `${path}.node_id`);
        if (!identity) missing(`${path}.node_id`, identity);
        const headRefOid = objectId(run.head_sha, `${path}.head_sha`);
        const details = {
          name: string(run.name, `${path}.name`),
          link: externalLink(run.details_url, `${path}.details_url`),
        };
        const status = enumValue(
          run.status,
          [
            "queued",
            "in_progress",
            "completed",
            "waiting",
            "requested",
            "pending",
          ] as const,
          `${path}.status`
        );
        let check: T.Check;
        if (status !== "completed")
          check = pendingOrGate(details, status.toUpperCase());
        else {
          const conclusion = enumValue(
            run.conclusion,
            [
              "action_required",
              "cancelled",
              "failure",
              "neutral",
              "success",
              "skipped",
              "stale",
              "timed_out",
              "startup_failure",
            ] as const,
            `${path}.conclusion`
          );
          const reportedState = conclusion.toUpperCase();
          check =
            conclusion === "success"
              ? { ...details, kind: "passed", reportedState }
              : conclusion === "neutral" || conclusion === "skipped"
                ? { ...details, kind: "skipped", reportedState }
                : { ...details, kind: "failed", reportedState };
        }
        return { identity: `check-run:${identity}`, headRefOid, check };
      }),
    };
  });
}
function parseStatusPages(
  value: unknown,
  expectedHeadRefOid: T.GitObjectId
): readonly ExactHeadGatePage[] {
  return restPages(value, "commit-statuses").map((rawPage, pageIndex) => {
    const path = `commit-statuses.pages[${pageIndex}]`;
    const page = record(rawPage, path);
    const headRefOid = objectId(page.sha, `${path}.sha`);
    if (headRefOid !== expectedHeadRefOid)
      missing(`${path}.sha`, headRefOid);
    enumValue(
      page.state,
      ["failure", "pending", "success"] as const,
      `${path}.state`
    );
    const totalCount = naturalNumber(page.total_count, `${path}.total_count`);
    return {
      totalCount,
      gates: list(page.statuses, `${path}.statuses`).map(
        (rawStatus, statusIndex) => {
          const statusPath = `${path}.statuses[${statusIndex}]`;
          const status = record(rawStatus, statusPath);
          const identity = string(status.node_id, `${statusPath}.node_id`);
          if (!identity) missing(`${statusPath}.node_id`, identity);
          const details = {
            name: string(status.context, `${statusPath}.context`),
            link: externalLink(status.target_url, `${statusPath}.target_url`),
          };
          const state = enumValue(
            status.state,
            ["error", "failure", "pending", "success"] as const,
            `${statusPath}.state`
          );
          const reportedState = state.toUpperCase();
          const check: T.Check =
            state === "success"
              ? { ...details, kind: "passed", reportedState }
              : state === "pending"
                ? pendingOrGate(details, reportedState)
                : { ...details, kind: "failed", reportedState };
          return {
            identity: `commit-status:${identity}`,
            headRefOid,
            check,
          };
        }
      ),
    };
  });
}

interface ParsedReviewComment extends T.ReviewComment {
  readonly body: string;
}
function parseComment(value: unknown): ParsedReviewComment {
  const object = record(value, "review comment");
  const author =
    object.author === null
      ? null
      : record(object.author, "review comment.author");
  return {
    authorLogin:
      author === null
        ? null
        : optionalString(author.login, "review comment.author.login"),
    body: string(object.body, "review comment.body"),
    path: optionalString(object.path, "review comment.path"),
    line:
      object.line === null
        ? null
        : Number.isInteger(object.line)
          ? Number(object.line)
          : missing("review comment.line", object.line),
    createdAt: string(object.createdAt, "review comment.createdAt"),
  };
}
function isBugbot(comment: ParsedReviewComment | null): boolean {
  if (comment === null) return false;
  const author = (comment.authorLogin ?? "").toLowerCase();
  const body = comment.body.toLowerCase();
  return (
    author.includes("bugbot") ||
    ((author === "cursor" || author === "codex") &&
      [
        "bugbot",
        "cursor_automation_id",
        "codex_automation_id",
        "agentic security review",
        "description start",
        "severity",
      ].some((token) => body.includes(token)))
  );
}
function passKey(comment: ParsedReviewComment | null): string | null {
  if (comment === null) return null;
  for (const pattern of [
    /RUN_ID:\s*([a-zA-Z0-9_.:-]+)/,
    /CURSOR_AUTOMATION_ID:\s*([a-zA-Z0-9_.:-]+)/,
    /CODEX_AUTOMATION_ID:\s*([a-zA-Z0-9_.:-]+)/,
  ]) {
    const match = pattern.exec(comment.body);
    if (match?.[1]) return match[1];
  }
  return null;
}
export interface ParsedReviewThread {
  readonly id: string;
  readonly firstComment: ParsedReviewComment | null;
  readonly resolved: boolean;
}
export interface ReviewThreadPage {
  readonly threads: readonly ParsedReviewThread[];
  readonly endCursor: string | null;
}
export function parseReviewThreadPage(value: unknown): ReviewThreadPage {
  const connection = record(
    at(value, ["data", "repository", "pullRequest", "reviewThreads"]),
    "reviewThreads"
  );
  const nodes = list(
    connection.nodes,
    "reviewThreads.nodes"
  );
  const threads: ParsedReviewThread[] = [];
  for (const node of nodes) {
    const thread = record(node, "review thread");
    if (typeof thread.isResolved !== "boolean")
      missing("review thread.isResolved", thread.isResolved);
    const comments = list(
      at(thread, ["comments", "nodes"]),
      "review thread.comments.nodes"
    );
    threads.push({
      id: string(thread.id, "review thread.id"),
      firstComment: comments.length === 0 ? null : parseComment(comments[0]),
      resolved: thread.isResolved,
    });
  }
  const page = record(connection.pageInfo, "reviewThreads.pageInfo");
  if (typeof page.hasNextPage !== "boolean")
    missing("reviewThreads.pageInfo.hasNextPage", page.hasNextPage);
  const cursor = optionalString(
    page.endCursor,
    "reviewThreads.pageInfo.endCursor"
  );
  return {
    threads,
    endCursor: nextPageCursor(
      "reviewThreads.pageInfo",
      page.hasNextPage,
      cursor
    ),
  };
}
export function finalizeReviewThreads(
  threads: readonly ParsedReviewThread[]
): readonly T.ReviewThread[] {
  const keys = new Set<string>();
  let keyless = false;
  for (const thread of threads) {
    if (!isBugbot(thread.firstComment)) continue;
    const key = passKey(thread.firstComment);
    if (key === null) keyless = true;
    else keys.add(key);
  }
  const passes = keys.size > 0 ? keys.size : keyless ? 1 : 0;
  return threads
    .filter((thread) => !thread.resolved)
    .map(({ id, firstComment }) => {
      const publicComment: T.ReviewComment | null =
        firstComment === null
          ? null
          : {
              authorLogin: firstComment.authorLogin,
              path: firstComment.path,
              line: firstComment.line,
              createdAt: firstComment.createdAt,
            };
      return {
        id,
        firstComment: publicComment,
        isBugbot: isBugbot(firstComment),
        bugbotReviewPasses: passes,
      };
    });
}
export function parseReviewThreads(value: unknown): readonly T.ReviewThread[] {
  return finalizeReviewThreads(parseReviewThreadPage(value).threads);
}
export interface OpenPullRequestPage {
  readonly pulls: readonly T.OpenPullRequest[];
  readonly endCursor: string | null;
  readonly totalCount: number;
}
export function parseOpenPullRequestPage(value: unknown): OpenPullRequestPage {
  const connection = record(
    at(value, ["data", "repository", "pullRequests"]),
    "pullRequests"
  );
  const pulls = list(connection.nodes, "pullRequests.nodes").map(
    (item, index) => {
      const object = record(item, `pullRequests.nodes[${index}]`);
      const headRepository =
        object.headRepository === null
          ? null
          : record(
              object.headRepository,
              `pullRequests.nodes[${index}].headRepository`
            );
      const nameWithOwner =
        headRepository === null
          ? null
          : string(
              headRepository.nameWithOwner,
              `pullRequests.nodes[${index}].headRepository.nameWithOwner`
            );
      const repositoryParts = nameWithOwner?.split("/") ?? [];
      if (nameWithOwner !== null && repositoryParts.length !== 2)
        missing(
          `pullRequests.nodes[${index}].headRepository.nameWithOwner`,
          nameWithOwner
        );
      return {
        number: parsePrNumber(
          object.number,
          `pullRequests.nodes[${index}].number`
        ),
        headRefName: string(
          object.headRefName,
          `pullRequests.nodes[${index}].headRefName`
        ),
        baseRefName: string(
          object.baseRefName,
          `pullRequests.nodes[${index}].baseRefName`
        ),
        headRepository:
          nameWithOwner === null
            ? null
            : { owner: repositoryParts[0], repo: repositoryParts[1] },
      };
    }
  );
  const page = record(connection.pageInfo, "pullRequests.pageInfo");
  if (
    typeof connection.totalCount !== "number" ||
    !Number.isSafeInteger(connection.totalCount) ||
    connection.totalCount < 0
  )
    missing("pullRequests.totalCount", connection.totalCount);
  if (typeof page.hasNextPage !== "boolean")
    missing("pullRequests.pageInfo.hasNextPage", page.hasNextPage);
  const cursor = optionalString(
    page.endCursor,
    "pullRequests.pageInfo.endCursor"
  );
  return {
    pulls,
    totalCount: connection.totalCount,
    endCursor: nextPageCursor(
      "pullRequests.pageInfo",
      page.hasNextPage,
      cursor
    ),
  };
}

export function openPullRequestObservationsAgree(
  left: readonly T.OpenPullRequest[],
  right: readonly T.OpenPullRequest[]
): boolean {
  const fingerprint = (values: readonly T.OpenPullRequest[]): string =>
    JSON.stringify(
      [...values]
        .map((pull) => ({
          number: Number(pull.number),
          headRefName: pull.headRefName,
          baseRefName: pull.baseRefName,
          headRepository:
            pull.headRepository === null
              ? null
              : {
                  owner: pull.headRepository.owner,
                  repo: pull.headRepository.repo,
                },
        }))
        .sort((a, b) => a.number - b.number)
    );
  return fingerprint(left) === fingerprint(right);
}
export function parsePullRequest(
  value: unknown,
  context: T.PrContext
): T.PullRequestFacts {
  const object = record(value, "pull request");
  if (typeof object.isDraft !== "boolean")
    missing("pull request.isDraft", object.isDraft);
  return {
    context,
    mergeable: enumValue(
      object.mergeable,
      ["MERGEABLE", "CONFLICTING", "UNKNOWN"] as const,
      "pull request.mergeable"
    ),
    mergeStateStatus: enumValue(
      object.mergeStateStatus,
      MERGE_STATES,
      "pull request.mergeStateStatus"
    ),
    reviewDecision: reviewDecision(object.reviewDecision),
    headRefOid: optionalObjectId(
      object.headRefOid,
      "pull request.headRefOid"
    ),
    headRefName: string(object.headRefName, "pull request.headRefName"),
    baseRefName: string(object.baseRefName, "pull request.baseRefName"),
    state: enumValue(
      object.state,
      ["OPEN", "CLOSED", "MERGED"] as const,
      "pull request.state"
    ),
    mergedAt: optionalString(object.mergedAt, "pull request.mergedAt"),
    isDraft: object.isDraft,
  };
}
export function githubRepositoryArgument(repository: T.Repository): string {
  return `github.com/${repository.owner}/${repository.repo}`;
}

export function graphqlArgs(
  query: string,
  context: T.PrContext
): [string, ...string[]] {
  return [
    "gh",
    "api",
    "--hostname",
    "github.com",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `owner=${context.owner}`,
    "-f",
    `repo=${context.repo}`,
    "-F",
    `pr=${context.number}`,
  ];
}

export class GhGitHubReader implements T.GitHubReader {
  private deadline: number | null = null;
  constructor(
    private readonly perCommandTimeoutMilliseconds =
      DEFAULT_COMMAND_TIMEOUT_MILLISECONDS,
    private readonly monotonicNow = () => performance.now() / 1_000
  ) {}
  setCommandDeadline(deadline: number | null): void {
    this.deadline = deadline;
  }
  private commandBudgetMilliseconds(): number {
    if (this.deadline === null) return this.perCommandTimeoutMilliseconds;
    return Math.min(
      this.perCommandTimeoutMilliseconds,
      Math.max(0, (this.deadline - this.monotonicNow()) * 1_000)
    );
  }
  private run(argv: readonly [string, ...string[]]): Promise<CommandResult> {
    return runBoundedCommand(argv, this.commandBudgetMilliseconds());
  }
  private runJson(argv: readonly [string, ...string[]]): Promise<unknown> {
    return runJson(argv, this.commandBudgetMilliseconds());
  }
  private runJsonLines(
    argv: readonly [string, ...string[]]
  ): Promise<readonly unknown[]> {
    return runJsonLines(argv, this.commandBudgetMilliseconds());
  }
  async originRepo(): Promise<T.Repository | null> {
    const result = await this.run(["git", "remote", "get-url", "origin"]);
    return result.code === 0 ? parseRemote(result.stdout) : null;
  }
  async currentPr(pr: T.PrNumber | null): Promise<T.PrContext> {
    const argv: [string, ...string[]] = ["gh", "pr", "view"];
    if (pr !== null) argv.push(String(pr));
    argv.push("--json", "number,url");
    const object = record(await this.runJson(argv), "current PR");
    const parsed = parsePrUrl(string(object.url, "current PR.url"));
    return {
      ...parsed,
      number: pr ?? parsePrNumber(object.number, "current PR.number"),
    };
  }
  async pullRequest(context: T.PrContext): Promise<T.PullRequestFacts> {
    return parsePullRequest(
      await this.runJson([
        "gh",
        "pr",
        "view",
        String(context.number),
        "--repo",
        githubRepositoryArgument(context),
        "--json",
        "mergeable,mergeStateStatus,reviewDecision,headRefOid,headRefName,baseRefName,state,mergedAt,isDraft",
      ]),
      context
    );
  }
  async openPullRequests(
    repository: T.Repository
  ): Promise<readonly T.OpenPullRequest[]> {
    const first = await this.readOpenPullRequestsOnce(repository);
    const second = await this.readOpenPullRequestsOnce(repository);
    if (!openPullRequestObservationsAgree(first, second))
      throw new WatcherQueryError({
        kind: "missing-key",
        retryable: true,
        detail:
          "open pull request graph changed while stack discovery was sampled; retrying until two complete observations agree",
      });
    return second;
  }
  private async readOpenPullRequestsOnce(
    repository: T.Repository
  ): Promise<readonly T.OpenPullRequest[]> {
    const pulls: T.OpenPullRequest[] = [];
    const cursors = new Set<string>();
    const pullNumbers = new Set<T.PrNumber>();
    let pageCount = 0;
    let after: string | null = null;
    let totalCount: number | null = null;
    do {
      pageCount += 1;
      assertConnectionWithinBounds({
        label: "open pull requests",
        pages: pageCount,
        items: pulls.length,
        bodyCharacters: 0,
      });
      const argv: [string, ...string[]] = [
        "gh",
        "api",
        "--hostname",
        "github.com",
        "graphql",
        "-f",
        `query=${OPEN_PULL_REQUESTS_QUERY}`,
        "-f",
        `owner=${repository.owner}`,
        "-f",
        `repo=${repository.repo}`,
      ];
      if (after !== null) argv.push("-f", `after=${after}`);
      const page = parseOpenPullRequestPage(await this.runJson(argv));
      if (totalCount === null) totalCount = page.totalCount;
      else if (totalCount !== page.totalCount)
        missing("pullRequests stable totalCount", page.totalCount);
      assertConnectionWithinBounds({
        label: "open pull requests",
        pages: pageCount,
        items: page.totalCount,
        bodyCharacters: 0,
      });
      for (const pull of page.pulls) {
        if (pullNumbers.has(pull.number))
          missing("pullRequests unique pull request number", pull.number);
        pullNumbers.add(pull.number);
        pulls.push(pull);
      }
      assertConnectionWithinBounds({
        label: "open pull requests",
        pages: pageCount,
        items: pulls.length,
        bodyCharacters: 0,
      });
      after = page.endCursor;
      if (after !== null) {
        if (cursors.has(after))
          missing("pullRequests advancing cursor", after);
        cursors.add(after);
      }
    } while (after !== null);
    if (totalCount === null || pulls.length !== totalCount)
      missing("pullRequests complete row count", {
        totalCount,
        rows: pulls.length,
      });
    return pulls;
  }
  async exactHeadChecks(
    context: T.PrContext,
    headRefOid: T.GitObjectId
  ): Promise<T.CheckRead> {
    const repository = `${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}`;
    const ref = encodeURIComponent(headRefOid);
    const restArgs = (
      endpoint: string,
      jq: string
    ): [string, ...string[]] => [
      "gh",
      "api",
      "--hostname",
      "github.com",
      "--paginate",
      "-H",
      "Accept: application/vnd.github+json",
      "-H",
      "X-GitHub-Api-Version: 2022-11-28",
      endpoint,
      "--jq",
      jq,
    ];
    const checkRunPages = parseCheckRunPages(
      await this.runJsonLines(
        restArgs(
          `repos/${repository}/commits/${ref}/check-runs?per_page=100&filter=latest`,
          "{total_count,check_runs:[.check_runs[]|{node_id,head_sha,name,status,conclusion,details_url}]}"
        )
      ),
      headRefOid
    );
    const statusPages = parseStatusPages(
      await this.runJsonLines(
        restArgs(
          `repos/${repository}/commits/${ref}/status?per_page=100`,
          "{sha,state,total_count,statuses:[.statuses[]|{node_id,context,state,target_url}]}"
        )
      ),
      headRefOid
    );
    const checkRuns = completeExactHeadGates({
      label: "check-runs",
      expectedHeadRefOid: headRefOid,
      pages: checkRunPages,
      incompleteAtOrAbove: 1_000,
    });
    const statuses = completeExactHeadGates({
      label: "commit-statuses",
      expectedHeadRefOid: headRefOid,
      pages: statusPages,
    });
    const checks = nonEmpty([...checkRuns, ...statuses]);
    if (checks === null)
      throw new ChecksUnavailable(
        `GitHub REST reported no check runs or commit statuses for ${headRefOid}`
      );
    return {
      source: "rest-commit-gates",
      headRefOid,
      checkRunCount: checkRuns.length,
      statusCount: statuses.length,
      checks,
    };
  }
  async reviewThreads(
    context: T.PrContext
  ): Promise<readonly T.ReviewThread[]> {
    const threads: ParsedReviewThread[] = [];
    const seenCursors = new Set<string>();
    const seenThreadIds = new Set<string>();
    let pageCount = 0;
    let bodyCharacters = 0;
    let after: string | null = null;
    do {
      pageCount += 1;
      assertConnectionWithinBounds({
        label: "review threads",
        pages: pageCount,
        items: threads.length,
        bodyCharacters,
      });
      const argv = graphqlArgs(REVIEW_THREADS_QUERY, context);
      if (after !== null) argv.push("-f", `after=${after}`);
      const page = parseReviewThreadPage(await this.runJson(argv));
      for (const thread of page.threads) {
        if (seenThreadIds.has(thread.id))
          missing("reviewThreads unique thread id", thread.id);
        seenThreadIds.add(thread.id);
        threads.push(thread);
        bodyCharacters += thread.firstComment?.body.length ?? 0;
      }
      assertConnectionWithinBounds({
        label: "review threads",
        pages: pageCount,
        items: threads.length,
        bodyCharacters,
      });
      after = page.endCursor;
      if (after !== null) {
        if (seenCursors.has(after))
          missing("reviewThreads advancing cursor", after);
        seenCursors.add(after);
      }
    } while (after !== null);
    return finalizeReviewThreads(threads);
  }
  async commitRollups(
    context: T.PrContext
  ): Promise<readonly T.CommitRollup[]> {
    const value = await this.runJson(
      graphqlArgs(PR_COMMIT_STATUS_QUERY, context)
    );
    const commits = list(
      at(value, ["data", "repository", "pullRequest", "commits", "nodes"]),
      "commits.nodes"
    );
    return commits.map((item, index) => {
      const commit = record(at(item, ["commit"]), `commits[${index}].commit`);
      const rollup = commit.statusCheckRollup;
      return {
        oid: objectId(commit.oid, `commits[${index}].oid`),
        state:
          rollup === null
            ? null
            : nullableEnum(
                at(rollup, ["state"]),
                ROLLUP_STATES,
                `commits[${index}].statusCheckRollup.state`
              ),
      };
    });
  }
}

export type ContextResolutionPlan =
  | { readonly kind: "explicit"; readonly context: T.PrContext }
  | { readonly kind: "origin-first"; readonly pr: T.PrNumber }
  | { readonly kind: "current-pr"; readonly pr: null };
export function planContextResolution(args: {
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
}): ContextResolutionPlan {
  const hasOwner = args.owner !== null;
  const hasRepo = args.repo !== null;
  if (hasOwner !== hasRepo)
    throw new WatcherQueryError({
      kind: "invalid-context",
      retryable: false,
      detail: "--owner and --repo must be supplied together",
    });
  if (hasOwner && args.pr === null)
    throw new WatcherQueryError({
      kind: "invalid-context",
      retryable: false,
      detail:
        "an explicit --owner/--repo requires --pr or --stack-prs; refusing to reuse an inferred local PR number in another repository",
    });
  if (args.pr !== null && args.owner !== null && args.repo !== null)
    return {
      kind: "explicit",
      context: { owner: args.owner, repo: args.repo, number: args.pr },
    };
  return args.pr === null
    ? { kind: "current-pr", pr: null }
    : { kind: "origin-first", pr: args.pr };
}
export async function resolveContext(args: {
  readonly reader: T.GitHubReader;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
}): Promise<T.PrContext> {
  const plan = planContextResolution(args);
  if (plan.kind === "explicit") return plan.context;
  if (plan.kind === "origin-first") {
    const origin = await args.reader.originRepo();
    if (origin !== null)
      return {
        ...origin,
        number: plan.pr,
      };
  }
  return args.reader.currentPr(plan.pr);
}
export function orderStack(
  context: T.PrContext,
  open: readonly T.OpenPullRequest[]
): T.NonEmpty<T.PrContext> {
  const source = open.find((pr) => pr.number === context.number);
  if (source === undefined)
    throw new WatcherQueryError({
      kind: "invalid-context",
      retryable: false,
      detail:
        "automatic stack discovery cannot prove a stack from a seed that is not open; pass an explicit --stack-prs list",
    });
  const sameRepository = (pr: T.OpenPullRequest): boolean =>
    pr.headRepository?.owner.toLowerCase() === context.owner.toLowerCase() &&
    pr.headRepository.repo.toLowerCase() === context.repo.toLowerCase();
  const rejectForkEdge = (): never => {
    throw new WatcherQueryError({
      kind: "invalid-context",
      retryable: false,
      detail:
        "automatic stack discovery found a reachable fork edge; pass an explicit --stack-prs list",
    });
  };
  if (!sameRepository(source)) rejectForkEdge();
  const byHead = new Map<string, T.OpenPullRequest[]>();
  const children = new Map<string, T.OpenPullRequest[]>();
  for (const pr of open) {
    byHead.set(pr.headRefName, [...(byHead.get(pr.headRefName) ?? []), pr]);
    children.set(pr.baseRefName, [...(children.get(pr.baseRefName) ?? []), pr]);
  }
  for (const [headRefName, pulls] of byHead)
    if (pulls.filter(sameRepository).length > 1)
      throw new WatcherQueryError({
        kind: "invalid-context",
        retryable: false,
        detail: `duplicate head branch prevents safe stack discovery: ${headRefName}`,
      });
  let root = source;
  const ancestry = new Set<T.PrNumber>([source.number]);
  while (true) {
    const parents = byHead.get(root.baseRefName) ?? [];
    if (parents.length === 0) break;
    if (parents.length > 1)
      throw new WatcherQueryError({
        kind: "invalid-context",
        retryable: false,
        detail: `duplicate head branch prevents safe stack discovery: ${root.baseRefName}`,
      });
    const parent = parents[0];
    if (!sameRepository(parent)) rejectForkEdge();
    if (ancestry.has(parent.number))
      throw new WatcherQueryError({
        kind: "invalid-context",
        retryable: false,
        detail: `stack branch cycle detected at PR #${parent.number}`,
      });
    ancestry.add(parent.number);
    root = parent;
  }
  const ordered: T.OpenPullRequest[] = [];
  const seen = new Set<T.PrNumber>();
  let current: T.OpenPullRequest | null = root;
  while (current !== null) {
    if (seen.has(current.number))
      throw new WatcherQueryError({
        kind: "invalid-context",
        retryable: false,
        detail: `stack branch cycle detected at PR #${current.number}`,
      });
    seen.add(current.number);
    ordered.push(current);
    const next: readonly T.OpenPullRequest[] =
      children.get(current.headRefName) ?? [];
    if (next.length > 1)
      throw new WatcherQueryError({
        kind: "invalid-context",
        retryable: false,
        detail: `stack branches at ${current.headRefName}; pass an explicit --stack-prs list`,
      });
    const child: T.OpenPullRequest | undefined = next[0];
    if (child !== undefined && !sameRepository(child)) rejectForkEdge();
    current = child ?? null;
  }
  return (
    nonEmpty(
      ordered.map((pr) => ({
        ...context,
        number: pr.number,
      }))
    ) ?? [context]
  );
}
export async function discoverStack(
  reader: T.GitHubReader,
  context: T.PrContext
): Promise<T.NonEmpty<T.PrContext>> {
  return orderStack(context, await reader.openPullRequests(context));
}

export async function assertStackContextsCurrent(
  reader: T.GitHubReader,
  contexts: T.NonEmpty<T.PrContext>
): Promise<void> {
  const current = await discoverStack(reader, contexts[0]);
  const expected = contexts.map(
    (context) => `${context.owner.toLowerCase()}/${context.repo.toLowerCase()}#${context.number}`
  );
  const observed = current.map(
    (context) => `${context.owner.toLowerCase()}/${context.repo.toLowerCase()}#${context.number}`
  );
  if (
    expected.length !== observed.length ||
    expected.some((value, index) => value !== observed[index])
  )
    throw new WatcherQueryError({
      kind: "missing-key",
      retryable: true,
      detail:
        "connected stack changed after readiness sampling; retrying against a fresh complete graph",
    });
}
