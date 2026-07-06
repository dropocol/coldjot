#!/usr/bin/env bash
# Collect commits for release-note generation.
#
# Usage:
#   collect-commits.sh [since-ref]
#
# If no since-ref is given, the most recent v* tag is used. If no v* tag
# exists, all commits reachable from HEAD are emitted (first release).
#
# Output (line-oriented, stable for parsing):
#   LAST_TAG=<tag-or-empty>
#   RANGE=<git-range-or-HEAD>
#   COUNT=<n>
#   HEAD_BRANCH=<current-branch>
#   HEAD_SHA=<short-sha>
#   ----- COMMITS (sha<TAB>subject<TAB>breaking) -----
#   <sha>\t<subject>\t<breaking-description-or-empty>
#
# `breaking` is non-empty only when the commit declares a breaking change:
#   - Conventional header with `!:` (e.g. `feat(api)!: ...`)
#   - Footer line `BREAKING CHANGE:` or `BREAKING-CHANGE:` in the body
# For header `!:` without a body footer, the breaking column is `header`.
set -euo pipefail

since="${1:-}"
if [[ -z "$since" ]]; then
  # Most recent tag whose name starts with v, sorted by version refname.
  since="$(git tag --list 'v*' --sort=-v:refname 2>/dev/null | head -1 || true)"
fi

if [[ -n "$since" ]]; then
  range="${since}..HEAD"
else
  range="HEAD"
fi

count="$(git rev-list --count "$range" 2>/dev/null || echo 0)"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
head_sha="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "LAST_TAG=${since:-}"
echo "RANGE=${range}"
echo "COUNT=${count}"
echo "HEAD_BRANCH=${branch}"
echo "HEAD_SHA=${head_sha}"
echo "----- COMMITS (sha<TAB>subject<TAB>breaking) -----"

# -z: NUL-separated records. Within a record: %h \n %s \n %b
while IFS= read -r -d '' record; do
  sha="${record%%$'\n'*}"; rest="${record#*$'\n'}"
  subject="${rest%%$'\n'*}"; body="${rest#*$'\n'}"

  breaking=""
  # Conventional header with !: (any type, optional scope).
  if [[ "$subject" =~ ^[a-zA-Z]+(\([a-zA-Z0-9._/-]+\))?!: ]]; then
    breaking="header"
  fi
  # Body footer BREAKING CHANGE: / BREAKING-CHANGE:
  footer_line="$(printf '%s\n' "$body" | grep -iE '^BREAKING[ -]CHANGE:' | head -1 || true)"
  if [[ -n "$footer_line" ]]; then
    desc="${footer_line#*: }"
    desc="${desc#: }"
    breaking="${breaking:+$breaking; }${desc}"
  fi

  printf '%s\t%s\t%s\n' "$sha" "$subject" "$breaking"
done < <(git log "$range" -z --pretty=format:'%h%n%s%n%b')
