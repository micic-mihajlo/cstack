import { parseGitObjectId, parsePrNumber } from "./types.ts";
import type {
  CiClean,
  GitHubMergeAllowed,
  PrContext,
  ReadyPr,
  TerminalVerdict,
} from "./types.ts";

type ReadyVerdict = Extract<TerminalVerdict, { readonly kind: "READY" }>;

const context = {
  owner: "octocat",
  repo: "hello-world",
  number: parsePrNumber(123),
} satisfies PrContext;
const headRefOid = parseGitObjectId("a".repeat(40));
const cleanCi = {
  kind: "ci-clean",
  source: "rest-commit-gates",
  headRefOid,
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
    kind: "allowed",
    basis: "merge-state-and-rest-gates",
    mergeStateStatus: "CLEAN",
    headGateState: "SUCCESS",
  },
} satisfies CiClean;
const readyPr = {
  kind: "ready-pr",
  context,
  proof: {
    mergeability: "clear",
    headRefOid,
    threads: [],
    ci: cleanCi,
    gate: {
      state: "OPEN",
      reviewDecision: "APPROVED",
      draft: "not-draft",
    },
  },
} satisfies ReadyPr;
const ready = {
  schemaVersion: 1,
  sequence: 1,
  observedAt: "2026-07-26T00:00:00.000Z",
  mode: "single",
  kind: "READY",
  terminal: true,
  exitCode: 0,
  scope: { kind: "single", pr: readyPr },
} satisfies ReadyVerdict;

void ready;

type AssertFalse<Value extends false> = Value;
type IsAssignable<From, To> = From extends To ? true : false;

type BlockedFailure = {
  kind: "allowed",
  basis: "merge-state-and-rest-gates",
  mergeStateStatus: "BLOCKED",
  headGateState: "FAILURE",
};
type CleanWithBlockedFailure = Omit<CiClean, "github"> & {
  readonly github: BlockedFailure;
};
type ReadyWithBlockerExit = Omit<ReadyVerdict, "exitCode"> & {
  readonly exitCode: 4;
};
type ReadyWithoutProof = { readonly kind: "ready-pr"; readonly context: PrContext };

type BlockedFailureIsNotAllowed = AssertFalse<
  IsAssignable<BlockedFailure, GitHubMergeAllowed>
>;
type BlockedFailureIsNotClean = AssertFalse<
  IsAssignable<CleanWithBlockedFailure, CiClean>
>;
type ReadyCannotUseBlockerExit = AssertFalse<
  IsAssignable<ReadyWithBlockerExit, ReadyVerdict>
>;
type ReadyRequiresProof = AssertFalse<IsAssignable<ReadyWithoutProof, ReadyPr>>;

void (0 as unknown as BlockedFailureIsNotAllowed);
void (0 as unknown as BlockedFailureIsNotClean);
void (0 as unknown as ReadyCannotUseBlockerExit);
void (0 as unknown as ReadyRequiresProof);
