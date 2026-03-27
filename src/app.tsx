import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { PRContext, Loading, Empty, AuthError } from "./ui.js";
import { checkAuth, fetchReviewRequests, launchClaudeCode } from "./github.js";
import type { PullRequest } from "./types.js";

type AppState =
  | { phase: "loading" }
  | { phase: "auth_error" }
  | { phase: "error"; message: string }
  | { phase: "empty" }
  | { phase: "reviewing"; prs: PullRequest[]; current: number }
  | { phase: "claude_input"; prs: PullRequest[]; current: number; query: string }
  | { phase: "claude_running"; prs: PullRequest[]; current: number };

export function App() {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({ phase: "loading" });

  useEffect(() => {
    const auth = checkAuth();
    if (!auth.authenticated) {
      setState({ phase: "auth_error" });
      return;
    }

    try {
      const prs = fetchReviewRequests();
      if (prs.length === 0) {
        setState({ phase: "empty" });
      } else {
        setState({ phase: "reviewing", prs, current: 0 });
      }
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useInput((input, key) => {
    // Don't handle keys when in text input mode
    if (state.phase === "claude_input" || state.phase === "claude_running") {
      if (key.escape && state.phase === "claude_input") {
        setState({ phase: "reviewing", prs: state.prs, current: state.current });
      }
      return;
    }

    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (state.phase !== "reviewing") return;

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

    if (input === "l") {
      setState({ phase: "claude_input", prs: state.prs, current: state.current, query: "" });
    }
  });

  const handleClaudeSubmit = async (query: string) => {
    if (state.phase !== "claude_input") return;
    if (!query.trim()) {
      setState({ phase: "reviewing", prs: state.prs, current: state.current });
      return;
    }

    setState({ phase: "claude_running", prs: state.prs, current: state.current });

    try {
      await launchClaudeCode(state.prs[state.current], query);
      setState({ phase: "reviewing", prs: state.prs, current: state.current });
    } catch (err) {
      setState({
        phase: "error",
        message: `Claude Code: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

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
    case "claude_running":
      return (
        <Box paddingX={1} flexDirection="column">
          <PRContext pr={state.prs[state.current]} index={state.current} total={state.prs.length} />
          <Box marginTop={1}>
            <Text dimColor>Running Claude Code...</Text>
          </Box>
        </Box>
      );
    case "claude_input":
      return (
        <Box paddingX={1} flexDirection="column">
          <PRContext pr={state.prs[state.current]} index={state.current} total={state.prs.length} />
          <Box marginTop={1}>
            <Text bold color="cyan">Ask Claude Code: </Text>
            <TextInput
              value={state.query}
              onChange={(value) => setState({ ...state, query: value })}
              onSubmit={handleClaudeSubmit}
            />
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
