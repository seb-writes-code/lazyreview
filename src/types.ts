export interface PullRequest {
  number: number;
  title: string;
  url: string;
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
}

export interface Review {
  author: string;
  state: string;
  submittedAt: string;
}
