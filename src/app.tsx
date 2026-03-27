import React, { useState, useEffect } from "react";
import { Box, useApp, useInput } from "ink";
import { PRContext, Loading, Empty, AuthError } from "./ui.js";
import { checkAuth, fetchReviewRequests } from "./github.js";
import type { PullRequest } from "./types.js";

type AppState =
  | { phase: "loading" }
  | { phase: "auth_error" }
  | { phase: "error"; message: string }
  | { phase: "empty" }
  | { phase: "reviewing"; prs: PullRequest[]; current: number };

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
    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (state.phase !== "reviewing") return;

    if (input === "n" || key.rightArrow || key.downArrow) {
      // Next PR
      const next = state.current + 1;
      if (next >= state.prs.length) {
        setState({ phase: "empty" });
      } else {
        setState({ ...state, current: next });
      }
    }

    if (input === "p" || key.leftArrow || key.upArrow) {
      // Previous PR
      if (state.current > 0) {
        setState({ ...state, current: state.current - 1 });
      }
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
