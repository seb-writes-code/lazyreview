import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { PullRequest } from "../src/types.js";

// Mock GraphQL response matching the shape returned by `gh api graphql`
const mockGraphQLResponse = {
  data: {
    search: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          number: 42,
          title: "Add dark mode support",
          url: "https://github.com/acme/app/pull/42",
          createdAt: "2026-03-20T10:00:00Z",
          updatedAt: "2026-03-25T14:30:00Z",
          additions: 150,
          deletions: 20,
          changedFiles: 8,
          isDraft: false,
          author: { login: "alice" },
          repository: { nameWithOwner: "acme/app" },
          labels: { nodes: [{ name: "enhancement" }] },
          reviewDecision: null,
          reviews: {
            nodes: [
              {
                author: { login: "bob" },
                state: "COMMENTED",
                submittedAt: "2026-03-24T09:00:00Z",
              },
            ],
          },
          comments: { totalCount: 3 },
        },
        {
          number: 99,
          title: "WIP: refactor auth",
          url: "https://github.com/acme/api/pull/99",
          createdAt: "2026-03-22T08:00:00Z",
          updatedAt: "2026-03-26T16:00:00Z",
          additions: 500,
          deletions: 300,
          changedFiles: 25,
          isDraft: true,
          author: { login: "carol" },
          repository: { nameWithOwner: "acme/api" },
          labels: { nodes: [] },
          reviewDecision: "REVIEW_REQUIRED",
          reviews: { nodes: [] },
          comments: { totalCount: 0 },
        },
      ],
    },
  },
};

describe("fetchReviewRequests", () => {
  it("normalizes GraphQL response into PullRequest[]", async () => {
    // We test the normalization logic by importing and calling with mocked gh
    const childProcess = require("node:child_process");
    const originalExecFile = childProcess.execFile;

    // Mock execFile to return our fixture
    childProcess.execFile = (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, result: { stdout: string }) => void,
    ) => {
      cb(null, { stdout: JSON.stringify(mockGraphQLResponse) });
    };

    try {
      // Dynamic import to pick up the mock
      const mod = await import("../src/github.js");
      const prs = await mod.fetchReviewRequests();

      expect(prs).toHaveLength(2);

      // First PR
      expect(prs[0].number).toBe(42);
      expect(prs[0].title).toBe("Add dark mode support");
      expect(prs[0].repository).toBe("acme/app");
      expect(prs[0].author).toBe("alice");
      expect(prs[0].isDraft).toBe(false);
      expect(prs[0].labels).toEqual(["enhancement"]);
      expect(prs[0].reviews).toHaveLength(1);
      expect(prs[0].reviews[0].author).toBe("bob");
      expect(prs[0].reviews[0].state).toBe("COMMENTED");
      expect(prs[0].comments).toBe(3);
      expect(prs[0].additions).toBe(150);
      expect(prs[0].deletions).toBe(20);
      expect(prs[0].changedFiles).toBe(8);

      // Second PR (draft)
      expect(prs[1].number).toBe(99);
      expect(prs[1].isDraft).toBe(true);
      expect(prs[1].labels).toEqual([]);
      expect(prs[1].reviews).toEqual([]);
      expect(prs[1].comments).toBe(0);
    } finally {
      childProcess.execFile = originalExecFile;
    }
  });
});

describe("PullRequest type", () => {
  it("has expected fields", () => {
    const pr: PullRequest = {
      number: 1,
      title: "Test",
      url: "https://github.com/a/b/pull/1",
      repository: "a/b",
      author: "user",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      isDraft: false,
      labels: [],
      reviewDecision: null,
      reviews: [],
      comments: 0,
    };

    expect(pr.number).toBe(1);
    expect(pr.repository).toBe("a/b");
  });
});
