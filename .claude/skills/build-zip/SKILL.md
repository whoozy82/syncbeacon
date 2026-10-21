---
name: build-zip
description: Build the Syncbeacon release zip syncbeacon@whoozy82.github.io.shell-extension.zip into dist/ (for extensions.gnome.org or a GitHub release). Use when asked to build, pack or package the extension zip, or to refresh dist/.
---

# Build the extension zip

Builds `dist/syncbeacon@whoozy82.github.io.shell-extension.zip` with `scripts/pack.sh`. The script converts the `.po` files to `locale/<code>.json`, drops `"version"` from `metadata.json`, packs with `gnome-extensions pack` and checks the zip with `scripts/ego-check.sh`.

## Steps

1. From the repo root (the folder with `flake.nix`), run:
   ```bash
   nix develop -c scripts/pack.sh
   ```
   `nix develop` provides `gjs` (for `po2json.js`); `gnome-extensions` comes from the host's GNOME Shell. Ignore the `warning:` lines from Nix.
2. Success: the output ends with `ego-check: … OK (N files)` and `Wrote …/dist/syncbeacon@whoozy82.github.io.shell-extension.zip`.
3. On `FAIL:` lines from `ego-check.sh`, report them as they are and stop. Do not edit `ego-check.sh` to make the check pass.
4. Report the zip path, size (`ls -l dist/`), file count and the version from `syncbeacon@whoozy82.github.io/metadata.json` (`version-name`).

## Notes

- `dist/` is gitignored; the zip is not committed.
- The zip is not uploaded anywhere: uploading to extensions.gnome.org is done by hand, and a GitHub release only when the user asks.
- Do not bump the version here; that is `scripts/bump-version.sh` in the normal workflow (AGENT.md).
