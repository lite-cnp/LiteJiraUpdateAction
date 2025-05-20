const core = require("@actions/core");
const fetch = require("node-fetch");
const https = require("https");

const JIRA_DOMAIN = "https://jira.lumentum.com";
const ISSUE_KEY = "DOSE-104";
const COMMENT = "Testing Jira comment posting from GitHub Actions.";

const JIRA_USER = process.env.JIRA_USER;
const JIRA_TOKEN = process.env.JIRA_TOKEN;

const agent = new https.Agent({ rejectUnauthorized: false });

async function postComment() {
  const url = `${JIRA_DOMAIN}/rest/api/2/issue/${ISSUE_KEY}/comment`;

  try {
    const response = await fetch(url, {
      method: "POST",
      agent,
      headers: {
        "Authorization": "Basic " + Buffer.from(`${JIRA_USER}:${JIRA_TOKEN}`).toString("base64"),
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ body: COMMENT }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      core.setFailed(`Failed to post Jira comment (${response.status}): ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log(`Successfully posted comment to ${ISSUE_KEY}. Comment ID: ${data.id}`);
  } catch (error) {
    core.setFailed(`Error posting to Jira: ${error.message}`);
  }
}

postComment();
