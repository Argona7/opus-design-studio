#!/usr/bin/env bash
# install.sh - put the design studio into a project.
#   bash install.sh [project-dir]          (default: the current folder)
#   bash install.sh [project-dir] --no-npm (skip the Playwright install, e.g. when it is already there)
set -euo pipefail
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "The screenshot scripts need Node.js 20 or newer: install it from https://nodejs.org, then run this again." >&2
  exit 1
fi
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$(pwd)"
NPM=1
for a in "$@"; do
  case "$a" in
    --no-npm) NPM=0 ;;
    *) DEST="$(cd "$a" && pwd)" ;;
  esac
done

mkdir -p "$DEST/.claude/skills"
rm -rf "$DEST/.claude/skills/design-studio"
cp -R "$KIT/skill/design-studio" "$DEST/.claude/skills/design-studio"
echo "skill    -> $DEST/.claude/skills/design-studio"

if ! grep -qs "Design rules (design studio)" "$DEST/CLAUDE.md"; then
  { [ -s "$DEST/CLAUDE.md" ] && printf '\n'; cat "$KIT/skill/design-studio/templates/CLAUDE.md"; } >> "$DEST/CLAUDE.md"
  echo "rules    -> $DEST/CLAUDE.md"
fi

if [ "$NPM" = 1 ]; then
  (cd "$DEST" && { [ -f package.json ] || npm init -y >/dev/null; } && npm i -D playwright --no-audit --no-fund && npx playwright install chromium)
fi
(cd "$DEST" && node .claude/skills/design-studio/scripts/shoot.mjs --check)
echo "done. In Claude Code: /design-studio setup"
