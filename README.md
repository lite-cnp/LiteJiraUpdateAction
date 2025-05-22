# Lite Jira Update Action

Automatically posts a comment to a Jira issue when a pull request is merged.

## Features

- Extracts Jira issue key from PR title or branch (e.g. `PROJ-123`)
- Posts comment with PR metadata: author, title, description, changed files

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
