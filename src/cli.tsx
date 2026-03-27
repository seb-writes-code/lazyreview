#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { parseArgs } from "node:util";
import { App } from "./app.js";
import type { Filters, SortField } from "./types.js";

const VALID_SORTS: SortField[] = ["updated", "created", "size", "ci"];

const { values } = parseArgs({
  options: {
    repo: { type: "string", short: "r" },
    author: { type: "string", short: "a" },
    "no-drafts": { type: "boolean" },
    sort: { type: "string", short: "s" },
    reverse: { type: "boolean" },
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
  -s, --sort <field>       Sort queue: updated, created, size, ci
      --reverse            Reverse sort order
  -h, --help               Show this help message`);
  process.exit(0);
}

if (values.sort && !VALID_SORTS.includes(values.sort as SortField)) {
  console.error(`Invalid sort field: ${values.sort}. Must be one of: ${VALID_SORTS.join(", ")}`);
  process.exit(1);
}

const filters: Filters = {
  repo: values.repo,
  author: values.author,
  noDrafts: values["no-drafts"],
  sort: values.sort as SortField | undefined,
  reverse: values.reverse,
};

render(<App filters={filters} />);
