#!/usr/bin/env bash
# Build the zip for extensions.gnome.org into dist/.
# Packs a copy of the extension in which the .po files are converted to .json
# and metadata.json has no "version" (extensions.gnome.org sets its own), then
# checks the zip with ego-check.sh.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
uuid=syncbeacon@whoozy82.github.io
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

cp -r "$root/$uuid" "$stage/$uuid"
rm -f "$stage/$uuid/schemas/gschemas.compiled"
gjs -m "$root/scripts/po2json.js" "$stage/$uuid/locale"
sed -i -E '/^[[:space:]]*"version"[[:space:]]*:/d' "$stage/$uuid/metadata.json"

mkdir -p "$root/dist"
gnome-extensions pack "$stage/$uuid" --force --out-dir="$root/dist" \
  --extra-source=lib --extra-source=ui --extra-source=icons --extra-source=locale
zip="$root/dist/$uuid.shell-extension.zip"
"$root/scripts/ego-check.sh" "$zip"
echo "Wrote $zip"
