import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { PRContext, Loading, Empty, AuthError, ActionStatus } from "./ui.js";
import {
  checkAuth,
  fetchReviewRequests,
  checkoutPR,
  approvePR,
  commentOnPR,
  requestChanges,
  openInBrowser,
  checkoutAndOpenEditor,
  checkoutAndLaunchClaude,
} from "./github.js";
import type { PullRequest } from "./types.js";

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
    };

export function App() {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({ phase: "loading" });

  useEffect(() => {
    const auth = checkAuth();
    if (!auth.authenticated) {
      setState({ phase: "auth_error" });
      return;
    }

    fetchReviewRequests()
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
    case "reviewing":
      return (
        <PRContext
          pr={state.prs[state.current]}
          index={state.current}
          total={state.prs.length}
        />
      );
  }
}
