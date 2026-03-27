# lazyreview

Terminal-first tool for rapidly triaging and reviewing GitHub pull request review requests one at a time.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated via `gh auth login`

## Install

```bash
npm install
npm run build
```

## Usage

```bash
node dist/cli.js
```

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `n` / `→` / `↓` | Next PR |
| `p` / `←` / `↑` | Previous PR |
| `q` / `Esc` | Quit |

## What it shows

For each pending review request:

- PR title and number
- Repository and author
- Diff stats (+additions, -deletions, changed files)
- Labels
- Review status per reviewer (approved, changes requested, commented)
- Comment count
- Link to the PR on GitHub
