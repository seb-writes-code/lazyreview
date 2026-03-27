import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PullRequest } from "./types.js";

const execFileAsync = promisify(execFile);

const REVIEW_REQUESTS_QUERY = `
query($cursor: String) {
  search(query: "type:pr state:open review-requested:@me archived:false", type: ISSUE, first: 50, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
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

async function gh(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, {
    encoding: "utf-8",
    timeout: 30_000,
  });
  return stdout.trim();
}

export function checkAuth(): { authenticated: boolean; user?: string } {
  // checkAuth stays synchronous since it runs at startup before the UI renders
  const { execFileSync } = require("node:child_process");
  try {
    const status = execFileSync("gh", ["auth", "status"], {
      encoding: "utf-8",
      timeout: 10_000,
    }) as string;
    const match = status.match(/Logged in to github\.com account (\S+)/);
    return { authenticated: true, user: match?.[1] };
  } catch {
    return { authenticated: false };
  }
}

export async function fetchReviewRequests(): Promise<PullRequest[]> {
  const allPRs: PullRequest[] = [];
  let cursor: string | null = null;

  // Paginate through all results
  do {
    const args = ["api", "graphql", "-f", `query=${REVIEW_REQUESTS_QUERY}`];
    if (cursor) {
      args.push("-f", `cursor=${cursor}`);
    }

    const result = await gh(...args);
    const parsed = JSON.parse(result);

    if (parsed.errors?.length) {
      throw new Error(
        `GitHub GraphQL error: ${parsed.errors.map((e: { message: string }) => e.message).join(", ")}`
      );
    }

    const search = parsed.data?.search;
    if (!search) {
      throw new Error("Unexpected response: missing search data");
    }

    const nodes = search.nodes ?? [];
    for (const node of nodes) {
      // Skip null nodes (can happen with deleted PRs)
      if (!node || !node.number) continue;

      allPRs.push(normalizePR(node));
    }

    cursor = search.pageInfo?.hasNextPage ? search.pageInfo.endCursor : null;
  } while (cursor);

  return allPRs;
}

function normalizePR(node: Record<string, unknown>): PullRequest {
  const repo = node.repository as Record<string, string> | null;
  const author = node.author as Record<string, string> | null;
  const labels = node.labels as { nodes?: Array<{ name: string }> } | null;
  const reviews = node.reviews as {
    nodes?: Array<{
      author: { login: string } | null;
      state: string;
      submittedAt: string;
    }>;
  } | null;
  const comments = node.comments as { totalCount: number } | null;

  return {
    number: node.number as number,
    title: node.title as string,
    url: node.url as string,
    repository: repo?.nameWithOwner ?? "unknown",
    author: author?.login ?? "unknown",
    createdAt: node.createdAt as string,
    updatedAt: node.updatedAt as string,
    additions: node.additions as number,
    deletions: node.deletions as number,
    changedFiles: node.changedFiles as number,
    isDraft: (node.isDraft as boolean) ?? false,
    labels: (labels?.nodes ?? []).map((l) => l.name),
    reviewDecision: (node.reviewDecision as string) ?? null,
    reviews: (reviews?.nodes ?? [])
      .filter((r) => r.author)
      .map((r) => ({
        author: r.author!.login,
        state: r.state,
        submittedAt: r.submittedAt,
      })),
    comments: comments?.totalCount ?? 0,
  };
}
