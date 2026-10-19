#!/usr/bin/env bash
# Bump the version. metadata.json holds it ("version-name", MAJOR.MINOR.PATCH).
#   bump-version.sh major|minor|patch|X.Y.Z
#     Writes the new version into metadata.json, the README badge and the
#     "Current version" line of PROJECT/HISTORY.md.
#     "version-name": the version as written, shown by GNOME tools.
#     "version": MAJOR*10000 + MINOR*100 + PATCH. Extension Manager only shows
#     the version row when this integer exists. extensions.gnome.org replaces
#     it with its own upload counter.
#   bump-version.sh --tag
#     Tags HEAD with vX.Y.Z from metadata.json and pushes the tag. Run on main
#     after the merge.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
metadata="$root/syncbeacon@whoozy82.github.io/metadata.json"
readme="$root/README.md"
history="$root/PROJECT/HISTORY.md"

usage() {
  echo "Usage: $0 major|minor|patch|X.Y.Z | --tag" >&2
  exit 1
}
[[ $# -eq 1 ]] || usage

current=$(sed -n -E 's/.*"version-name"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' "$metadata")
if [[ ! $current =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "Invalid version-name in $metadata: '$current' (expected MAJOR.MINOR.PATCH)" >&2
  exit 1
fi
major=$((10#${BASH_REMATCH[1]})) minor=$((10#${BASH_REMATCH[2]})) patch=$((10#${BASH_REMATCH[3]}))

if [[ $1 == --tag ]]; then
  tag="v$current"
  if git -C "$root" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    echo "Tag $tag already exists" >&2
    exit 1
  fi
  git -C "$root" tag -a "$tag" -m "$tag"
  git -C "$root" push origin "$tag"
  echo "Tagged and pushed $tag"
  exit 0
fi

case $1 in
  major) version="$((major + 1)).0.0" ;;
  minor) version="$major.$((minor + 1)).0" ;;
  patch) version="$major.$minor.$((patch + 1))" ;;
  *)
    [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage
    version=$1
    ;;
esac
[[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]
code=$((10#${BASH_REMATCH[1]} * 10000 + 10#${BASH_REMATCH[2]} * 100 + 10#${BASH_REMATCH[3]}))
if git -C "$root" rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  echo "Tag v$version already exists" >&2
  exit 1
fi
today=$(date +%d.%m.%Y)

sed -i -E \
  -e "s/(\"version-name\"[[:space:]]*:[[:space:]]*)\"[^\"]*\"/\1\"$version\"/" \
  -e "s/(\"version\"[[:space:]]*:[[:space:]]*)[0-9]+/\1$code/" \
  "$metadata"
sed -i -E "s#(badgen\.net/badge/version/)v[^/]*/#\1v$version/#" "$readme"
sed -i -E "/^## Current version/,/^## /s#^- \`v[^\`]*\` created at _[^_]*_#- \`v$version\` created at _${today}_#" "$history"

check() {
  grep -q -- "$1" "$2" || { echo "Could not set version in $2" >&2; exit 1; }
}
check "\"version-name\": *\"$version\"" "$metadata"
check "\"version\": *$code\b" "$metadata"
check "badge/version/v$version/" "$readme"
check "^- \`v$version\` created at _${today}_" "$history"
echo "Version $current -> $version (code $code)"
