import { describe, expect, it } from "bun:test";
import {
  MAX_CONNECTION_ITEMS,
  MAX_CONNECTION_PAGES,
  MAX_REVIEW_BODY_CHARACTERS,
  OPEN_PULL_REQUESTS_QUERY,
  REVIEW_THREADS_QUERY,
  assertConnectionWithinBounds,
  completeExactHeadGates,
  nextPageCursor,
  githubRepositoryArgument,
  graphqlArgs,
  openPullRequestObservationsAgree,
  orderStack,
  parseOpenPullRequestPage,
  planContextResolution,
  runBoundedCommand,
} from "./github.ts";
import { parseGitObjectId, parsePrNumber } from "./types.ts";

const context = {
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(42),
};
const localHead = { owner: context.owner, repo: context.repo };

describe("real command boundary", () => {
  it("captures a successful real child process", async () => {
    const result = await runBoundedCommand(["/usr/bin/printf", "ready"], 1_000);
    expect(result).toEqual({ code: 0, stdout: "ready", stderr: "" });
    const missing = await runBoundedCommand(
      ["/definitely-not-a-watch-pr-executable"],
      1_000
    );
    expect(missing.code).toBe(127);
    expect(missing.stderr).toContain("could not execute");
  });

  it("kills a real child process at its deadline", async () => {
    const started = performance.now();
    const result = await runBoundedCommand(["/bin/sleep", "1"], 25);
    expect(result.code).toBe(124);
    expect(result.stderr).toContain("command exceeded");
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("bounds output from a real unbounded producer", async () => {
    const result = await runBoundedCommand(["/usr/bin/yes"], 2_000);
    expect(result.code).toBe(125);
    expect(result.stderr).toContain("output exceeded 4 MiB");
    expect(result.stdout.length).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});

describe("context and stack planning", () => {
  it("returns a fully explicit context without inference", () => {
    expect(
      planContextResolution({
        owner: "explicit",
        repo: "repo",
        pr: context.number,
      })
    ).toEqual({
      kind: "explicit",
      context: { owner: "explicit", repo: "repo", number: context.number },
    });
    expect(String(parseGitObjectId("A".repeat(40)))).toBe("a".repeat(40));
    expect(() => parseGitObjectId("head")).toThrow("40- or 64-hex");
    expect(() => parsePrNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "positive integer"
    );
  });

  it("rejects an explicit repository paired with an inferred PR", () => {
    expect(() =>
      planContextResolution({ owner: "other", repo: "repo", pr: null })
    ).toThrow("refusing to reuse an inferred local PR number");
  });

  it("uses the local origin first for an explicit number", () => {
    expect(
      planContextResolution({ owner: null, repo: null, pr: context.number })
    ).toEqual({ kind: "origin-first", pr: context.number });
    expect(() =>
      planContextResolution({
        owner: "only-owner",
        repo: null,
        pr: context.number,
      })
    ).toThrow("must be supplied together");
  });

  it("orders a connected stack bottom-to-top", () => {
    expect(
      orderStack(context, [
        {
          number: parsePrNumber(41),
          headRefName: "base-feature",
          baseRefName: "main",
          headRepository: localHead,
        },
        {
          number: context.number,
          headRefName: "feature",
          baseRefName: "base-feature",
          headRepository: localHead,
        },
        {
          number: parsePrNumber(43),
          headRefName: "upstack",
          baseRefName: "feature",
          headRepository: localHead,
        },
      ]).map((item) => Number(item.number))
    ).toEqual([41, 42, 43]);
    expect(
      orderStack(context, [
        {
          number: context.number,
          headRefName: "feature",
          baseRefName: "main",
          headRepository: { owner: "Owner", repo: "Repo" },
        },
      ]).map((item) => Number(item.number))
    ).toEqual([42]);
  });

  it("rejects a branch cycle instead of looping", () => {
    expect(() =>
      orderStack(context, [
        {
          number: context.number,
          headRefName: "feature",
          baseRefName: "upstack",
          headRepository: localHead,
        },
        {
          number: parsePrNumber(43),
          headRefName: "upstack",
          baseRefName: "feature",
          headRepository: localHead,
        },
      ])
    ).toThrow("stack branch cycle");
    expect(() =>
      orderStack(context, [
        {
          number: context.number,
          headRefName: "feature",
          baseRefName: "main",
          headRepository: localHead,
        },
        {
          number: parsePrNumber(43),
          headRefName: "feature",
          baseRefName: "main",
          headRepository: localHead,
        },
      ])
    ).toThrow("duplicate head branch");
    expect(() =>
      orderStack(context, [
        {
          number: context.number,
          headRefName: "feature",
          baseRefName: "main",
          headRepository: { owner: "fork", repo: "project" },
        },
      ])
    ).toThrow("fork edge");
    expect(() =>
      orderStack(context, [
        {
          number: context.number,
          headRefName: "feature",
          baseRefName: "main",
          headRepository: localHead,
        },
        {
          number: parsePrNumber(43),
          headRefName: "child-one",
          baseRefName: "feature",
          headRepository: localHead,
        },
        {
          number: parsePrNumber(44),
          headRefName: "child-two",
          baseRefName: "feature",
          headRepository: localHead,
        },
      ])
    ).toThrow("stack branches");
    expect(() =>
      orderStack(context, [
        {
          number: parsePrNumber(41),
          headRefName: "base-feature",
          baseRefName: "main",
          headRepository: localHead,
        },
        {
          number: context.number,
          headRefName: "feature",
          baseRefName: "base-feature",
          headRepository: localHead,
        },
        {
          number: parsePrNumber(44),
          headRefName: "sibling",
          baseRefName: "base-feature",
          headRepository: localHead,
        },
      ])
    ).toThrow("stack branches");
    expect(() =>
      orderStack(context, [
        {
          number: context.number,
          headRefName: "feature",
          baseRefName: "main",
          headRepository: localHead,
        },
        {
          number: parsePrNumber(43),
          headRefName: "fork-child",
          baseRefName: "feature",
          headRepository: { owner: "fork", repo: "repo" },
        },
      ])
    ).toThrow("fork edge");
    expect(() => orderStack(context, [])).toThrow("seed that is not open");
  });

  it("bounds every unbounded collection and exact-head gate page", () => {
    for (const query of [REVIEW_THREADS_QUERY, OPEN_PULL_REQUESTS_QUERY]) {
      expect(query).toContain("$after: String");
      expect(query).toContain("after: $after");
      expect(query).toContain("pageInfo");
    }
    expect(REVIEW_THREADS_QUERY).toContain("comments(first: 1)");
    expect(OPEN_PULL_REQUESTS_QUERY).toContain("totalCount");
    expect(githubRepositoryArgument(context)).toBe("github.com/owner/repo");
    expect(graphqlArgs(REVIEW_THREADS_QUERY, context).slice(0, 5)).toEqual([
      "gh",
      "api",
      "--hostname",
      "github.com",
      "graphql",
    ]);
    expect(nextPageCursor("checks", false, null)).toBeNull();
    expect(nextPageCursor("checks", true, "next")).toBe("next");
    expect(() => nextPageCursor("checks", true, null)).toThrow(
      "checks.endCursor"
    );
    const head = parseGitObjectId("b".repeat(40));
    const gate = {
      identity: "gate-1",
      headRefOid: head,
      check: {
        kind: "passed",
        name: "build",
        reportedState: "SUCCESS",
        link: "",
      },
    } as const;
    expect(
      completeExactHeadGates({
        label: "gates",
        expectedHeadRefOid: head,
        pages: [{ totalCount: 1, gates: [gate] }],
      })
    ).toEqual([gate.check]);
    expect(() =>
      completeExactHeadGates({
        label: "gates",
        expectedHeadRefOid: head,
        pages: [{ totalCount: 2, gates: [gate] }],
      })
    ).toThrow("complete row count");
    expect(() =>
      completeExactHeadGates({
        label: "gates",
        expectedHeadRefOid: head,
        pages: [{ totalCount: 2, gates: [gate, gate] }],
      })
    ).toThrow("unique identity");
    expect(() =>
      completeExactHeadGates({
        label: "gates",
        expectedHeadRefOid: parseGitObjectId("c".repeat(40)),
        pages: [{ totalCount: 1, gates: [gate] }],
      })
    ).toThrow("head_sha");
    expect(() =>
      completeExactHeadGates({
        label: "gates",
        expectedHeadRefOid: head,
        pages: [{ totalCount: 1, gates: [gate] }],
        incompleteAtOrAbove: 1,
      })
    ).toThrow("completeness limit");
    expect(() =>
      assertConnectionWithinBounds({
        label: "reviews",
        pages: MAX_CONNECTION_PAGES + 1,
        items: MAX_CONNECTION_ITEMS,
        bodyCharacters: MAX_REVIEW_BODY_CHARACTERS,
      })
    ).toThrow("bounded read limit");
    expect(() =>
      assertConnectionWithinBounds({
        label: "reviews",
        pages: MAX_CONNECTION_PAGES,
        items: MAX_CONNECTION_ITEMS + 1,
        bodyCharacters: MAX_REVIEW_BODY_CHARACTERS,
      })
    ).toThrow("bounded read limit");
    expect(() =>
      assertConnectionWithinBounds({
        label: "reviews",
        pages: MAX_CONNECTION_PAGES,
        items: MAX_CONNECTION_ITEMS,
        bodyCharacters: MAX_REVIEW_BODY_CHARACTERS + 1,
      })
    ).toThrow("bounded read limit");
  });

  it("requires complete and stable open-PR graph observations", () => {
    const page = parseOpenPullRequestPage({
      data: {
        repository: {
          pullRequests: {
            totalCount: 1,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 42,
                headRefName: "feature",
                baseRefName: "main",
                headRepository: { nameWithOwner: "owner/repo" },
              },
            ],
          },
        },
      },
    });
    expect(page.totalCount).toBe(1);
    expect(page.pulls).toHaveLength(1);
    expect(openPullRequestObservationsAgree(page.pulls, [...page.pulls].reverse())).toBe(true);
    expect(
      openPullRequestObservationsAgree(page.pulls, [
        ...page.pulls,
        {
          number: parsePrNumber(43),
          headRefName: "upstack",
          baseRefName: "feature",
          headRepository: localHead,
        },
      ])
    ).toBe(false);
    expect(() =>
      parseOpenPullRequestPage({
        data: {
          repository: {
            pullRequests: {
              totalCount: "1",
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        },
      })
    ).toThrow("pullRequests.totalCount");
  });
});
