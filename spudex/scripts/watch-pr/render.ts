import type * as T from "./types.ts";
export const MAX_REMOTE_STRING_CHARACTERS = 512;
export const MAX_JSON_OUTPUT_BYTES = 256 * 1024;
export const MAX_PRETTY_OUTPUT_CHARACTERS = 64 * 1024;
const MAX_OUTPUT_ARRAY_ITEMS = 100;
const MAX_OUTPUT_DEPTH = 32;
const OSC_ESCAPE = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
const CSI_ESCAPE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/g;
const SHORT_ESCAPE = /\u001B[@-_]/g;
const UNSAFE_CONTROLS =
  /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
/** Keep pretty output single-line and inert in terminals and Markdown tables. */
export function sanitizePrettyValue(
  value: unknown,
  maxCharacters = MAX_REMOTE_STRING_CHARACTERS
): string {
  return String(value)
    .replace(OSC_ESCAPE, "")
    .replace(CSI_ESCAPE, "")
    .replace(SHORT_ESCAPE, "")
    .replace(UNSAFE_CONTROLS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxCharacters);
}
function safeLink(value: string): string {
  const sanitized = sanitizePrettyValue(value);
  if (!sanitized) return "";
  try {
    const url = new URL(sanitized);
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
interface ProjectionState {
  readonly redactedFields: Set<string>;
  omittedItems: number;
  truncatedValues: number;
}
const OMITTED_FIELDS = new Set(["all", "description", "workflow", "rawValue"]);
function projectForOutput(
  value: unknown,
  key: string,
  depth: number,
  state: ProjectionState
): unknown {
  if (depth > MAX_OUTPUT_DEPTH) {
    state.truncatedValues += 1;
    return "[depth limit]";
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string")
    return key === "link" ? safeLink(value) : sanitizePrettyValue(value);
  if (Array.isArray(value)) {
    const shown = value.slice(0, MAX_OUTPUT_ARRAY_ITEMS);
    state.omittedItems += value.length - shown.length;
    return shown.map((item) => projectForOutput(item, "", depth + 1, state));
  }
  if (typeof value !== "object") return null;
  const projected: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (childKey === "body") {
      state.redactedFields.add(childKey);
      continue;
    }
    if (OMITTED_FIELDS.has(childKey)) {
      state.redactedFields.add(childKey);
      continue;
    }
    projected[childKey] = projectForOutput(
      childValue,
      childKey,
      depth + 1,
      state
    );
  }
  return projected;
}
export function renderJson(verdict: T.WatcherVerdict): string {
  const state: ProjectionState = {
    redactedFields: new Set(),
    omittedItems: 0,
    truncatedValues: 0,
  };
  const projected = projectForOutput(verdict, "", 0, state);
  if (typeof projected !== "object" || projected === null || Array.isArray(projected))
    throw new Error("watcher verdict projection must remain an object");
  if (
    state.redactedFields.size > 0 ||
    state.omittedItems > 0 ||
    state.truncatedValues > 0
  )
    Object.assign(projected, {
      outputPolicy: {
        redactedFields: [...state.redactedFields].sort(),
        omittedItems: state.omittedItems,
        truncatedValues: state.truncatedValues,
      },
    });
  const rendered = `${JSON.stringify(projected)}\n`;
  const bytes = Buffer.byteLength(rendered);
  if (bytes <= MAX_JSON_OUTPUT_BYTES) return rendered;
  const fallback = {
    schemaVersion: verdict.schemaVersion,
    sequence: verdict.sequence,
    observedAt: sanitizePrettyValue(verdict.observedAt),
    mode: verdict.mode,
    kind: verdict.kind,
    terminal: verdict.terminal,
    ...(verdict.terminal ? { exitCode: verdict.exitCode } : {}),
    ...(verdict.kind === "BLOCKER"
      ? { blockerKind: verdict.blocker.kind }
      : {}),
    outputPolicy: {
      truncated: true,
      reason: "output-limit",
      maxBytes: MAX_JSON_OUTPUT_BYTES,
      originalBytes: bytes,
    },
  };
  return `${JSON.stringify(fallback)}\n`;
}
function ciCell(row: T.PrSnapshot): string {
  if (row.kind !== "open") return "n/a";
  const was = row.ci.hadPreviousPassingCi ? ", was ✅" : "";
  switch (row.ci.kind) {
    case "ci-clean":
      return "✅";
    case "ci-pending":
      return `⏳ ${row.ci.pending.length} pending${was}`;
    case "ci-failing":
      return `❌ ${row.ci.failed.length} failed${row.ci.pending.length ? `, ${row.ci.pending.length} pending` : ""}${was}`;
    case "ci-github-rejected":
      return `❌ GitHub reports failing checks${was}`;
    default: {
      const exhaustive: never = row.ci;
      return exhaustive;
    }
  }
}
function reviewCell(row: T.PrSnapshot): string {
  if (row.kind !== "open") return "n/a";
  const open = row.threads.length;
  return row.reviewAutomationRunning
    ? open
      ? `🤖 running, ${open} open`
      : "🤖 running"
    : open
      ? `📝 ${open} open`
      : "✅";
}
function mergeCell(row: T.PrSnapshot): string {
  if (row.kind === "merged") return "✅ merged";
  if (row.kind === "closed") return "❌ closed";
  if (row.facts.isDraft) return "⏸ draft";
  if (row.facts.reviewDecision === "CHANGES_REQUESTED")
    return "⚠️ changes requested";
  if (row.facts.reviewDecision === "REVIEW_REQUIRED")
    return "⏸ review required";
  if (row.facts.mergeable === "UNKNOWN") return "⏸ mergeability unknown";
  if (
    row.facts.mergeable === "CONFLICTING" ||
    row.facts.mergeStateStatus === "DIRTY" ||
    row.facts.mergeStateStatus === "CONFLICTING"
  )
    return "⚠️ conflict";
  return row.facts.mergeStateStatus === "CLEAN"
    ? "✅"
    : `⏸ GitHub ${row.facts.mergeStateStatus.toLowerCase()}`;
}
export function renderStatusTable(rows: T.NonEmpty<T.PrSnapshot>): string {
  const lines = ["| PR | CI | Review | Merge |", "| --- | --- | --- | --- |"];
  for (const row of rows) {
    const url = `https://github.com/${encodeURIComponent(row.context.owner)}/${encodeURIComponent(row.context.repo)}/pull/${row.context.number}`;
    lines.push(
      `| [#${row.context.number}](${url}) | ${ciCell(row)} | ${reviewCell(row)} | ${mergeCell(row)} |`
    );
  }
  return `${lines.join("\n")}\n`;
}
function threadLine(thread: T.ReviewThread): string {
  const comment = thread.firstComment;
  return [
    sanitizePrettyValue(thread.id),
    sanitizePrettyValue(comment?.path ?? "None"),
    comment?.line ?? "None",
    sanitizePrettyValue(comment?.authorLogin ?? "None"),
    `isBugBot=${thread.isBugbot}`,
    `bugbotReviewPasses=${thread.bugbotReviewPasses}`,
    `createdAt=${sanitizePrettyValue(comment?.createdAt ?? "None")}`,
  ].join(" ");
}
type StatusQueryBlocker = {
  readonly kind: "status-query";
  readonly failures: number;
  readonly failure: { readonly detail: string };
};
function renderBlocker(blocker: T.MergeBlocker | StatusQueryBlocker): string {
  switch (blocker.kind) {
    case "merge-conflicts":
      return [
        "BLOCKER: merge-conflicts",
        `pr=${blocker.pr.number}`,
        `mergeable=${blocker.facts.mergeable}`,
        `mergeStateStatus=${blocker.facts.mergeStateStatus}`,
        "action=resolve merge conflicts before waiting for CI",
      ].join("\n");
    case "review-threads":
      return [
        "BLOCKER: review-threads",
        `pr=${blocker.pr.number}`,
        `unresolved=${blocker.threads.length}`,
        ...blocker.threads.map(threadLine),
      ].join("\n");
    case "failing-checks": {
      const failed = blocker.ci.kind === "ci-failing" ? blocker.ci.failed : [];
      const details = failed.map(
        (check) =>
          `${sanitizePrettyValue(check.name)} ${sanitizePrettyValue(check.reportedState)} ${safeLink(check.link)}`
      );
      if (blocker.ci.kind === "ci-github-rejected")
        details.push(
          `mergeStateStatus=${blocker.ci.github.mergeStateStatus}`,
          `headGateState=${blocker.ci.github.headGateState}`
        );
      return [
        "BLOCKER: failing-checks",
        `pr=${blocker.pr.number}`,
        `failed=${failed.length}`,
        ...details,
      ].join("\n");
    }
    case "merge-gate": {
      const actions: Record<T.MergeGateReason, string> = {
        "closed-without-merge":
          "restore or remove the closed PR from the queued stack",
        "draft-pr":
          "mark the PR ready for review before waiting for the merge queue",
        "changes-requested":
          "resolve the changes-requested review before waiting for the merge queue",
        "review-required": "obtain the required review before merging",
        "mergeability-unknown":
          "wait for GitHub to compute mergeability, then query again",
        "head-sha-unavailable":
          "wait for GitHub to report the pull request head SHA, then query again",
      };
      const action = actions[blocker.reason];
      return [
        `BLOCKER: ${blocker.reason}`,
        `pr=${blocker.pr.number}`,
        `action=${action}`,
      ].join("\n");
    }
    case "status-query":
      return [
        "BLOCKER: status-query",
        `failures=${blocker.failures}`,
        `detail=${sanitizePrettyValue(blocker.failure.detail)}`,
        "action=verify current PR context, GitHub authentication, and API availability, then rearm",
      ].join("\n");
    default: {
      const exhaustive: never = blocker;
      return exhaustive;
    }
  }
}
const verdictHead = (pr: T.ReadyPr | T.MergedPr): string =>
  pr.kind === "ready-pr" ? pr.proof.headRefOid : pr.headRefOid;
function renderPrettyUnbounded(verdict: T.WatcherVerdict): string {
  switch (verdict.kind) {
    case "QUEUE":
      return `QUEUE: captured ${verdict.queue.length} PR${verdict.queue.length === 1 ? "" : "s"} bottom-to-top: ${verdict.queue.map((pr) => `#${pr.number}`).join(",")}\n`;
    case "STATUS":
      return renderStatusTable(verdict.rows);
    case "WAITING":
      return verdict.reason.kind === "pending-checks"
        ? `WAITING: frontier=#${verdict.frontier.number}; ${verdict.reason.pending.length} check${verdict.reason.pending.length === 1 ? "" : "s"} pending\n`
        : `WAITING: frontier=#${verdict.frontier.number} is blocker-free; waiting for merge queue (${verdict.reason.unmergedCount} PR${verdict.reason.unmergedCount === 1 ? "" : "s"} unmerged)\n`;
    case "ADVANCE":
      return `ADVANCE: merged #${verdict.merged.number}; next=#${verdict.frontier.number}; remaining=${verdict.remaining}\n`;
    case "RETRY":
      return `RETRY: GitHub status query failed; retrying in ${verdict.retryInSeconds}s\ndetail=${sanitizePrettyValue(verdict.failure.detail)}\n`;
    case "BLOCKER":
      return `${renderBlocker(verdict.blocker)}\n`;
    case "READY": {
      const detail =
        verdict.scope.kind === "single" && verdict.scope.pr.kind === "ready-pr"
          ? `\nheadRefOid=${sanitizePrettyValue(verdict.scope.pr.proof.headRefOid)}\ncheckRuns=${verdict.scope.pr.proof.ci.checkRunCount}\ncommitStatuses=${verdict.scope.pr.proof.ci.statusCount}\nmergeStateStatus=${verdict.scope.pr.proof.ci.github.mergeStateStatus}\nreviewDecision=${verdict.scope.pr.proof.gate.reviewDecision}\nisDraft=${verdict.scope.pr.proof.gate.draft === "draft-allowed"}${verdict.scope.pr.proof.gate.draft === "draft-allowed" ? "\nnote=draft allowed (--allow-draft); leave it as a draft; do not mark ready" : ""}`
          : verdict.scope.kind === "single"
            ? `\nheadRefOid=${sanitizePrettyValue(verdictHead(verdict.scope.pr))}`
            : `\nheads=${verdict.scope.prs.map((pr) => `#${pr.context.number}:${sanitizePrettyValue(verdictHead(pr))}`).join(",")}`;
      return `READY: no merge conflicts, no unresolved review threads, no failing or pending checks${detail}\n`;
    }
    case "COMPLETE":
      return `COMPLETE: queued stack merged (${verdict.queue.length} PR${verdict.queue.length === 1 ? "" : "s"})\nheads=${verdict.merged.map((pr) => `#${pr.context.number}:${sanitizePrettyValue(pr.headRefOid)}`).join(",")}\n`;
    case "TIMEOUT":
      if (verdict.reason.kind === "pending-checks")
        return "TIMEOUT: checks still pending\n";
      if (verdict.reason.kind === "status-unavailable")
        return "TIMEOUT: GitHub status remained unavailable\n";
      if (verdict.reason.kind === "deadline")
        return "TIMEOUT: watcher deadline reached\n";
      return `TIMEOUT: queued stack still has ${verdict.reason.unmergedCount} PR${verdict.reason.unmergedCount === 1 ? "" : "s"} unmerged; frontier=#${verdict.reason.frontier.number}\n`;
    default: {
      const exhaustive: never = verdict;
      return exhaustive;
    }
  }
}
export function renderPretty(verdict: T.WatcherVerdict): string {
  const rendered = renderPrettyUnbounded(verdict);
  if (rendered.length <= MAX_PRETTY_OUTPUT_CHARACTERS) return rendered;
  const marker = "\nOUTPUT TRUNCATED: render limit reached\n";
  return `${rendered.slice(0, MAX_PRETTY_OUTPUT_CHARACTERS - marker.length)}${marker}`;
}
