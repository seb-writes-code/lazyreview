package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Application states
type state int

const (
	stateLoading state = iota
	stateReview
	stateComment
	stateRequestChanges
	stateClaudeCode
	stateEmpty
	stateError
	stateActionDone
)

// Messages
type prsLoadedMsg struct{ prs []PullRequest }
type errMsg struct{ err error }
type actionDoneMsg struct{ message string }

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("12"))

	repoStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("8"))

	authorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("13"))

	addStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("10"))

	delStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("9"))

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("8"))

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("11")).
			Bold(true)

	counterStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("8"))

	errorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("9")).
			Bold(true)
)

type model struct {
	state      state
	prs        []PullRequest
	index      int
	spinner    spinner.Model
	textInput  textinput.Model
	err        error
	message    string // transient status message
	width      int
	height     int
}

func newModel() model {
	s := spinner.New()
	s.Spinner = spinner.Dot

	ti := textinput.New()
	ti.Placeholder = "Enter your comment..."
	ti.CharLimit = 0
	ti.Width = 80

	return model{
		state:     stateLoading,
		spinner:   s,
		textInput: ti,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, loadPRs)
}

func loadPRs() tea.Msg {
	if err := checkGHAuth(); err != nil {
		return errMsg{err}
	}
	prs, err := fetchReviewRequests()
	if err != nil {
		return errMsg{err}
	}
	return prsLoadedMsg{prs}
}

func (m model) currentPR() PullRequest {
	return m.prs[m.index]
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case prsLoadedMsg:
		m.prs = msg.prs
		if len(m.prs) == 0 {
			m.state = stateEmpty
		} else {
			m.state = stateReview
			m.index = 0
		}
		return m, nil

	case errMsg:
		m.err = msg.err
		m.state = stateError
		return m, nil

	case actionDoneMsg:
		m.message = msg.message
		m.state = stateActionDone
		return m, nil

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}

	switch m.state {
	case stateReview:
		return m.updateReview(msg)
	case stateComment:
		return m.updateComment(msg)
	case stateRequestChanges:
		return m.updateRequestChanges(msg)
	case stateClaudeCode:
		return m.updateClaudeCode(msg)
	case stateActionDone:
		return m.updateActionDone(msg)
	case stateError:
		return m.updateError(msg)
	}

	return m, nil
}

func (m model) advance() (model, tea.Cmd) {
	m.prs = append(m.prs[:m.index], m.prs[m.index+1:]...)
	if len(m.prs) == 0 {
		m.state = stateEmpty
		return m, nil
	}
	if m.index >= len(m.prs) {
		m.index = 0
	}
	m.state = stateReview
	return m, nil
}

func (m model) updateReview(msg tea.Msg) (tea.Model, tea.Cmd) {
	if keyMsg, ok := msg.(tea.KeyMsg); ok {
		switch keyMsg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "a":
			pr := m.currentPR()
			m.state = stateLoading
			return m, func() tea.Msg {
				if err := approvePR(pr); err != nil {
					return errMsg{err}
				}
				return actionDoneMsg{fmt.Sprintf("Approved %s#%d", pr.Repo, pr.Number)}
			}
		case "c":
			m.state = stateComment
			m.textInput.SetValue("")
			m.textInput.Focus()
			return m, textinput.Blink
		case "x":
			m.state = stateRequestChanges
			m.textInput.SetValue("")
			m.textInput.Focus()
			return m, textinput.Blink
		case "s":
			// Skip: advance to next without action
			var cmd tea.Cmd
			m, cmd = m.advance()
			return m, cmd
		case "o":
			pr := m.currentPR()
			_ = openInBrowser(pr)
			return m, nil
		case "l":
			m.state = stateClaudeCode
			m.textInput.SetValue("")
			m.textInput.Placeholder = "Ask Claude about this PR..."
			m.textInput.Focus()
			return m, textinput.Blink
		}
	}
	return m, nil
}

func (m model) updateComment(msg tea.Msg) (tea.Model, tea.Cmd) {
	if keyMsg, ok := msg.(tea.KeyMsg); ok {
		switch keyMsg.String() {
		case "escape":
			m.state = stateReview
			return m, nil
		case "enter":
			body := m.textInput.Value()
			if strings.TrimSpace(body) == "" {
				m.state = stateReview
				return m, nil
			}
			pr := m.currentPR()
			m.state = stateLoading
			return m, func() tea.Msg {
				if err := commentOnPR(pr, body); err != nil {
					return errMsg{err}
				}
				return actionDoneMsg{fmt.Sprintf("Commented on %s#%d", pr.Repo, pr.Number)}
			}
		}
	}

	var cmd tea.Cmd
	m.textInput, cmd = m.textInput.Update(msg)
	return m, cmd
}

func (m model) updateRequestChanges(msg tea.Msg) (tea.Model, tea.Cmd) {
	if keyMsg, ok := msg.(tea.KeyMsg); ok {
		switch keyMsg.String() {
		case "escape":
			m.state = stateReview
			return m, nil
		case "enter":
			body := m.textInput.Value()
			if strings.TrimSpace(body) == "" {
				m.state = stateReview
				return m, nil
			}
			pr := m.currentPR()
			m.state = stateLoading
			return m, func() tea.Msg {
				if err := requestChanges(pr, body); err != nil {
					return errMsg{err}
				}
				return actionDoneMsg{fmt.Sprintf("Requested changes on %s#%d", pr.Repo, pr.Number)}
			}
		}
	}

	var cmd tea.Cmd
	m.textInput, cmd = m.textInput.Update(msg)
	return m, cmd
}

func (m model) updateClaudeCode(msg tea.Msg) (tea.Model, tea.Cmd) {
	if keyMsg, ok := msg.(tea.KeyMsg); ok {
		switch keyMsg.String() {
		case "escape":
			m.state = stateReview
			m.textInput.Placeholder = "Enter your comment..."
			return m, nil
		case "enter":
			question := m.textInput.Value()
			if strings.TrimSpace(question) == "" {
				m.state = stateReview
				m.textInput.Placeholder = "Enter your comment..."
				return m, nil
			}
			pr := m.currentPR()
			m.state = stateLoading
			return m, func() tea.Msg {
				if err := launchClaudeCode(pr, question); err != nil {
					return errMsg{err}
				}
				return actionDoneMsg{fmt.Sprintf("Claude Code answered question on %s#%d", pr.Repo, pr.Number)}
			}
		}
	}

	var cmd tea.Cmd
	m.textInput, cmd = m.textInput.Update(msg)
	return m, cmd
}

func (m model) updateActionDone(msg tea.Msg) (tea.Model, tea.Cmd) {
	if keyMsg, ok := msg.(tea.KeyMsg); ok {
		switch keyMsg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		default:
			// Any key advances to the next PR
			var cmd tea.Cmd
			m, cmd = m.advance()
			return m, cmd
		}
	}
	return m, nil
}

func (m model) updateError(msg tea.Msg) (tea.Model, tea.Cmd) {
	if keyMsg, ok := msg.(tea.KeyMsg); ok {
		switch keyMsg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "r":
			m.state = stateLoading
			return m, tea.Batch(m.spinner.Tick, loadPRs)
		}
	}
	return m, nil
}

func (m model) View() string {
	switch m.state {
	case stateLoading:
		return fmt.Sprintf("\n  %s Fetching review requests...\n", m.spinner.View())

	case stateEmpty:
		return "\n  🎉 No pending review requests. You're all caught up!\n\n  Press q to quit.\n"

	case stateError:
		return fmt.Sprintf("\n  %s %v\n\n  %s\n",
			errorStyle.Render("Error:"),
			m.err,
			helpStyle.Render("r retry • q quit"),
		)

	case stateActionDone:
		return fmt.Sprintf("\n  %s\n\n  %s\n",
			statusStyle.Render("✓ "+m.message),
			helpStyle.Render("Press any key for the next PR • q quit"),
		)

	case stateReview:
		return m.viewReview()

	case stateComment:
		return m.viewTextInput("Comment")

	case stateRequestChanges:
		return m.viewTextInput("Request changes")

	case stateClaudeCode:
		return m.viewTextInput("Ask Claude Code")
	}

	return ""
}

func (m model) viewReview() string {
	pr := m.currentPR()

	var b strings.Builder
	b.WriteString("\n")

	// Counter
	counter := counterStyle.Render(fmt.Sprintf("  [%d/%d]", m.index+1, len(m.prs)))
	b.WriteString(counter + "\n\n")

	// PR title
	b.WriteString("  " + titleStyle.Render(pr.Title) + "\n")

	// Repo and author
	b.WriteString("  " + repoStyle.Render(pr.Repo+"#"+fmt.Sprintf("%d", pr.Number)))
	b.WriteString(" by " + authorStyle.Render(pr.Author) + "\n")

	// Branch
	b.WriteString("  " + helpStyle.Render(pr.HeadRef+" → "+pr.BaseRef) + "\n")

	// Stats
	b.WriteString("  " + addStyle.Render(fmt.Sprintf("+%d", pr.Additions)))
	b.WriteString(" " + delStyle.Render(fmt.Sprintf("-%d", pr.Deletions)) + "\n")

	// Draft indicator
	if pr.IsDraft {
		b.WriteString("  " + helpStyle.Render("(draft)") + "\n")
	}

	b.WriteString("\n")

	// Actions
	b.WriteString("  " + helpStyle.Render("a approve • c comment • x request changes • l claude code • s skip • o open • q quit") + "\n")

	return b.String()
}

func (m model) viewTextInput(action string) string {
	pr := m.currentPR()

	var b strings.Builder
	b.WriteString("\n")
	b.WriteString("  " + statusStyle.Render(action) + " on ")
	b.WriteString(repoStyle.Render(fmt.Sprintf("%s#%d", pr.Repo, pr.Number)) + "\n\n")
	b.WriteString("  " + m.textInput.View() + "\n\n")
	b.WriteString("  " + helpStyle.Render("enter submit • esc cancel") + "\n")
	return b.String()
}
