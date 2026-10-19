#!/usr/bin/env bash
# Copy the version from VERSION.md into metadata.json ("version-name").
# Its first non-empty line is the version, e.g. "0.1.1".
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
metadata="$root/syncbeacon@whoozy82.github.io/metadata.json"
file="$root/VERSION.md"

version=$(grep -m1 -v '^[[:space:]]*$' "$file" | tr -d '[:space:]')
if [[ ! $version =~ ^[0-9]+(\.[0-9]+)*([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid version in $file: '$version'" >&2
  exit 1
fi

sed -i -E "s/(\"version-name\"[[:space:]]*:[[:space:]]*)\"[^\"]*\"/\1\"$version\"/" "$metadata"
grep -q "\"version-name\": *\"$version\"" "$metadata" || {
  echo "Could not set version-name in $metadata" >&2
  exit 1
}
echo "Version $version"
