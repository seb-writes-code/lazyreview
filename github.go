package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// PullRequest represents a GitHub pull request awaiting review.
type PullRequest struct {
	Number     int    `json:"number"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	Author     string `json:"author"`
	Repo       string `json:"repo"`
	HeadRef    string `json:"headRefName"`
	BaseRef    string `json:"baseRefName"`
	Additions  int    `json:"additions"`
	Deletions  int    `json:"deletions"`
	CreatedAt  string `json:"createdAt"`
	IsDraft    bool   `json:"isDraft"`
	Body       string `json:"body"`
}

// ghSearchResult is the raw shape returned by `gh search prs`.
type ghSearchResult struct {
	Number    int    `json:"number"`
	Title     string `json:"title"`
	URL       string `json:"url"`
	Author    struct {
		Login string `json:"login"`
	} `json:"author"`
	Repository struct {
		NameWithOwner string `json:"nameWithOwner"`
	} `json:"repository"`
	HeadRefName string `json:"headRefName"`
	BaseRefName string `json:"baseRefName"`
	Additions   int    `json:"additions"`
	Deletions   int    `json:"deletions"`
	CreatedAt   string `json:"createdAt"`
	IsDraft     bool   `json:"isDraft"`
	Body        string `json:"body"`
}

// checkGHAuth verifies that the gh CLI is installed and authenticated.
func checkGHAuth() error {
	cmd := exec.Command("gh", "auth", "status")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("gh auth check failed: %s\n%s", err, string(out))
	}
	return nil
}

// currentUser returns the authenticated GitHub username.
func currentUser() (string, error) {
	cmd := exec.Command("gh", "api", "user", "--jq", ".login")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get current user: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// fetchReviewRequests retrieves open PRs where the current user's review is requested.
func fetchReviewRequests() ([]PullRequest, error) {
	user, err := currentUser()
	if err != nil {
		return nil, err
	}

	cmd := exec.Command("gh", "search", "prs",
		"--review-requested", user,
		"--state", "open",
		"--json", "number,title,url,author,repository,headRefName,baseRefName,additions,deletions,createdAt,isDraft,body",
	)

	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to search PRs: %w", err)
	}

	var results []ghSearchResult
	if err := json.Unmarshal(out, &results); err != nil {
		return nil, fmt.Errorf("failed to parse PR data: %w", err)
	}

	prs := make([]PullRequest, len(results))
	for i, r := range results {
		prs[i] = PullRequest{
			Number:    r.Number,
			Title:     r.Title,
			URL:       r.URL,
			Author:    r.Author.Login,
			Repo:      r.Repository.NameWithOwner,
			HeadRef:   r.HeadRefName,
			BaseRef:   r.BaseRefName,
			Additions: r.Additions,
			Deletions: r.Deletions,
			CreatedAt: r.CreatedAt,
			IsDraft:   r.IsDraft,
			Body:      r.Body,
		}
	}
	return prs, nil
}

// approvePR submits an approval review on the given PR.
func approvePR(pr PullRequest) error {
	cmd := exec.Command("gh", "pr", "review", fmt.Sprintf("%d", pr.Number),
		"--repo", pr.Repo,
		"--approve",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("approve failed: %s\n%s", err, string(out))
	}
	return nil
}

// commentOnPR submits a comment review on the given PR.
func commentOnPR(pr PullRequest, body string) error {
	cmd := exec.Command("gh", "pr", "review", fmt.Sprintf("%d", pr.Number),
		"--repo", pr.Repo,
		"--comment",
		"--body", body,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("comment failed: %s\n%s", err, string(out))
	}
	return nil
}

// requestChanges submits a request-changes review on the given PR.
func requestChanges(pr PullRequest, body string) error {
	cmd := exec.Command("gh", "pr", "review", fmt.Sprintf("%d", pr.Number),
		"--repo", pr.Repo,
		"--request-changes",
		"--body", body,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("request changes failed: %s\n%s", err, string(out))
	}
	return nil
}

// openInBrowser opens the PR URL in the default browser.
func openInBrowser(pr PullRequest) error {
	cmd := exec.Command("gh", "pr", "view", fmt.Sprintf("%d", pr.Number),
		"--repo", pr.Repo,
		"--web",
	)
	return cmd.Run()
}
