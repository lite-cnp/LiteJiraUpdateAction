/**
 * Lite Jira Update Action
 * ------------------------
 * This GitHub Action automatically posts a comment to one or more Jira issues when a pull request (PR) is merged.
 *
 * Use Cases:
 * - Notify Jira when a PR related to one or more tickets (e.g. DOSE-104, QA-202) is successfully merged.
 * - Improve traceability between GitHub activity and related Jira issues.
 * - Automatically update all subtasks and linked issues to keep all stakeholders informed.
 * - Streamline release workflows for engineering, QA, and product teams.
 *
 * Behavior:
 * - Triggered via `on: pull_request: types: [closed]`.
 * - Validates that the PR was actually merged (not just closed).
 * - Extracts Jira issue keys from the PR title, branch name, description and commit messages using regex (e.g. `ABC-123`).
 * - For each issue key found:
 *   - Retrieves related issues from Jira, including:
 *     - Subtasks
 *     - Inward and outward linked issues
 *   - Deduplicates the full list of issue keys using a Set.
 * - Builds a comment with:
 *   - PR author
 *   - PR title and description
 *   - List of changed files
 *   - Commit hashes and commit messages
 * - Posts the same comment to all related issues via the Jira REST API.
 *
 * Requirements:
 * - `JIRA_TOKEN` must be set as a GitHub Actions Secret (Bearer token for Jira REST API).
 * - `JIRA_DOMAIN` must be set as a GitHub Actions Secret (e.g. `https://yourdomain.atlassian.net`).
 * - The GitHub Action must have access to the `GITHUB_TOKEN` environment variable to retrieve PR metadata.
 * - Jira instance must support Bearer token authentication (using PAT).
 *
 * Security:
 * - Jira and GitHub tokens are passed as environment variables.
 * - SSL certificate validation is disabled (`rejectUnauthorized: false`) for compatibility with internal Jira servers.
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
        Authorization: `Bearer ${JIRA_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ body: commentText }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      core.setFailed(
        `Failed to post Jira comment (${response.status}): ${errorText}`
      );
      return;
    }

    const data = await response.json();
    console.log(
      `Successfully posted comment to ${issueKey}. Comment ID: ${data.id}`
    );
  } catch (error) {
    core.setFailed(`Error posting to Jira: ${error.message}`);
  }
}

async function getRelatedIssueKeys(issueKey) {
  const url = `${JIRA_DOMAIN}/rest/api/2/issue/${issueKey}?fields=subtasks,issuelinks`;
  const relatedKeys = new Set();

  try {
    const response = await fetch(url, {
      method: "GET",
      agent,
      headers: {
        Authorization: `Bearer ${JIRA_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `Failed to fetch related issues for ${issueKey}: ${response.status} ${errorText}`
      );
      return [];
    }

    const data = await response.json();

    // Add subtasks
    const subtasks = data.fields.subtasks || [];
    subtasks.forEach((sub) => sub.key && relatedKeys.add(sub.key));

    // Add issue links
    const links = data.fields.issuelinks || [];
    links.forEach((link) => {
      const inward = link.inwardIssue?.key;
      const outward = link.outwardIssue?.key;
      if (inward) relatedKeys.add(inward);
      if (outward) relatedKeys.add(outward);
    });

    return Array.from(relatedKeys);
  } catch (error) {
    console.warn(
      `Error retrieving related issues for ${issueKey}: ${error.message}`
    );
    return [];
  }
}

function extractIssueKeys(texts) {
  let keys = new Set();

  for (const text of texts) {
    if (!text) continue; // go to next iteration if text is empty

    // Regex to match Jira issue keys like DOSE-104, JIRA-123, etc.
    const regex = /\b[A-Z]{2,10}-\d+\b/g; // word boundary, uppercase letters (2-10), hyphen, digits, word boundary.
    // g is the global flag. It tells JavaScript to find all matches in the string.
    const matches = text.toUpperCase().match(regex);

    if (matches) {
      matches.forEach((key) => keys.add(key));
    }
  }

  return Array.from(keys); // Convert Set to Array
}

async function getCommits(prNumber) {
  const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

  if (!octokit) {
    core.setFailed("GITHUB_TOKEN is not set.");
    return { lines: [], messages: [] };
  }

  const { data } = await octokit.rest.pulls.listCommits({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: prNumber,
  });

  const lines = [];
  const messages = [];

  for (const commit of data) {
    const sha = commit.sha ? commit.sha.substring(0, 7) : "(no sha)";
    const message = commit.commit?.message || "(no message)";
    const summary = message.split("\n")[0];

    lines.push(`- ${sha}: ${summary}`);
    messages.push(message);
  }

  return { lines, messages };
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

  return data.map((file) => file.filename);
}

function buildComment(pr, filesChanged = [], commits = []) {
  const author = pr.user?.login || "unknown";
  const title = pr.title || "(no title)";
  const body = pr.body || "(no description)";
  const prUrl = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/pull/${pr.number}`;
  const fileList =
    filesChanged.length > 0
      ? `\n\nFiles Changed:\n- ` + filesChanged.join("\n- ")
      : "";
  const commitList =
    commits.length > 0 ? `\n\nCommits:\n` + commits.join("\n") : "";

  // Build the comment text
  return `
Pull request [#${pr.number}](${prUrl}) was merged by @${author}.

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

  const commits = await getCommits(pr.number);
  const issueKeys = extractIssueKeys([
    pr.title, // PR title
    pr.head?.ref, // PR branch name
    pr.body, // PR description
    ...commits.messages, // include commit messages in search
  ]);

  if (issueKeys.length === 0) {
    core.setFailed(
      "No Jira issue keys found in PR title, description, branch name, or commit messages."
    );
    return;
  }

  const filesChanged = await getModifiedFiles(pr.number);
  const commentText = buildComment(pr, filesChanged, commits.lines);

  const allKeys = new Set(issueKeys);

  for (const issueKey of issueKeys) {
    // Get related issues
    const relatedKeys = await getRelatedIssueKeys(issueKey);
    relatedKeys.forEach((k) => allKeys.add(k));
  }

  // Comment on all unique keys
  for (const key of allKeys) {
    console.log(`Posting comment to Jira issue ${key}...`);
    await postComment(key, commentText);
  }
}

runWithPR();
