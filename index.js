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
 * - Builds a comment using PR metadata (author, title, description).
 * - Sends the comment to the related Jira issue via REST API.
 * 
 * Requirements:
 * - JIRA_TOKEN must be set as a GitHub Action Secret.
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

const JIRA_DOMAIN = "https://jira.lumentum.com";
// const ISSUE_KEY = "DOSE-104";
// const COMMENT = "Testing Jira comment posting from GitHub Actions.";

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

// postComment(ISSUE_KEY, COMMENT); // comment when using dynamic PR-based comment logic

// Dynamic PR-based comment logic

function extractIssueKey(text) {
  const match = text.match(/\b[A-Z]{2,10}-\d+\b/); // boundary, uppercase, 2-10 chars, hyphen, digits, boundary
  return match ? match[0] : null;
}

function buildComment(pr) {
  const author = pr.user?.login || "unknown";
  const title = pr.title || "(no title)";
  const body = pr.body || "(no description)";
  return `
Pull request merged by @${author}

PR Title:
${title}

PR Description:
${body}
`.trim();
}

async function runWithPR() {
  if (!JIRA_TOKEN) {
    core.setFailed("Missing JIRA_TOKEN environment variable.");
    return;
  }

  const pr = github.context.payload.pull_request; // Get the pull request object from the context
  const wasMerged = pr?.merged;

  if (!wasMerged) {
    console.log("PR was closed but not merged. No Jira comment needed.");
    return;
  }

  const issueKey = extractIssueKey(pr.title || pr.head.ref); // Check both title and branch name
  if (!issueKey) {
    core.setFailed("No Jira issue key found in PR title or branch.");
    return;
  }

  const commentText = buildComment(pr);
  console.log(`Posting comment to issue ${issueKey}...`);
  await postComment(issueKey, commentText);
}

runWithPR();