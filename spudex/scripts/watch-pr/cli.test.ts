import { describe, expect, it } from "bun:test";
import {
  MAX_EXPLICIT_STACK_PRS,
  MAX_STACK_PRS_ARGUMENT_BYTES,
  MAX_TIMER_SECONDS,
  parseArgs,
  selectCliExecution,
} from "./cli.ts";
import { assessGitHubMerge } from "./policy.ts";
import {
  renderJson,
  renderPretty,
  sanitizePrettyValue,
  MAX_JSON_OUTPUT_BYTES,
} from "./render.ts";
import type { CliOptions } from "./cli.ts";
import type { WatcherVerdict } from "./types.ts";
import { parseGitObjectId, parsePrNumber } from "./types.ts";

async function runExecutable(
  argv: readonly string[]
): Promise<{
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const executable = new URL("./watch-pr", import.meta.url).pathname;
  const child = Bun.spawn([process.execPath, executable, ...argv], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

describe("parseArgs", () => {
  it("uses the specified defaults", () => {
    expect(parseArgs([])).toMatchObject({
      owner: null,
      repo: null,
      pr: null,
      mode: "single",
      stackPrs: [],
      statusOnly: false,
      pretty: false,
      polling: {
        interval: 60,
        sweepInterval: 300,
        timeout: 0,
        maxQueryErrors: 5,
        allowDraft: false,
      },
    });
  });

  it("parses a frozen queued stack bottom-to-top", () => {
    const parsed = parseArgs([
      "--queued-stack",
      "--stack-prs",
      "#10, 11,#12",
      "--interval",
      "2.5",
      "--sweep-interval",
      "30",
      "--timeout",
      "15",
      "--max-query-errors",
      "3",
      "--allow-draft",
      "--pretty",
    ]);
    expect(parsed.mode).toBe("queued-stack");
    expect(parsed.stackPrs.map(Number)).toEqual([10, 11, 12]);
    expect(parsed.polling).toEqual({
      interval: 2.5,
      sweepInterval: 30,
      timeout: 15,
      maxQueryErrors: 3,
      allowDraft: true,
    });
    expect(parsed.pretty).toBe(true);
  });

  it("bounds an explicit queued stack before execution", () => {
    const tooMany = Array.from(
      { length: MAX_EXPLICIT_STACK_PRS + 1 },
      (_, index) => String(index + 1)
    ).join(",");
    expect(() =>
      parseArgs(["--queued-stack", "--stack-prs", tooMany])
    ).toThrow(`at most ${MAX_EXPLICIT_STACK_PRS} PRs`);
    expect(() =>
      parseArgs([
        "--queued-stack",
        "--stack-prs",
        "1".repeat(MAX_STACK_PRS_ARGUMENT_BYTES + 1),
      ])
    ).toThrow(`must not exceed ${MAX_STACK_PRS_ARGUMENT_BYTES} bytes`);
  });

  it("rejects every invalid mode and numeric shape as usage", async () => {
    const invalid = [
      ["--unknown"],
      ["--interval", "0"],
      ["--interval", "5e-324"],
      ["--interval", "1e308"],
      ["--interval", String(MAX_TIMER_SECONDS + 1)],
      ["--sweep-interval", "-1"],
      ["--timeout", "-1"],
      ["--timeout", "0.5"],
      ["--max-query-errors", "1.5"],
      ["--max-query-errors", String(Number.MAX_SAFE_INTEGER + 1)],
      ["--pr", String(Number.MAX_SAFE_INTEGER + 1)],
      ["--stack", "--queued-stack"],
      ["--stack-prs", "1,2"],
      ["--queued-stack", "--stack-prs", "1,1"],
    ];
    for (const argv of invalid) {
      const result = await runExecutable(argv);
      expect(result.code).toBe(64);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("error:");
    }
  });
});

describe("rendering", () => {
  const context = {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const status = {
    schemaVersion: 1,
    sequence: 1,
    observedAt: "2026-07-26T00:00:00.000Z",
    mode: "single",
    kind: "STATUS",
    terminal: true,
    exitCode: 0,
    reason: "status-only",
    rows: [
      {
        kind: "merged",
        context,
        facts: {
          context,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          reviewDecision: "APPROVED",
          headRefOid: parseGitObjectId("a".repeat(40)),
          headRefName: "feature",
          baseRefName: "main",
          state: "MERGED",
          mergedAt: "now",
          isDraft: false,
        },
      },
    ],
  } satisfies WatcherVerdict;

  it("emits compact valid JSON by default", () => {
    const rendered = renderJson(status);
    expect(rendered.endsWith("\n")).toBe(true);
    expect(JSON.parse(rendered)).toEqual(status);
  });

  it("renders the Markdown table from the same verdict only", () => {
    const rendered = renderPretty(status);
    expect(rendered).toContain("| PR | CI | Review | Merge |");
    expect(rendered).toContain(
      "| [#1](https://github.com/owner/repo/pull/1) | n/a | n/a | ✅ merged |"
    );
    expect(sanitizePrettyValue("ok\u001b]0;owned\u0007\u001b[31m\nnext")).toBe(
      "ok next"
    );
    expect(sanitizePrettyValue("ok\u061c\u200e\u200fnext")).toBe("ok next");
    const reviewBlocker = {
      schemaVersion: 1,
      sequence: 2,
      observedAt: "2026-07-26T00:00:00.000Z",
      mode: "single",
      kind: "BLOCKER",
      terminal: true,
      exitCode: 3,
      blocker: {
        kind: "review-threads",
        pr: context,
        threads: [
          {
            id: "thread\u001b[31m",
            firstComment: {
              authorLogin: "reviewer",
              path: `src/${"x".repeat(1_000_000)}`,
              line: 7,
              createdAt: "2026-07-26T00:00:00.000Z",
            },
            isBugbot: false,
            bugbotReviewPasses: 0,
          },
        ],
      },
    } satisfies WatcherVerdict;
    const json = renderJson(reviewBlocker);
    const projected = JSON.parse(json);
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(MAX_JSON_OUTPUT_BYTES);
    expect(json).not.toContain('"body":');
    expect(projected.blocker.threads[0].firstComment.path.length).toBeLessThanOrEqual(
      512
    );
    const prettyBlocker = renderPretty(reviewBlocker);
    expect(prettyBlocker).toContain("createdAt=");
    expect(prettyBlocker).not.toContain("body");
    expect(prettyBlocker).not.toContain("\u001b[31m");

    const linkVerdict = {
      schemaVersion: 1,
      sequence: 3,
      observedAt: "2026-07-26T00:00:00.000Z",
      mode: "single",
      kind: "WAITING",
      terminal: false,
      frontier: context,
      reason: {
        kind: "pending-checks",
        pending: [
          {
            kind: "pending",
            name: "signed-link",
            reportedState: "PENDING",
            link: "https://example.com/run?token=secret#fragment",
          },
          {
            kind: "pending",
            name: "credential-link",
            reportedState: "PENDING",
            link: "https://user:password@example.com/run",
          },
        ],
      },
    } satisfies WatcherVerdict;
    const projectedLinks = JSON.parse(renderJson(linkVerdict));
    expect(projectedLinks.reason.pending[0].link).toBe(
      "https://example.com/run"
    );
    expect(projectedLinks.reason.pending[1].link).toBe("");
    expect(renderJson(linkVerdict)).not.toContain("secret");
    expect(renderJson(linkVerdict)).not.toContain("password");
  });
});

describe("main executable contract", () => {
  it("returns EX_USAGE 64 and writes usage errors only to stderr", async () => {
    const result = await runExecutable(["--interval", "0"]);
    expect(result.code).toBe(64);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "option '--interval <seconds>' argument '0' is invalid"
    );
  });

  it("bypasses the queue machine for queued-stack status-only", () => {
    const options = parseArgs([
      "--queued-stack",
      "--stack-prs",
      "1",
      "--status-only",
    ]);
    expect(selectCliExecution(options)).toBe("simple");
    expect(
      selectCliExecution({ ...options, statusOnly: false } satisfies CliOptions)
    ).toBe("queued");
  });

  it("returns exit 4 for a hidden GitHub-side CI refusal", () => {
    expect(
      assessGitHubMerge({
        mergeStateStatus: "BLOCKED",
        headGateState: "SUCCESS",
        draftAllowed: false,
      })
    ).toMatchObject({ kind: "refused", reason: "merge-state" });
    const verdict = {
      schemaVersion: 1,
      sequence: 1,
      observedAt: "2026-07-26T00:00:00.000Z",
      mode: "single",
      kind: "BLOCKER",
      terminal: true,
      exitCode: 4,
      blocker: {
        kind: "failing-checks",
        pr: { owner: "owner", repo: "repo", number: parsePrNumber(1) },
        ci: {
          kind: "ci-github-rejected",
          source: "rest-commit-gates",
          headRefOid: parseGitObjectId("b".repeat(40)),
          checkRunCount: 1,
          statusCount: 0,
          all: [
            {
              kind: "passed",
              name: "ci",
              reportedState: "SUCCESS",
              link: "",
            },
          ],
          failed: [],
          pending: [],
          hadPreviousPassingCi: false,
          github: {
            kind: "refused",
            reason: "merge-state",
            mergeStateStatus: "BLOCKED",
            headGateState: "SUCCESS",
          },
        },
      },
    } satisfies WatcherVerdict;
    expect(verdict.exitCode).toBe(4);
    expect(JSON.parse(renderJson(verdict))).toMatchObject({
      kind: "BLOCKER",
      blocker: { ci: { kind: "ci-github-rejected" } },
    });
    expect(JSON.parse(renderJson(verdict)).blocker.ci.all).toBeUndefined();
  });

  it("shows help without touching GitHub", async () => {
    const result = await runExecutable(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("JSON (NDJSON while polling)");
    expect(result.stderr).toBe("");
  });
});
