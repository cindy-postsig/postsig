#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/finish-release.sh <major|minor|patch>"
  exit 1
fi

VERSION_TYPE=$1

if [[ "$VERSION_TYPE" != "major" && "$VERSION_TYPE" != "minor" && "$VERSION_TYPE" != "patch" ]]; then
  echo "Invalid version type: $VERSION_TYPE. Must be major, minor, or patch."
  exit 1
fi

echo "Switching to main branch and pulling latest changes..."
git checkout main
git pull

LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")

LATEST_TAG_NUMBERS=$(echo $LATEST_TAG | sed 's/^v//')

IFS='.' read -r -a V_PARTS <<< "$LATEST_TAG_NUMBERS"
MAJOR=${V_PARTS[0]}
MINOR=${V_PARTS[1]}
PATCH=${V_PARTS[2]}

case $VERSION_TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="v$MAJOR.$MINOR.$PATCH"

echo "Creating and tagging new version: $NEW_VERSION..."
# Create an empty commit if there are no other changes to ensure the tag points to a unique commit on main
# Or simply tag the current HEAD if updates were pulled.
# Using -a for annotated tag
git tag -a "$NEW_VERSION" -m "chore(release): release $NEW_VERSION"

echo "Pushing main branch and tag $NEW_VERSION to origin..."
git push origin main
git push origin "$NEW_VERSION"

echo "Creating GitHub release for tag $NEW_VERSION..."
gh release create "$NEW_VERSION" --generate-notes

echo "Release finished successfully! Tag $NEW_VERSION created and pushed." 