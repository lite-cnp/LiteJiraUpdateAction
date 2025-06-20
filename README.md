# Lite Jira Update Action

Automatically posts a detailed comment to one or more Jira issues when a pull request (PR) is merged.

This GitHub Action helps teams maintain traceability between code changes and Jira tickets by automatically commenting on relevant issues — including subtasks and linked issues — with metadata from the pull request.

---

## Features

- Extracts **Jira issue keys** from:
  - PR title
  - PR description
  - PR branch name
  - Commit messages
- Automatically discovers and includes:
  - Subtasks of each Jira issue
  - Inward and outward **linked issues**
- Posts a comment with:
  - PR number and link
  - PR author
  - PR title and description
  - List of all files changed in the PR
  - Commit hashes and messages
- Deduplicates all discovered issue keys to prevent double-posting

## Usage

```yaml
on:
  pull_request:
    types: [closed]

permissions:
  contents: read
  pull-requests: read

jobs:
  comment-on-jira:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: liteUjjvalRajput/LiteJiraUpdateAction@v1.0.0
        env:
          JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
          JIRA_DOMAIN: ${{ secrets.JIRA_DOMAIN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
````

## Required Secrets

* `JIRA_TOKEN`: Jira PAT (Personal Access Token)
* `JIRA_DOMAIN`: e.g. `https://jira.lumentum.com`

## PR Title Instance

```
PROJ-123: Add logging
```
