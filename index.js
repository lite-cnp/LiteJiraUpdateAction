/**
 * Lite Jira Update Action
 * ------------------------
 * This GitHub Action automatically posts a comment to a Jira issue when a pull request (PR) is merged.
 * 
 * Use Cases:
 * - Notify Jira when a PR related to a ticket (e.g. DOSE-104) is successfully merged.
 * - Improve traceability between GitHub activity and Jira tickets.
 * - Streamline release workflows for engineering and QA teams.
 * 
 * Behavior:
 * - Triggered via `on: pull_request: types: [closed]`.
 * - Checks if the PR was merged (not just closed).
 * - Extracts a Jira issue key from the PR title or branch name using regex (e.g. `DOSE-104`).
 * - Builds a comment using PR metadata (author, title, description, files changed).
 * - Sends the comment to the related Jira issue via REST API.
 * 
 * Requirements:
 * - JIRA_TOKEN must be set as a GitHub Action Secret.
 * - JIRA_DOMAIN must be set as a GitHub Action Secret.
 * - The GitHub Action must have access to the `GITHUB_TOKEN` environment variable.
 * - The Jira instance must accept Bearer token authentication via Personal Access Tokens (PAT).
 * 
 * Security:
 * - JIRA_TOKEN is never printed to logs.
 * - SSL cert validation is disabled via `rejectUnauthorized: false`, which is acceptable for internal enterprise Jira servers.
 * 
 * Author: Ujjval Rajput
 */
const core = require("@actions/core");
const fetch = require("node-fetch");
const https = require("https");
const github = require("@actions/github");

const JIRA_DOMAIN = process.env.JIRA_DOMAIN;

const JIRA_TOKEN = process.env.JIRA_TOKEN;

const agent = new https.Agent({ rejectUnauthorized: false });

async function postComment(issueKey, commentText) {
  const url = `${JIRA_DOMAIN}/rest/api/2/issue/${issueKey}/comment`;

  try {
    const response = await fetch(url, {
      method: "POST",
      agent,
      headers: {
        "Authorization": `Bearer ${JIRA_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ body: commentText }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      core.setFailed(`Failed to post Jira comment (${response.status}): ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log(`Successfully posted comment to ${issueKey}. Comment ID: ${data.id}`);
  } catch (error) {
    core.setFailed(`Error posting to Jira: ${error.message}`);
  }
}

function extractIssueKeys(texts) {
  let keys = new Set();
  
  for (const text of texts) {
    if (!text) continue; // go to next iteration if text is empty

    // Regex to match Jira issue keys like DOSE-104, JIRA-123, etc.
    const regex = /\b[A-Z]{2,10}-\d+\b/g; 
    const matches = text.toUpperCase().match(regex);
    
    if (matches) {
      matches.forEach(key => keys.add(key));
    }
  }

  return Array.from(keys); // Convert Set to Array
}

async function getCommits(prNumber) {
  const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

  if (!octokit) {
    core.setFailed("GITHUB_TOKEN is not set.");
    return [];
  }

  const { data } = await octokit.rest.pulls.listCommits({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: prNumber,
  });

    return data.map(commit => {
      const sha = commit.sha ? commit.sha.substring(0, 7) : "(no sha)";
      const message = commit.commit && commit.commit.message
      ? commit.commit.message.split("\n")[0]
      : "(no message)";
      return `- ${sha}: ${message}`;
    });
  }

async function getModifiedFiles(prNumber) {
  const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
  if (!octokit) {
    core.setFailed("GITHUB_TOKEN is not set.");
    return [];
  }

  const { data } = await octokit.rest.pulls.listFiles({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: prNumber,
  });

  return data.map(file => file.filename);
}

function buildComment(pr, filesChanged = [], commits = []) {
  const author = pr.user?.login || "unknown";
  const title = pr.title || "(no title)";
  const body = pr.body || "(no description)";
  const fileList = filesChanged.length > 0
    ? `\n\nFiles Changed:\n- ` + filesChanged.join("\n- ")
    : "";
  const commitList = commits.length > 0
  ? `\n\nCommits:\n` + commits.join("\n")
  : "";

  return `
Pull request merged by @${author}

PR Title:
${title}

PR Description:
${body}${fileList}${commitList}
`.trim();
}

async function runWithPR() {
  if (!JIRA_TOKEN) {
    core.setFailed("Missing JIRA_TOKEN environment variable.");
    return;
  }

  if (!JIRA_DOMAIN) {
    core.setFailed("Missing JIRA_DOMAIN environment variable.");
    return;
  }

  const pr = github.context.payload.pull_request; // Get the pull request object from the context
  const wasMerged = pr?.merged;

  if (!wasMerged) {
    console.log("PR was closed but not merged. No Jira comment needed.");
    return;
  }

  const issueKeys = extractIssueKeys([pr.title, pr.head?.ref, pr.body]); // Check title, branch name, and body for issue key
  if (issueKeys.length === 0) {
    core.setFailed("No Jira issue keys found in PR title, branch name, or body.");
    return;
  }

  const filesChanged = await getModifiedFiles(pr.number);
  const commits = await getCommits(pr.number);
  const commentText = buildComment(pr, filesChanged, commits);

  for (const issueKey of issueKeys) {
    console.log(`Posting comment to Jira issue ${issueKey}...`);
    await postComment(issueKey, commentText);
  }
}

runWithPR();