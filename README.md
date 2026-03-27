# lazyreview

Terminal-first tool for rapidly triaging and reviewing GitHub pull request review requests one at a time.

## Prerequisites

- [Go](https://go.dev/dl/) 1.22+
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated

## Install

```sh
go install github.com/cmraible/lazyreview@latest
```

## Usage

```sh
lazyreview
```

The tool fetches your pending review requests and presents them one at a time. After each action, the next PR appears immediately.

### Key bindings

| Key | Action |
|-----|--------|
| `a` | Approve the current PR |
| `c` | Comment on the current PR |
| `x` | Request changes on the current PR |
| `s` | Skip to the next PR |
| `o` | Open in browser |
| `q` | Quit |
