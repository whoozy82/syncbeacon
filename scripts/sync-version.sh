#!/usr/bin/env bash
# Copy the version from VERSION.md into metadata.json.
# Its first non-empty line is the version, MAJOR.MINOR.PATCH, e.g. "0.1.1".
#   "version-name": the version as written, shown by GNOME tools.
#   "version": MAJOR*10000 + MINOR*100 + PATCH. Extension Manager only shows
#   the version row when this integer exists. extensions.gnome.org replaces it
#   with its own upload counter.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
metadata="$root/syncbeacon@whoozy82.github.io/metadata.json"
file="$root/VERSION.md"

version=$(grep -m1 -v '^[[:space:]]*$' "$file" | tr -d '[:space:]')
if [[ ! $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "Invalid version in $file: '$version' (expected MAJOR.MINOR.PATCH)" >&2
  exit 1
fi
code=$((10#${BASH_REMATCH[1]} * 10000 + 10#${BASH_REMATCH[2]} * 100 + 10#${BASH_REMATCH[3]}))

sed -i -E \
  -e "s/(\"version-name\"[[:space:]]*:[[:space:]]*)\"[^\"]*\"/\1\"$version\"/" \
  -e "s/(\"version\"[[:space:]]*:[[:space:]]*)[0-9]+/\1$code/" \
  "$metadata"
grep -q "\"version-name\": *\"$version\"" "$metadata" && grep -q "\"version\": *$code\b" "$metadata" || {
  echo "Could not set version fields in $metadata" >&2
  exit 1
}
echo "Version $version (code $code)"
