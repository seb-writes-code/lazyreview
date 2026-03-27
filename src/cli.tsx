#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { parseArgs } from "node:util";
import { App } from "./app.js";
import type { Filters } from "./types.js";

const { values } = parseArgs({
  options: {
    repo: { type: "string", short: "r" },
    author: { type: "string", short: "a" },
    "no-drafts": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: lazyreview [options]

Options:
  -r, --repo <owner/name>  Filter to a specific repository
  -a, --author <login>     Filter by PR author
      --no-drafts          Exclude draft PRs
  -h, --help               Show this help message`);
  process.exit(0);
}

const filters: Filters = {
  repo: values.repo,
  author: values.author,
  noDrafts: values["no-drafts"],
};

render(<App filters={filters} />);
