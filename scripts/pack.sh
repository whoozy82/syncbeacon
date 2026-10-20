#!/usr/bin/env bash
# Build the zip for extensions.gnome.org into dist/.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
uuid=syncbeacon@whoozy82.github.io
mkdir -p "$root/dist"
gnome-extensions pack "$root/$uuid" --force --out-dir="$root/dist" \
  --extra-source=lib --extra-source=ui --extra-source=icons --extra-source=locale
echo "Wrote $root/dist/$uuid.shell-extension.zip"
