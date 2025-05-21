const core = require("@actions/core");
const fetch = require("node-fetch");
const https = require("https");
const github = require("@actions/github");

const JIRA_DOMAIN = "https://jira.lumentum.com";
const ISSUE_KEY = "DOSE-104";
const COMMENT = "Testing Jira comment posting from GitHub Actions.";

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

// ------------------
// Dynamic PR-based comment logic
// ------------------

function extractIssueKey(text) {
  const match = text.match(/\b[A-Z]{2,10}-\d+\b/);
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

  const pr = github.context.payload.pull_request;
  const wasMerged = pr?.merged;

  if (!wasMerged) {
    console.log("PR was closed but not merged. No Jira comment needed.");
    return;
  }

  const issueKey = extractIssueKey(pr.title || pr.head.ref);
  if (!issueKey) {
    core.setFailed("No Jira issue key found in PR title or branch.");
    return;
  }

  const commentText = buildComment(pr);
  console.log(`Posting enriched comment to issue ${issueKey}...`);
  await postComment(issueKey, commentText);
}

runWithPR();

