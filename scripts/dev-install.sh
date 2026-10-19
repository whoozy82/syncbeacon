#!/usr/bin/env bash
# Compile the schema and link the extension into the user's extension folder.
# Run inside `nix develop` (needs glib-compile-schemas).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
uuid=syncbeacon@whoozy82.github.io
dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"

"$root/scripts/bump-version.sh"
glib-compile-schemas "$root/$uuid/schemas"
mkdir -p "$(dirname "$dest")"
ln -sfn "$root/$uuid" "$dest"
echo "Linked $dest -> $root/$uuid"
echo "Enable with: gnome-extensions enable $uuid  (GNOME picks up new extensions after a re-login)"
