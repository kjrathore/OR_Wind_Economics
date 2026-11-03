#!/usr/bin/env bash
# Publish the built static site (web/) to the gh-pages branch for GitHub Pages.
# Data is built locally (make fetch build) so deploys never depend on upstream servers.
set -euo pipefail
cd "$(dirname "$0")/.."

test -f web/data/hex.bin || { echo "web/data missing: run 'make fetch build' first" >&2; exit 1; }
git diff --quiet HEAD -- web pipeline || echo "warning: uncommitted changes in web/ or pipeline/ will be deployed" >&2

rev=$(git rev-parse --short HEAD)
tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp" 2>/dev/null || true; rm -rf "$tmp"' EXIT

if git fetch -q origin gh-pages 2>/dev/null; then
  git worktree add -q -B gh-pages "$tmp" origin/gh-pages
else
  git worktree add -q --orphan -b gh-pages "$tmp"
fi

rsync -a --delete --exclude .git --exclude bench --exclude package.json --exclude node_modules web/ "$tmp"/
touch "$tmp/.nojekyll"   # serve files as-is, no Jekyll processing

cd "$tmp"
git add -A
if git diff --cached --quiet; then
  echo "gh-pages already up to date"
  exit 0
fi
git commit -q -m "Deploy site from main@$rev"
git push -q origin gh-pages
echo "pushed gh-pages (main@$rev)"
