#!/usr/bin/env bash
# Publish what's on main to the release site (Render: ltc-release, branch "release").
set -euo pipefail
cd "$(dirname "$0")/.."
git checkout -q main
git checkout -q -B release-build
python3 tools/make_release.py
git add -A public
git -c user.name="${GIT_NAME:-Nicholas}" -c user.email="${GIT_EMAIL:-nicholas@aetheradigital.com}" commit -q -m "Release build from $(git rev-parse --short main)"
git push -q -f origin release-build:release
git checkout -q main
git branch -q -D release-build
echo "Published $(git rev-parse --short main) to release"
