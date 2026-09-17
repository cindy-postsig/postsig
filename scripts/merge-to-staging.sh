#!/bin/bash

set -e

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "development" ]; then
    echo "Error: You must be on the development branch to run this script"
    exit 1
fi

echo "Pulling latest changes from development..."
git pull origin development

echo "Switching to staging branch..."
git checkout staging

echo "Pulling latest changes from staging..."
git pull origin staging

echo "Merging development into staging..."
git merge development --no-ff -m "chore: merge development into staging"

echo "Pushing changes to staging..."
git push origin staging

echo "Switching back to development branch..."
git checkout development

echo "✅ Successfully merged development into staging"