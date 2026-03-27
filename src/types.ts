export interface PullRequest {
  number: number;
  title: string;
  url: string;
  body: string;
  repository: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  isDraft: boolean;
  labels: string[];
  reviewDecision: string | null;
  reviews: Review[];
  comments: number;
  checkStatus: "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | null;
}

export interface Filters {
  repo?: string;
  author?: string;
  noDrafts?: boolean;
}

export interface Review {
  author: string;
  state: string;
  submittedAt: string;
}
