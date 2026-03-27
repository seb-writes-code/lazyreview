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

export type SortField = "updated" | "created" | "size" | "ci";

export interface Filters {
  repo?: string;
  author?: string;
  noDrafts?: boolean;
  sort?: SortField;
  reverse?: boolean;
}

export interface Review {
  author: string;
  state: string;
  submittedAt: string;
}

export interface SessionStats {
  approved: number;
  commented: number;
  requestedChanges: number;
  merged: number;
  skipped: number;
}
