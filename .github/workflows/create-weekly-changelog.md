---
description: Creates an issue summarizing merged PRs each week
on: weekly
tools:
  github:
    toolsets:
      - actions
      - issues
      - pull_requests
permissions:
  actions: read
  issues: read
  pull-requests: read
  copilot-requests: write
safe-outputs:
  create-issue:
# Unsupported fields preserved from source JSON:
# model: auto
---

# Create weekly changelog

Review pull requests merged in the last 7 days and create a succinct changelog summarizing the changes.
If possible, show the PRs for the related changes
Group the changes in sections
Format nicely
