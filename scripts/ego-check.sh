#!/usr/bin/env bash
# Check a release zip against the extensions.gnome.org review rules that can
# be checked mechanically (gjs.guide/extensions/review-guidelines).
#   ego-check.sh [zip]   default: dist/syncbeacon@whoozy82.github.io.shell-extension.zip
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
zip=${1:-$root/dist/syncbeacon@whoozy82.github.io.shell-extension.zip}
failed=0
fail() {
  echo "FAIL: $*" >&2
  failed=1
}

files=$(unzip -Z1 "$zip" | grep -v '/$')
metadata=$(unzip -p "$zip" metadata.json)

# Only source, styles, schemas, icons and translations; no .po/.pot, no
# compiled schemas, no binaries or build scripts.
while read -r file; do
  case $file in
    *.js|*.css|*.json|*.svg|*.png|schemas/*.gschema.xml) ;;
    *) fail "unexpected file in zip: $file" ;;
  esac
done <<<"$files"
for required in extension.js metadata.json; do
  grep -qx "$required" <<<"$files" || fail "missing $required"
done

# metadata.json: "version" is set by extensions.gnome.org, "session-modes"
# only when other modes than "user" are used, shell-version only stable releases.
grep -q '"version"[[:space:]]*:' <<<"$metadata" && fail 'metadata.json has "version"'
grep -q '"session-modes"' <<<"$metadata" && fail 'metadata.json has "session-modes"'
shell=$(tr -d '\n' <<<"$metadata" | sed -n -E 's/.*"shell-version"[[:space:]]*:[[:space:]]*\[([^]]*)\].*/\1/p')
[[ -n $shell ]] || fail 'metadata.json has no shell-version'
for v in $(tr -d '" ' <<<"$shell" | tr ',' ' '); do
  [[ $v =~ ^[0-9]+$ ]] || fail "shell-version \"$v\" is not a stable release"
done
for key in uuid name description url; do
  grep -q "\"$key\"[[:space:]]*:" <<<"$metadata" || fail "metadata.json has no \"$key\""
done

if [[ $failed -eq 0 ]]; then
  echo "ego-check: $zip OK ($(wc -l <<<"$files") files)"
fi
exit $failed
