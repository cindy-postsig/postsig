#!/bin/bash
set -e

VERSION=$1

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null
then
    echo "GitHub CLI (gh) could not be found. Please install it to create a PR automatically."
    exit 1
fi

if [ -z "$VERSION" ]; then
  DATE=$(date +%Y-%m-%d)
  BRANCH_NAME="release/$DATE"
  echo "No version provided, using date: $DATE"
else
  BRANCH_NAME="release/$VERSION"
  echo "Using provided version: $VERSION"
fi

git checkout staging
git pull
git checkout -b "$BRANCH_NAME"
git push origin "$BRANCH_NAME"

echo "Successfully created and pushed release branch $BRANCH_NAME"

echo "Creating Pull Request from $BRANCH_NAME to main..."
gh pr create --base main --head "$BRANCH_NAME" --title "Release: $BRANCH_NAME" --body "Merging release branch $BRANCH_NAME into main."

if [ $? -eq 0 ]; then
  echo "Successfully created Pull Request."
else
  echo "Failed to create Pull Request. Make sure you have the GitHub CLI installed and configured."
fi 