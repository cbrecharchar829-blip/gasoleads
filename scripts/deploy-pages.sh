#!/usr/bin/env bash
# Build the app and publish it to the gh-pages branch (GitHub Pages).
# Usage: npm run deploy:pages   (from the project root)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building for GitHub Pages…"
BASE_PATH=/gasoleads/ npx vite build
touch dist/.nojekyll

echo "Publishing dist/ to the gh-pages branch…"
work="$(mktemp -d)"
cp -R dist/. "$work/"
cd "$work"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="charchar" -c user.email="cbrecharchar829@gmail.com" commit -q -m "Deploy GASOLEADS to GitHub Pages"
git remote add origin https://github.com/cbrecharchar829-blip/gasoleads.git
git push -q -f origin gh-pages
cd - >/dev/null
rm -rf "$work"
echo "Done. Live at https://cbrecharchar829-blip.github.io/gasoleads/ (build takes ~1 min)."
