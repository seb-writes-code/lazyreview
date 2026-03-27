import React from "react";
import { Box, Text } from "ink";
import type { PullRequest, Filters } from "./types.js";

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

function CIStatus({ status }: { status: PullRequest["checkStatus"] }) {
  switch (status) {
    case "SUCCESS":
      return <Text color="green">✓ passing</Text>;
    case "FAILURE":
    case "ERROR":
      return <Text color="red">✗ failing</Text>;
    case "PENDING":
      return <Text color="yellow">⏳ pending</Text>;
    default:
      return <Text dimColor>— no checks</Text>;
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

function FilterBar({ filters }: { filters?: Filters }) {
  const parts: string[] = [];
  if (filters?.repo) parts.push(`repo:${filters.repo}`);
  if (filters?.author) parts.push(`author:${filters.author}`);
  if (filters?.noDrafts) parts.push("no-drafts");
  if (parts.length === 0) return null;
  return (
    <Box gap={1}>
      <Text dimColor>filters:</Text>
      <Text color="yellow">{parts.join(" ")}</Text>
    </Box>
  );
}

export function PRContext({
  pr,
  index,
  total,
  filters,
}: {
  pr: PullRequest;
  index: number;
  total: number;
  filters?: Filters;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header with counter */}
      <Box marginBottom={1} gap={2}>
        <Text dimColor>
          Review {index + 1} of {total}
        </Text>
        <FilterBar filters={filters} />
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

      {/* CI status */}
      <Box gap={1} marginTop={0}>
        <Text dimColor>ci:</Text>
        <CIStatus status={pr.checkStatus} />
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

      {/* Actions help */}
      <Box marginTop={1}>
        <Text dimColor>
          a approve • m merge • b body • c comment • x request changes • d diff • k checkout • e editor • l claude • r refresh • s skip • o open • q quit
        </Text>
      </Box>
    </Box>
  );
}

export function MergeConfirm({
  pr,
  strategy,
}: {
  pr: PullRequest;
  strategy: "merge" | "squash" | "rebase";
}) {
  const strategies = ["merge", "squash", "rebase"] as const;
  const ciWarning =
    pr.checkStatus === "FAILURE" || pr.checkStatus === "ERROR"
      ? "⚠ CI is failing"
      : pr.checkStatus === "PENDING"
        ? "⚠ CI is pending"
        : null;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1} marginBottom={1}>
        <Text bold color="cyan">
          Merge #{pr.number}
        </Text>
        <Text bold>{pr.title}</Text>
      </Box>

      <Box gap={1}>
        <Text dimColor>repo:</Text>
        <Text color="blue">{pr.repository}</Text>
      </Box>

      {ciWarning && (
        <Box marginTop={1}>
          <Text color="yellow">{ciWarning}</Text>
        </Box>
      )}

      <Box marginTop={1} gap={1}>
        <Text dimColor>strategy:</Text>
        {strategies.map((s, i) => (
          <Text key={s} color={s === strategy ? "green" : undefined} bold={s === strategy}>
            {i + 1}) {s}{s === strategy ? " ✓" : ""}
          </Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          enter confirm • 1/2/3 strategy • esc cancel
        </Text>
      </Box>
    </Box>
  );
}

export function ActionStatus({ message }: { message: string }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color="green" bold>✓ {message}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press any key to continue • q quit</Text>
      </Box>
    </Box>
  );
}

function diffLineColor(line: string): "green" | "red" | "cyan" | "white" {
  if (line.startsWith("+")) return "green";
  if (line.startsWith("-")) return "red";
  if (line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ")) return "cyan";
  return "white";
}

export function DiffView({
  pr,
  lines,
  scrollOffset,
}: {
  pr: PullRequest;
  lines: string[];
  scrollOffset: number;
}) {
  const viewportHeight = Math.max(process.stdout.rows - 5, 10);
  const clampedOffset = Math.min(scrollOffset, Math.max(0, lines.length - viewportHeight));
  const visibleLines = lines.slice(clampedOffset, clampedOffset + viewportHeight);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1} marginBottom={1}>
        <Text bold color="cyan">
          #{pr.number}
        </Text>
        <Text bold>{pr.title}</Text>
        <Text dimColor>
          — line {clampedOffset + 1}/{lines.length}
        </Text>
      </Box>

      <Box flexDirection="column">
        {visibleLines.map((line, i) => (
          <Box key={clampedOffset + i}>
            <Text color={diffLineColor(line)}>
              {line}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          j/k scroll • space page down • g top • G bottom • esc back
        </Text>
      </Box>
    </Box>
  );
}

export function BodyView({
  pr,
  lines,
  scrollOffset,
}: {
  pr: PullRequest;
  lines: string[];
  scrollOffset: number;
}) {
  const viewportHeight = Math.max(process.stdout.rows - 5, 10);
  const clampedOffset = Math.min(scrollOffset, Math.max(0, lines.length - viewportHeight));
  const visibleLines = lines.slice(clampedOffset, clampedOffset + viewportHeight);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1} marginBottom={1}>
        <Text bold color="cyan">
          #{pr.number}
        </Text>
        <Text bold>{pr.title}</Text>
        <Text dimColor>
          — line {clampedOffset + 1}/{lines.length}
        </Text>
      </Box>

      <Box flexDirection="column">
        {visibleLines.map((line, i) => (
          <Box key={clampedOffset + i}>
            <Text>{line}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          j/k scroll • space page down • g top • G bottom • esc back
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
