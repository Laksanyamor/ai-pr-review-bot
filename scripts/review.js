const core = require('@actions/core');
const github = require('@actions/github');

// Keep the diff within a safe size so the request stays fast and cheap.
const MAX_DIFF_CHARS = 12000;

// Swap this if you want a different model. See docs.claude.com for current model strings.
const MODEL = 'claude-sonnet-5';

async function getPullRequestDiff(octokit, owner, repo, pullNumber) {
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: { format: 'diff' },
  });
  // When mediaType format is "diff", the API returns the raw diff text as data.
  return response.data;
}

function truncateDiff(diff) {
  if (diff.length <= MAX_DIFF_CHARS) {
    return { diff, truncated: false };
  }
  return { diff: diff.slice(0, MAX_DIFF_CHARS), truncated: true };
}

function buildPrompt(diff, truncated) {
  const truncationNote = truncated
    ? '\n\nNote: this diff was truncated to fit a size limit, so only the first part of the change set is shown.'
    : '';

  return `You are reviewing a pull request diff for a software project. Review it like an experienced engineer doing a thoughtful code review, not a linter.

Focus on:
1. Potential bugs or logic errors
2. Security issues (injection, unsafe input handling, secrets, etc.)
3. Architectural or design concerns worth flagging
4. Anything that is unclear or could use a comment

Skip purely cosmetic nitpicks (spacing, formatting) unless they indicate a real problem.

Format your response as markdown with short sections. If everything looks fine, say so briefly instead of inventing issues.

Here is the diff:

\`\`\`diff
${diff}
\`\`\`${truncationNote}`;
}

async function reviewWithClaude(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const textBlocks = data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text);

  return textBlocks.join('\n').trim() || 'No review text was returned.';
}

async function run() {
  try {
    const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    const anthropicApiKey = core.getInput('anthropic-api-key') || process.env.ANTHROPIC_API_KEY;

    if (!githubToken) throw new Error('Missing github-token / GITHUB_TOKEN.');
    if (!anthropicApiKey) throw new Error('Missing anthropic-api-key / ANTHROPIC_API_KEY.');

    const context = github.context;
    const pullRequest = context.payload.pull_request;

    if (!pullRequest) {
      core.info('No pull request found in the event payload. Skipping review.');
      return;
    }

    const { owner, repo } = context.repo;
    const pullNumber = pullRequest.number;

    const octokit = github.getOctokit(githubToken);

    core.info(`Fetching diff for PR #${pullNumber}...`);
    const rawDiff = await getPullRequestDiff(octokit, owner, repo, pullNumber);

    if (!rawDiff || rawDiff.trim().length === 0) {
      core.info('Diff is empty. Nothing to review.');
      return;
    }

    const { diff, truncated } = truncateDiff(rawDiff);
    const prompt = buildPrompt(diff, truncated);

    core.info('Sending diff to Claude for review...');
    const reviewText = await reviewWithClaude(anthropicApiKey, prompt);

    const commentBody = `### AI Code Review\n\n${reviewText}\n\n---\n*Generated automatically from the PR diff. Not a substitute for human review.*`;

    core.info('Posting review comment...');
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: commentBody,
    });

    core.info('Done.');
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
