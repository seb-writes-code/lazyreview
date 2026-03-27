import React from "react";
import { Box, Text } from "ink";
import type { PullRequest } from "./types.js";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function reviewStateSymbol(state: string): string {
  switch (state) {
    case "APPROVED":
      return "✓";
    case "CHANGES_REQUESTED":
      return "✗";
    case "COMMENTED":
      return "💬";
    case "PENDING":
      return "⏳";
    case "DISMISSED":
      return "—";
    default:
      return "?";
  }
}

function reviewStateColor(
  state: string
): "green" | "red" | "yellow" | "gray" | "white" {
  switch (state) {
    case "APPROVED":
      return "green";
    case "CHANGES_REQUESTED":
      return "red";
    case "COMMENTED":
      return "yellow";
    case "PENDING":
      return "gray";
    default:
      return "white";
  }
}

function DiffStats({ pr }: { pr: PullRequest }) {
  return (
    <Box gap={1}>
      <Text color="green">+{pr.additions}</Text>
      <Text color="red">-{pr.deletions}</Text>
      <Text dimColor>
        ({pr.changedFiles} file{pr.changedFiles !== 1 ? "s" : ""})
      </Text>
    </Box>
  );
}

function ReviewList({ reviews }: { reviews: PullRequest["reviews"] }) {
  if (reviews.length === 0) {
    return (
      <Text dimColor italic>
        No reviews yet
      </Text>
    );
  }

  // Deduplicate: keep only the latest review per author
  const latest = new Map<string, (typeof reviews)[0]>();
  for (const review of reviews) {
    const existing = latest.get(review.author);
    if (
      !existing ||
      new Date(review.submittedAt) > new Date(existing.submittedAt)
    ) {
      latest.set(review.author, review);
    }
  }

  return (
    <Box flexDirection="column">
      {[...latest.values()].map((review) => (
        <Box key={review.author} gap={1}>
          <Text color={reviewStateColor(review.state)}>
            {reviewStateSymbol(review.state)}
          </Text>
          <Text>{review.author}</Text>
          <Text dimColor>{timeAgo(review.submittedAt)}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function PRContext({
  pr,
  index,
  total,
}: {
  pr: PullRequest;
  index: number;
  total: number;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header with counter */}
      <Box marginBottom={1}>
        <Text dimColor>
          Review {index + 1} of {total}
        </Text>
      </Box>

      {/* Title and number */}
      <Box gap={1}>
        <Text bold color="cyan">
          #{pr.number}
        </Text>
        <Text bold>{pr.title}</Text>
        {pr.isDraft && <Text color="yellow">[DRAFT]</Text>}
      </Box>

      {/* Repository and author */}
      <Box gap={1} marginTop={0}>
        <Text dimColor>repo:</Text>
        <Text color="blue">{pr.repository}</Text>
        <Text dimColor>by</Text>
        <Text color="magenta">{pr.author}</Text>
        <Text dimColor>·</Text>
        <Text dimColor>updated {timeAgo(pr.updatedAt)}</Text>
      </Box>

      {/* Diff stats */}
      <Box gap={1} marginTop={0}>
        <Text dimColor>diff:</Text>
        <DiffStats pr={pr} />
      </Box>

      {/* Labels */}
      {pr.labels.length > 0 && (
        <Box gap={1} marginTop={0}>
          <Text dimColor>labels:</Text>
          {pr.labels.map((label) => (
            <Text key={label} color="yellow">
              {label}
            </Text>
          ))}
        </Box>
      )}

      {/* Reviews */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor underline>
          Reviews
        </Text>
        <ReviewList reviews={pr.reviews} />
      </Box>

      {/* Comments count */}
      {pr.comments > 0 && (
        <Box marginTop={0}>
          <Text dimColor>
            💬 {pr.comments} comment{pr.comments !== 1 ? "s" : ""}
          </Text>
        </Box>
      )}

      {/* URL */}
      <Box marginTop={1}>
        <Text dimColor>{pr.url}</Text>
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>
          n next • p prev • l claude code • o open • q quit
        </Text>
      </Box>
    </Box>
  );
}

export function Loading() {
  return (
    <Box paddingX={1}>
      <Text dimColor>Fetching review requests...</Text>
    </Box>
  );
}

export function Empty() {
  return (
    <Box paddingX={1}>
      <Text color="green">✓ No pending review requests. You're all caught up!</Text>
    </Box>
  );
}

export function AuthError() {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="red" bold>
        Not authenticated with GitHub
      </Text>
      <Text>
        Run <Text color="cyan">gh auth login</Text> to authenticate.
      </Text>
    </Box>
  );
}
