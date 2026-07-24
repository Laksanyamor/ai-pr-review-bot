# AI PR Review Bot

A GitHub Action that automatically reviews pull requests using Claude. When a PR is opened or updated, it fetches the diff, sends it to Claude for review, and posts the feedback as a comment on the PR.

## Why I built this

Code review is one of the highest leverage but most time consuming parts of shipping software. Basic linters catch style issues, but they do not catch logic errors, security concerns, or architectural smells. This project explores using an LLM to do a first pass review that actually understands context, so human reviewers can spend their time on the things that matter most.

## How it works

1. A pull request is opened or updated
2. The GitHub Action checks out the repo and fetches the PR diff via the GitHub API
3. The diff is sent to Claude with a prompt focused on bugs, security issues, and design concerns
4. Claude's response is posted back to the PR as a comment

## Setup

1. Add this repository's `.github/workflows/review.yml` and `scripts/review.js` to your project (or fork this repo).
2. In your repo settings, add a secret called `ANTHROPIC_API_KEY` with your Anthropic API key. You can get one at [console.anthropic.com](https://console.anthropic.com).
3. `GITHUB_TOKEN` is provided automatically by GitHub Actions, no setup needed.
4. Open a pull request. The review comment should appear within a minute or two.

## Local development

```bash
npm install
```

To test the script locally you will need to simulate the GitHub Actions environment (event payload, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`). The easiest way is to test it inside an actual PR in a scratch repo rather than running it locally.

## Limitations

- The diff is truncated at 12000 characters to keep requests fast and inexpensive. Very large PRs will only get a partial review.
- This is a first pass reviewer, not a replacement for human review.
- No fine tuning, this uses a general purpose model with a review focused prompt.

## Possible next steps

- Support inline comments on specific lines instead of one summary comment
- Track review quality metrics over time
- Support other version control platforms
