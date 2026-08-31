import { describe, expect, it } from "bun:test";
import {
  applyQueueSnapshot,
  assessGitHubMerge,
  classifyPr,
  createQueueState,
  deadlinePassed,
  evaluateQueue,
  openObservationsAgree,
  planQueue,
  planSnapshotAfterFacts,
  queryBackoffSeconds,
  queueCadence,
  queueReadContext,
  resolveCiState,
  selectTierMajorStackDecision,
} from "./policy.ts";
import type {
  Check,
  CheckRead,
  CiClean,
  CiFailing,
  CiPending,
  CiState,
  GitHubMergeAllowed,
  GitHubMergeRefusal,
  NonEmpty,
  PollingOptions,
  PrContext,
  PrSnapshot,
  PullRequestFacts,
} from "./types.ts";
import { parseGitObjectId, parsePrNumber } from "./types.ts";

const options = {
  interval: 10,
  sweepInterval: 300,
  timeout: 0,
  maxQueryErrors: 5,
  allowDraft: false,
} satisfies PollingOptions;
const context = (number: number): PrContext => ({
  owner: "example",
  repo: "project",
  number: parsePrNumber(number),
});
const headRefOid = parseGitObjectId("a".repeat(40));
const passed = (name = "build"): Check => ({
  kind: "passed",
  name,
  reportedState: "SUCCESS",
  link: "",
});
const pending = (name = "build"): Extract<Check, { kind: "pending" }> => ({
  kind: "pending",
  name,
  reportedState: "PENDING",
  link: "",
});
const failed = (name = "build"): Extract<Check, { kind: "failed" }> => ({
  kind: "failed",
  name,
  reportedState: "FAILURE",
  link: "",
});
const allowed: GitHubMergeAllowed = {
  kind: "allowed",
  basis: "merge-state-and-rest-gates",
  mergeStateStatus: "CLEAN",
  headGateState: "SUCCESS",
};
const refused: GitHubMergeRefusal = {
  kind: "refused",
  reason: "merge-state",
  mergeStateStatus: "BLOCKED",
  headGateState: "SUCCESS",
};
const read = (check: Check): CheckRead => ({
  source: "rest-commit-gates",
  headRefOid,
  checkRunCount: 1,
  statusCount: 0,
  checks: [check],
});
const cleanCi = (): CiClean => ({
  kind: "ci-clean",
  source: "rest-commit-gates",
  headRefOid,
  checkRunCount: 1,
  statusCount: 0,
  all: [passed()],
  failed: [],
  pending: [],
  hadPreviousPassingCi: false,
  github: allowed,
});
const pendingCi = (name = "build"): CiPending => {
  const check = pending(name);
  return {
    kind: "ci-pending",
    source: "rest-commit-gates",
    headRefOid,
    checkRunCount: 1,
    statusCount: 0,
    all: [check],
    failed: [],
    pending: [check],
    hadPreviousPassingCi: false,
  };
};
const failingCi = (): CiFailing => {
  const check = failed();
  return {
    kind: "ci-failing",
    source: "rest-commit-gates",
    headRefOid,
    checkRunCount: 1,
    statusCount: 0,
    all: [check],
    failed: [check],
    pending: [],
    hadPreviousPassingCi: false,
    github: refused,
  };
};
function facts(
  value: PrContext,
  overrides: Partial<PullRequestFacts> = {}
): PullRequestFacts {
  return {
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid,
    headRefName: `feature-${value.number}`,
    baseRefName: "main",
    state: "OPEN",
    mergedAt: null,
    isDraft: false,
    ...overrides,
    context: value,
  };
}
function open(
  number: number,
  config: { readonly ci?: CiState; readonly facts?: Partial<PullRequestFacts> } = {}
): Extract<PrSnapshot, { kind: "open" }> {
  const value = context(number);
  return {
    kind: "open",
    context: value,
    facts: facts(value, config.facts),
    threads: [],
    ci: config.ci ?? cleanCi(),
    reviewAutomationRunning: false,
  };
}
function merged(
  number: number,
  overrides: Partial<PullRequestFacts> = {}
): PrSnapshot {
  const value = context(number);
  return {
    kind: "merged",
    context: value,
    facts: facts(value, {
      state: "MERGED",
      mergedAt: "2026-08-31T00:00:00.000Z",
      ...overrides,
    }),
  };
}

describe("readiness truth table", () => {
  it("covers every fail-closed merge-state and exact-head gate row", () => {
    const cases: readonly [
      PullRequestFacts["mergeStateStatus"],
      "FAILURE" | "PENDING" | "SUCCESS",
      "allowed" | "refused",
    ][] = [
      ["BLOCKED", "FAILURE", "refused"],
      ["BLOCKED", "PENDING", "refused"],
      ["BLOCKED", "SUCCESS", "refused"],
      ["UNSTABLE", "SUCCESS", "refused"],
      ["UNKNOWN", "FAILURE", "refused"],
      ["UNKNOWN", "PENDING", "refused"],
      ["UNKNOWN", "SUCCESS", "refused"],
      ["CLEAN", "FAILURE", "refused"],
      ["CLEAN", "PENDING", "refused"],
      ["CLEAN", "SUCCESS", "allowed"],
    ];
    for (const [mergeStateStatus, headGateState, expected] of cases)
      expect(
        assessGitHubMerge({
          mergeStateStatus,
          headGateState,
          draftAllowed: false,
        }).kind
      ).toBe(expected);
  });
  it("turns clean visible checks plus GitHub refusal into a CI blocker", () => {
    const resolved = resolveCiState({
      checks: read(passed()),
      pendingHistory: "omit",
      merge: { hadPreviousPassingCi: false, github: refused },
    });
    if (resolved.kind !== "complete") throw new Error("expected complete CI");
    expect(classifyPr(open(1, { ci: resolved.ci }))).toMatchObject({
      kind: "blocker",
      blocker: { kind: "failing-checks" },
    });
  });
});

describe("snapshot query planning", () => {
  it("does not require merge evidence while queued checks are pending", () => {
    expect(
      resolveCiState({ checks: read(pending()), pendingHistory: "omit" })
    ).toMatchObject({
      kind: "complete",
      ci: { kind: "ci-pending", hadPreviousPassingCi: false },
    });
  });
  it("requires merge evidence for settled and failed lists", () => {
    expect(
      resolveCiState({ checks: read(passed()), pendingHistory: "omit" }).kind
    ).toBe("needs-merge-evidence");
    expect(
      resolveCiState({ checks: read(failed()), pendingHistory: "omit" }).kind
    ).toBe("needs-merge-evidence");
    expect(
      resolveCiState({
        checks: read(pending()),
        pendingHistory: "include",
        merge: { hadPreviousPassingCi: true, github: refused },
      })
    ).toMatchObject({
      kind: "complete",
      ci: { kind: "ci-pending", hadPreviousPassingCi: true },
    });
  });
  it("short-circuits merged rows before open-detail reads", () => {
    expect(
      planSnapshotAfterFacts(facts(context(5), { state: "MERGED" }))
    ).toBe("merged");
    expect(
      planSnapshotAfterFacts(facts(context(5), { state: "CLOSED" }))
    ).toBe("closed");
    expect(planSnapshotAfterFacts(facts(context(5)))).toBe("read-open-details");
    const firstFacts = facts(context(6));
    const stableSample = {
      threads: [],
      ci: cleanCi(),
      reviewAutomationRunning: false,
    } as const;
    expect(
      openObservationsAgree(firstFacts, stableSample, firstFacts, stableSample)
    ).toBe(true);
    expect(
      openObservationsAgree(
        firstFacts,
        stableSample,
        { ...firstFacts, headRefOid: parseGitObjectId("b".repeat(40)) },
        stableSample
      )
    ).toBe(false);
    expect(
      openObservationsAgree(
        firstFacts,
        stableSample,
        firstFacts,
        { ...stableSample, ci: pendingCi() }
      )
    ).toBe(false);
  });
});

it("scans stacks tier-major so an upstack conflict outranks frontier CI", () => {
  expect(
    selectTierMajorStackDecision([
      open(10, { ci: failingCi() }),
      open(11, { facts: { mergeable: "CONFLICTING" } }),
    ])
  ).toMatchObject({
    kind: "blocker",
    blocker: { kind: "merge-conflicts", pr: { number: 11 } },
  });
});
it("attributes a stack wait to the PR whose checks are pending", () => {
  expect(
    selectTierMajorStackDecision([open(20), open(21, { ci: pendingCi("upstack") })])
  ).toMatchObject({
    kind: "waiting",
    frontier: { number: 21 },
    pending: [{ name: "upstack" }],
  });
});
it("waits on a draft while checks are pending, then reports the draft gate", () => {
  expect(
    classifyPr(
      open(12, {
        facts: { isDraft: true, mergeStateStatus: "DRAFT" },
        ci: pendingCi(),
      })
    ).kind
  ).toBe("waiting");
  const allowedDraftGitHub = assessGitHubMerge({
    mergeStateStatus: "DRAFT",
    headGateState: "SUCCESS",
    draftAllowed: true,
  });
  expect(allowedDraftGitHub.kind).toBe("allowed");
  expect(
    assessGitHubMerge({
      mergeStateStatus: "DRAFT",
      headGateState: "SUCCESS",
      draftAllowed: false,
    }).kind
  ).toBe("refused");
  if (allowedDraftGitHub.kind !== "allowed")
    throw new Error("expected the explicit draft exception to allow DRAFT");
  const draftCi: CiClean = {
    ...cleanCi(),
    github: allowedDraftGitHub,
  };
  const draft = open(12, {
    facts: { isDraft: true, mergeStateStatus: "DRAFT" },
    ci: draftCi,
  });
  expect(classifyPr(draft)).toMatchObject({
    blocker: { kind: "merge-gate", reason: "draft-pr" },
  });
  expect(classifyPr(draft, true).kind).toBe("ready");
  expect(
    classifyPr(open(13, { facts: { reviewDecision: "REVIEW_REQUIRED" } }))
  ).toMatchObject({ blocker: { reason: "review-required" } });
  expect(
    classifyPr(open(14, { facts: { mergeable: "UNKNOWN" } }))
  ).toMatchObject({ blocker: { reason: "mergeability-unknown" } });
  expect(classifyPr(merged(15, { headRefOid: null }))).toMatchObject({
    blocker: { reason: "head-sha-unavailable" },
  });
});

describe("queued-stack cadence", () => {
  it("drops a sweep head only after its snapshot succeeds", () => {
    const queue = [context(20), context(21), context(22)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    state = applyQueueSnapshot(state, open(20), 0, options).state;
    expect(state.work).toMatchObject({
      kind: "whole-stack-sweep",
      remaining: [{ number: 21 }, { number: 22 }],
    });
    expect(() => applyQueueSnapshot(state, open(22), 1, options)).toThrow(
      "snapshot does not match sweep head"
    );
  });
  it("resumes a sweep at the PR whose read did not produce a snapshot", () => {
    const queue = [context(20), context(21), context(22)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    state = applyQueueSnapshot(state, open(20), 0, options).state;
    expect(queueReadContext(state).number).toBe(parsePrNumber(21));
    const unchanged = planQueue(state, 60);
    expect(unchanged).toBe(state);
    expect(queueReadContext(unchanged).number).toBe(parsePrNumber(21));
  });
  it("completes a sweep only after its final successful snapshot", () => {
    const queue = [context(30), context(31)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    const first = applyQueueSnapshot(state, open(30), 0, options);
    expect(first.completedSweepRows).toBeNull();
    state = first.state;
    const second = applyQueueSnapshot(state, open(31), 5, options);
    expect(second.completedSweepRows?.map((row) => Number(row.context.number))).toEqual([
      30, 31,
    ]);
    expect(second.state.nextSweepAt).toBe(305);
    let missingHead = createQueueState([context(32)], 0);
    missingHead = applyQueueSnapshot(
      missingHead,
      merged(32, { headRefOid: null }),
      0,
      options
    ).state;
    expect(evaluateQueue(missingHead, 0, options)).toMatchObject({
      kind: "blocker",
      blocker: { reason: "head-sha-unavailable" },
    });
  });
  it("ADVANCE continues directly to the new frontier without sleeping", () => {
    const queue = [context(40), context(41)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    state = applyQueueSnapshot(state, open(40), 0, options).state;
    state = applyQueueSnapshot(state, open(41), 0, options).state;
    const waiting = evaluateQueue(state, 0, options);
    if (waiting.kind !== "waiting") throw new Error("expected waiting");
    state = planQueue(waiting.state, 10);
    state = applyQueueSnapshot(state, merged(40), 10, options).state;
    const advanced = evaluateQueue(state, 10, options);
    expect(advanced).toMatchObject({ kind: "advance", frontier: { number: 41 } });
    expect(queueCadence(advanced)).toBe("continue");
  });
  it("deduplicates identical waits and schedules the next due sweep", () => {
    const queue = [context(50)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    state = applyQueueSnapshot(state, open(50), 0, options).state;
    const first = evaluateQueue(state, 0, options);
    if (first.kind !== "waiting") throw new Error("expected waiting");
    expect(first.emit).toBe(true);
    const second = evaluateQueue(first.state, 10, options);
    if (second.kind !== "waiting") throw new Error("expected waiting");
    expect(second.emit).toBe(false);
    expect(queueCadence(second)).toBe("sleep");
    expect(planQueue(second.state, 300).work?.kind).toBe("whole-stack-sweep");
  });
});

it("uses the specified retry floor, cap, and inclusive deadline", () => {
  expect(queryBackoffSeconds(1, 1)).toBe(60);
  expect(queryBackoffSeconds(1, 2)).toBe(120);
  expect(queryBackoffSeconds(60, 4)).toBe(300);
  expect(deadlinePassed(10, { ...options, timeout: 5 }, 14.999)).toBe(false);
  expect(deadlinePassed(10, { ...options, timeout: 5 }, 15)).toBe(true);
});
