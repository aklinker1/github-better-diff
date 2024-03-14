#!/bin/bash
set -e

# Setup and Requirements

function heading() {
    echo -e "\n\x1b[36m\x1b[1m$1\x1b[0m\n"
}

function require_tool() {
    echo "Ensuring $1 is installed..."
    if ! command -v "$1" &> /dev/null ; then
        echo "$1 could not be found"
        exit 1
    fi
}
require_tool "pnpm"
require_tool "gh"
require_tool "jq"

# Generate Changlog

heading "Generate Changelog"
CHANGES=$(pnpm generate-changelog)
SKIPPED=$(echo "$CHANGES" | jq -r '.skipped')
echo "Next version: $NEXT_VERSION"
if [[ "$SKIPPED" == "true" ]]; then
    echo "No changes"
    exit
fi

CHANGELOG=$(echo "$CHANGES" | jq -r '.changelog')
NEXT_TAG=$(echo "$CHANGES" | jq -r '.nextTag')         # Includes v (ex: v1.2.1)
NEXT_VERSION=$(echo "$CHANGES" | jq -r '.nextVersion') # Excludes v (ex: 1.2.1)
echo "---"
echo -e "Changelog: \n---\n$CHANGELOG\n---"
echo "Next tag: $NEXT_TAG"
echo "Next version: $NEXT_VERSION"

# Bump Version

heading "Bump version"
cat <<< $(jq ".version=\"$NEXT_VERSION\"" package.json) > package.json
pnpm prettier -w package.json

# Checks

heading "Run Checks"
pnpm test run
pnpm check

# Commit Changes

heading "Commit Changes"
if [[ "$1" == "--dry-run" ]]; then
    echo "Skipping commit for dry run"
    git checkout -- package.json
    NEXT_VERSION="$(node -pe 'require("./package.json").version')"
    NEXT_TAG="v$NEXT_VERSION"
    echo "Reset tag: $NEXT_TAG"
    echo "Reset version: $NEXT_VERSION"
else
    git add package.json
    git commit -m "chore(release): $NEXT_TAG"
    git tag "$NEXT_TAG"
fi

# Zip everything up

heading "Zip"
pnpm zip
pnpm zip:firefox

CHROME_ZIP=".output/github-better-line-counts-$NEXT_VERSION-chrome.zip"
FIREFOX_ZIP=".output/github-better-line-counts-$NEXT_VERSION-firefox.zip"
SOURCES_ZIP=".output/github-better-line-counts-$NEXT_VERSION-sources.zip"

# Publish

heading "Publishing to Stores"
pnpm publish-extension $1 \
    --chrome-zip "$CHROME_ZIP" \
    --firefox-zip "$FIREFOX_ZIP" \
    --firefox-sources-zip "$SOURCES_ZIP" \
    --edge-zip "$CHROME_ZIP"

# Create Release

heading "Create GitHub Release"
if [[ "$1" == "--dry-run" ]]; then
    echo "gh release create '$NEXT_TAG' '$CHROME_ZIP' '$FIREFOX_ZIP' '$SOURCES_ZIP' --notes '$CHANGELOG'"
else
    git push
    git push --tags
    gh release create "$NEXT_TAG" "$CHROME_ZIP" "$FIREFOX_ZIP" "$SOURCES_ZIP" --notes "$CHANGELOG"
fi
