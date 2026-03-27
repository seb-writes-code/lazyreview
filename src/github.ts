import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import type { PullRequest, Filters, SortField } from "./types.js";

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
        body
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
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
              }
            }
          }
        }
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

function buildSearchQuery(filters?: Filters): string {
  let q = "type:pr state:open review-requested:@me archived:false";
  if (filters?.repo) {
    q += ` repo:${filters.repo}`;
  }
  if (filters?.author) {
    q += ` author:${filters.author}`;
  }
  if (filters?.noDrafts) {
    q += ` draft:false`;
  }
  return q;
}

export async function fetchReviewRequests(filters?: Filters): Promise<PullRequest[]> {
  const allPRs: PullRequest[] = [];
  let cursor: string | null = null;
  const searchQuery = buildSearchQuery(filters);

  // Paginate through all results
  do {
    const query = REVIEW_REQUESTS_QUERY.replace(
      'query: "type:pr state:open review-requested:@me archived:false"',
      `query: "${searchQuery}"`
    );
    const args = ["api", "graphql", "-f", `query=${query}`];
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

  return sortPRs(allPRs, filters?.sort, filters?.reverse);
}

function sortPRs(prs: PullRequest[], sort?: SortField, reverse?: boolean): PullRequest[] {
  if (!sort) return prs;
  const sorted = [...prs];
  const ciOrder: Record<string, number> = { SUCCESS: 0, PENDING: 1, ERROR: 3, FAILURE: 3 };
  switch (sort) {
    case "created":
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      break;
    case "updated":
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      break;
    case "size":
      sorted.sort((a, b) => (a.additions + a.deletions) - (b.additions + b.deletions));
      break;
    case "ci":
      sorted.sort((a, b) => (ciOrder[a.checkStatus ?? ""] ?? 2) - (ciOrder[b.checkStatus ?? ""] ?? 2));
      break;
  }
  if (reverse) sorted.reverse();
  return sorted;
}

export async function checkoutPR(pr: PullRequest): Promise<void> {
  await gh("pr", "checkout", String(pr.number), "--repo", pr.repository);
}

export async function fetchDiff(pr: PullRequest): Promise<string> {
  return gh("pr", "diff", String(pr.number), "--repo", pr.repository);
}

export async function approvePR(pr: PullRequest): Promise<void> {
  await gh(
    "pr",
    "review",
    String(pr.number),
    "--repo",
    pr.repository,
    "--approve"
  );
}

export async function commentOnPR(
  pr: PullRequest,
  body: string
): Promise<void> {
  await gh(
    "pr",
    "review",
    String(pr.number),
    "--repo",
    pr.repository,
    "--comment",
    "--body",
    body
  );
}

export async function requestChanges(
  pr: PullRequest,
  body: string
): Promise<void> {
  await gh(
    "pr",
    "review",
    String(pr.number),
    "--repo",
    pr.repository,
    "--request-changes",
    "--body",
    body
  );
}

export async function mergePR(
  pr: PullRequest,
  strategy: "merge" | "squash" | "rebase"
): Promise<void> {
  await gh(
    "pr",
    "merge",
    String(pr.number),
    "--repo",
    pr.repository,
    `--${strategy}`
  );
}

export function openInBrowser(pr: PullRequest): void {
  spawnSync("gh", ["pr", "view", String(pr.number), "--repo", pr.repository, "--web"], {
    stdio: "ignore",
  });
}

export async function checkoutAndOpenEditor(pr: PullRequest): Promise<void> {
  await checkoutPR(pr);
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";
  spawnSync(editor, ["."], { stdio: "inherit" });
}

export async function checkoutAndLaunchClaude(pr: PullRequest): Promise<void> {
  await checkoutPR(pr);
  const prompt = [
    `You are helping review a GitHub pull request.`,
    ``,
    `PR: ${pr.title}`,
    `Repo: ${pr.repository}`,
    `Author: ${pr.author}`,
    `URL: ${pr.url}`,
    `Changes: +${pr.additions} -${pr.deletions} across ${pr.changedFiles} files`,
    ``,
    `Use \`gh pr diff ${pr.number} --repo ${pr.repository}\` to examine the diff and help the user review this PR.`,
  ].join("\n");
  spawnSync("claude", ["--prompt", prompt], { stdio: "inherit" });
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
  const commits = node.commits as {
    nodes?: Array<{
      commit: {
        statusCheckRollup?: { state: string } | null;
      };
    }>;
  } | null;
  const checkState =
    commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;

  return {
    number: node.number as number,
    title: node.title as string,
    url: node.url as string,
    body: (node.body as string) ?? "",
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
    checkStatus: checkState as PullRequest["checkStatus"],
  };
}
