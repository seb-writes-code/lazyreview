import { execFileSync } from "node:child_process";
import type { PullRequest } from "./types.js";

const REVIEW_REQUESTS_QUERY = `
query {
  viewer {
    login
  }
  search(query: "type:pr state:open review-requested:@me", type: ISSUE, first: 50) {
    nodes {
      ... on PullRequest {
        number
        title
        url
        createdAt
        updatedAt
        additions
        deletions
        changedFiles
        isDraft
        author { login }
        repository { nameWithOwner }
        labels(first: 10) { nodes { name } }
        reviewDecision
        reviews(first: 20) {
          nodes {
            author { login }
            state
            submittedAt
          }
        }
        comments { totalCount }
      }
    }
  }
}
`;

function gh(...args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

export function checkAuth(): { authenticated: boolean; user?: string } {
  try {
    const status = gh("auth", "status");
    const match = status.match(/Logged in to github\.com account (\S+)/);
    return { authenticated: true, user: match?.[1] };
  } catch {
    return { authenticated: false };
  }
}

export function fetchReviewRequests(): PullRequest[] {
  const result = gh("api", "graphql", "-f", `query=${REVIEW_REQUESTS_QUERY}`);
  const data = JSON.parse(result);

  const nodes = data.data?.search?.nodes ?? [];

  return nodes.map(
    (node: Record<string, unknown>): PullRequest => ({
      number: node.number as number,
      title: node.title as string,
      url: node.url as string,
      repository: (node.repository as Record<string, string>).nameWithOwner,
      author: (node.author as Record<string, string>).login,
      createdAt: node.createdAt as string,
      updatedAt: node.updatedAt as string,
      additions: node.additions as number,
      deletions: node.deletions as number,
      changedFiles: node.changedFiles as number,
      isDraft: node.isDraft as boolean,
      labels: (
        (node.labels as Record<string, Record<string, string>[]>).nodes ?? []
      ).map((l) => l.name),
      reviewDecision: (node.reviewDecision as string) ?? null,
      reviews: (
        (node.reviews as Record<string, Record<string, unknown>[]>).nodes ?? []
      ).map((r) => ({
        author: (r.author as Record<string, string>).login,
        state: r.state as string,
        submittedAt: r.submittedAt as string,
      })),
      comments: (node.comments as Record<string, number>).totalCount,
    })
  );
}
