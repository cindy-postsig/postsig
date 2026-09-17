#!/bin/bash
set -e

if ! command -v gh &> /dev/null
then
    echo "GitHub CLI (gh) could not be found. Please install it to create a PR automatically."
    exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$CURRENT_BRANCH" == "main" ] || [ "$CURRENT_BRANCH" == "development" ] || [ "$CURRENT_BRANCH" == "staging" ]; then
  echo "Error: Cannot create feature PR from main, development, or staging branches."
  exit 1
fi

echo "Pushing branch $CURRENT_BRANCH to origin..."
git push origin "$CURRENT_BRANCH"

git fetch origin development
COMMIT_MESSAGES=$(git log origin/development..HEAD --pretty=format:"- %s" --reverse)

if [ -z "$COMMIT_MESSAGES" ]; then
    echo "No new commits found on branch $CURRENT_BRANCH compared to origin/development."
    exit 1 
fi

PR_TITLE="$CURRENT_BRANCH"
BODY_CONTENT=$(printf "Commits on this branch:\n%s" "$COMMIT_MESSAGES")

echo "Creating Pull Request from $CURRENT_BRANCH to development..."
echo "$BODY_CONTENT" | gh pr create --base development --head "$CURRENT_BRANCH" --title "$PR_TITLE" --body-file -

if [ $? -eq 0 ]; then
  echo "Successfully created Pull Request for $CURRENT_BRANCH."
else
  echo "Failed to create Pull Request."
  exit 1
fi 