import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { PRContext, Loading, Empty, AuthError, ActionStatus, DiffView, BodyView, MergeConfirm } from "./ui.js";
import {
  checkAuth,
  fetchReviewRequests,
  fetchDiff,
  checkoutPR,
  approvePR,
  commentOnPR,
  requestChanges,
  openInBrowser,
  checkoutAndOpenEditor,
  checkoutAndLaunchClaude,
  mergePR,
} from "./github.js";
import type { PullRequest, Filters } from "./types.js";

type AppState =
  | { phase: "loading" }
  | { phase: "auth_error" }
  | { phase: "error"; message: string }
  | { phase: "empty" }
  | { phase: "reviewing"; prs: PullRequest[]; current: number }
  | {
      phase: "action";
      prs: PullRequest[];
      current: number;
      message: string;
      advance: boolean;
    }
  | {
      phase: "input";
      prs: PullRequest[];
      current: number;
      action: "comment" | "request_changes";
      value: string;
    }
  | {
      phase: "diff";
      prs: PullRequest[];
      current: number;
      lines: string[];
      scrollOffset: number;
    }
  | {
      phase: "body";
      prs: PullRequest[];
      current: number;
      lines: string[];
      scrollOffset: number;
    }
  | {
      phase: "merge_confirm";
      prs: PullRequest[];
      current: number;
      strategy: "merge" | "squash" | "rebase";
    };

export function App({ filters }: { filters?: Filters }) {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({ phase: "loading" });

  useEffect(() => {
    const auth = checkAuth();
    if (!auth.authenticated) {
      setState({ phase: "auth_error" });
      return;
    }

    fetchReviewRequests(filters)
      .then((prs) => {
        if (prs.length === 0) {
          setState({ phase: "empty" });
        } else {
          setState({ phase: "reviewing", prs, current: 0 });
        }
      })
      .catch((err) => {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, []);

  const advance = (prs: PullRequest[], current: number) => {
    const remaining = [...prs.slice(0, current), ...prs.slice(current + 1)];
    if (remaining.length === 0) {
      setState({ phase: "empty" });
    } else {
      setState({
        phase: "reviewing",
        prs: remaining,
        current: Math.min(current, remaining.length - 1),
      });
    }
  };

  const runAction = async (
    pr: PullRequest,
    prs: PullRequest[],
    current: number,
    action: () => Promise<void>,
    message: string,
    shouldAdvance: boolean
  ) => {
    setState({ phase: "loading" });
    try {
      await action();
      setState({
        phase: "action",
        prs,
        current,
        message,
        advance: shouldAdvance,
      });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  useInput((input, key) => {
    // Handle input mode (comment / request changes)
    if (state.phase === "input") {
      if (key.escape) {
        setState({
          phase: "reviewing",
          prs: state.prs,
          current: state.current,
        });
        return;
      }
      if (key.return) {
        const body = state.value.trim();
        if (!body) {
          setState({
            phase: "reviewing",
            prs: state.prs,
            current: state.current,
          });
          return;
        }
        const pr = state.prs[state.current];
        const fn =
          state.action === "comment"
            ? () => commentOnPR(pr, body)
            : () => requestChanges(pr, body);
        const label =
          state.action === "comment" ? "Commented on" : "Requested changes on";
        runAction(
          pr,
          state.prs,
          state.current,
          fn,
          `${label} ${pr.repository}#${pr.number}`,
          true
        );
        return;
      }
      if (key.backspace || key.delete) {
        setState({ ...state, value: state.value.slice(0, -1) });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState({ ...state, value: state.value + input });
        return;
      }
      return;
    }

    // Handle scrollable views (diff and body)
    if (state.phase === "diff" || state.phase === "body") {
      if (key.escape || input === "q") {
        setState({
          phase: "reviewing",
          prs: state.prs,
          current: state.current,
        });
        return;
      }
      if (input === "j" || key.downArrow) {
        setState({ ...state, scrollOffset: state.scrollOffset + 1 });
        return;
      }
      if (input === "k" || key.upArrow) {
        setState({
          ...state,
          scrollOffset: Math.max(0, state.scrollOffset - 1),
        });
        return;
      }
      // Page down with space
      if (input === " ") {
        setState({ ...state, scrollOffset: state.scrollOffset + 20 });
        return;
      }
      // Home / top
      if (input === "g") {
        setState({ ...state, scrollOffset: 0 });
        return;
      }
      // End / bottom
      if (input === "G") {
        setState({
          ...state,
          scrollOffset: Math.max(0, state.lines.length - 20),
        });
        return;
      }
      // File navigation (diff only)
      if (state.phase === "diff") {
        if (input === "]") {
          const next = state.lines.findIndex(
            (l, i) => i > state.scrollOffset && l.startsWith("diff --git")
          );
          setState({
            ...state,
            scrollOffset: next !== -1 ? next : 0,
          });
          return;
        }
        if (input === "[") {
          let prev = -1;
          for (let i = state.scrollOffset - 1; i >= 0; i--) {
            if (state.lines[i].startsWith("diff --git")) {
              prev = i;
              break;
            }
          }
          if (prev === -1) {
            for (let i = state.lines.length - 1; i >= 0; i--) {
              if (state.lines[i].startsWith("diff --git")) {
                prev = i;
                break;
              }
            }
          }
          if (prev !== -1) {
            setState({ ...state, scrollOffset: prev });
          }
          return;
        }
      }
      return;
    }

    // Handle merge confirmation
    if (state.phase === "merge_confirm") {
      if (key.escape) {
        setState({
          phase: "reviewing",
          prs: state.prs,
          current: state.current,
        });
        return;
      }
      if (input === "1") {
        setState({ ...state, strategy: "merge" });
        return;
      }
      if (input === "2") {
        setState({ ...state, strategy: "squash" });
        return;
      }
      if (input === "3") {
        setState({ ...state, strategy: "rebase" });
        return;
      }
      if (key.return) {
        const pr = state.prs[state.current];
        runAction(
          pr,
          state.prs,
          state.current,
          () => mergePR(pr, state.strategy),
          `Merged ${pr.repository}#${pr.number} (${state.strategy})`,
          true
        );
        return;
      }
      return;
    }

    // Handle action done screen
    if (state.phase === "action") {
      if (input === "q") {
        exit();
        return;
      }
      if (state.advance) {
        advance(state.prs, state.current);
      } else {
        setState({
          phase: "reviewing",
          prs: state.prs,
          current: state.current,
        });
      }
      return;
    }

    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (state.phase !== "reviewing") return;

    const pr = state.prs[state.current];

    if (input === "n" || key.rightArrow || key.downArrow) {
      const next = state.current + 1;
      if (next >= state.prs.length) {
        setState({ phase: "empty" });
      } else {
        setState({ ...state, current: next });
      }
    }

    if (input === "p" || key.leftArrow || key.upArrow) {
      if (state.current > 0) {
        setState({ ...state, current: state.current - 1 });
      }
    }

    if (input === "s") {
      advance(state.prs, state.current);
    }

    if (input === "r") {
      setState({ phase: "loading" });
      fetchReviewRequests(filters)
        .then((prs) => {
          if (prs.length === 0) {
            setState({ phase: "empty" });
          } else {
            setState({ phase: "reviewing", prs, current: 0 });
          }
        })
        .catch((err) => {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        });
    }

    if (input === "a") {
      runAction(
        pr,
        state.prs,
        state.current,
        () => approvePR(pr),
        `Approved ${pr.repository}#${pr.number}`,
        true
      );
    }

    if (input === "c") {
      setState({
        phase: "input",
        prs: state.prs,
        current: state.current,
        action: "comment",
        value: "",
      });
    }

    if (input === "x") {
      setState({
        phase: "input",
        prs: state.prs,
        current: state.current,
        action: "request_changes",
        value: "",
      });
    }

    if (input === "k") {
      runAction(
        pr,
        state.prs,
        state.current,
        () => checkoutPR(pr),
        `Checked out ${pr.repository}#${pr.number}`,
        false
      );
    }

    if (input === "d") {
      setState({ phase: "loading" });
      fetchDiff(pr)
        .then((diff) => {
          setState({
            phase: "diff",
            prs: state.prs,
            current: state.current,
            lines: diff.split("\n"),
            scrollOffset: 0,
          });
        })
        .catch((err) => {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        });
    }

    if (input === "b") {
      const body = pr.body.trim() || "No description provided.";
      setState({
        phase: "body",
        prs: state.prs,
        current: state.current,
        lines: body.split("\n"),
        scrollOffset: 0,
      });
    }

    if (input === "m") {
      setState({
        phase: "merge_confirm",
        prs: state.prs,
        current: state.current,
        strategy: "squash",
      });
    }

    if (input === "o") {
      openInBrowser(pr);
    }

    if (input === "e") {
      runAction(
        pr,
        state.prs,
        state.current,
        () => checkoutAndOpenEditor(pr),
        `Opened editor for ${pr.repository}#${pr.number}`,
        false
      );
    }

    if (input === "l") {
      runAction(
        pr,
        state.prs,
        state.current,
        () => checkoutAndLaunchClaude(pr),
        `Claude Code session ended for ${pr.repository}#${pr.number}`,
        false
      );
    }
  });

  switch (state.phase) {
    case "loading":
      return <Loading />;
    case "auth_error":
      return <AuthError />;
    case "error":
      return (
        <Box paddingX={1}>
          <Box flexDirection="column">
            <Box>
              <Box marginRight={1}>
                <React.Fragment>❌</React.Fragment>
              </Box>
              <Box>
                <React.Fragment>{state.message}</React.Fragment>
              </Box>
            </Box>
          </Box>
        </Box>
      );
    case "empty":
      return <Empty />;
    case "action":
      return <ActionStatus message={state.message} />;
    case "input":
      return (
        <Box flexDirection="column" paddingX={1}>
          <PRContext
            pr={state.prs[state.current]}
            index={state.current}
            total={state.prs.length}
            filters={filters}
          />
          <Box marginTop={1}>
            <Text bold color="cyan">
              {state.action === "comment" ? "Comment" : "Request changes"}:{" "}
            </Text>
            <Text>{state.value}</Text>
            <Text dimColor>▎</Text>
          </Box>
          <Box>
            <Text dimColor>enter submit • esc cancel</Text>
          </Box>
        </Box>
      );
    case "diff":
      return (
        <DiffView
          pr={state.prs[state.current]}
          lines={state.lines}
          scrollOffset={state.scrollOffset}
        />
      );
    case "body":
      return (
        <BodyView
          pr={state.prs[state.current]}
          lines={state.lines}
          scrollOffset={state.scrollOffset}
        />
      );
    case "merge_confirm":
      return (
        <MergeConfirm
          pr={state.prs[state.current]}
          strategy={state.strategy}
        />
      );
    case "reviewing":
      return (
        <PRContext
          pr={state.prs[state.current]}
          index={state.current}
          total={state.prs.length}
          filters={filters}
        />
      );
  }
}
