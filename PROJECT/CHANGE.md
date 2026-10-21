# Change: non-NixOS GNOME systems + extensions.gnome.org (EGO)

Branch: `feat/ego-release`

## Findings

The code is mostly distro-neutral already: programs are looked up in `PATH` (`find`, `epiphany`), the systemd unit is probed as system `syncthing.service`, `syncthing@<user>.service` and user `syncthing.service`, and the config is found in `$XDG_STATE_HOME/syncthing` or `~/.config/syncthing`. What blocks publishing are the EGO review rules (gjs.guide/extensions/review-guidelines):

| # | Rule | Current state | Severity |
|---|---|---|---|
| 1 | Licence MUST be compatible with GPL-2.0-or-later | `LICENSE` is Apache-2.0 (FSF: compatible with GPLv3 only, not GPLv2) | Blocker |
| 2 | Leave out `.po`/`.pot` files | The runtime loader reads `locale/*.po`, so they are shipped | Likely rejection |
| 3 | `version` in metadata.json is deprecated (EGO sets it) | `bump-version.sh` writes `version: 10100` | Minor |
| 4 | AI code: allowed as a tool, but the developer must be able to explain the code | README section "AI" says Claude Code wrote the implementation | Risk, no code change |
| 5 | No objects or signals at import time | Only `Gio._promisify` at module level (common, accepted) | OK |
| 6 | Logging, binaries, telemetry, compiled schemas | 6 `console.error` on errors only, no binaries, no telemetry, no `gschemas.compiled` in zip | OK |

Portability gaps for other distros:
- **Flatpak GNOME Web** (default on Fedora Silverblue and most Flatpak-based setups): existing web apps are found by their Exec URL, but creating one only works with a native `epiphany`. With Flatpak only, the extension falls back to the default browser. This stays as it is and gets documented.
- README: install, develop and journal commands are Nix-only (`/run/current-system/sw/bin/gnome-shell`).

## Plan

1. **Licence**: switch `LICENSE` to MIT (decided), and mention it in the README.
2. **Translations without .po in the zip**: `pack.sh` converts `locale/*.po` into `locale/<code>.json` (key → text, plural as an array) with a small gjs script, using the existing `.po` parser. `lib/locale.js` loads `<code>.json` and falls back to `.po` (devkit/symlink install keeps working without a build step). The zip then holds only the `.json` files. `.po` stays the source format, so `i18n-check.js` and the docs do not change.
3. **metadata.json**: drop `version`; `bump-version.sh` stops writing it.
4. **Zip check**: `scripts/ego-check.sh` unpacks the zip and fails on `.po`/`.pot`, `gschemas.compiled`, the `version` key, `session-modes`, non-stable `shell-version` entries and unexpected file types. `pack.sh` runs it.
5. ~~Non-NixOS smoke test in a container~~: skipped (decided).
6. **README**: section "Install" split into extensions.gnome.org (link once listed), release zip, Nix; generic journal command (`journalctl --user -f -o cat /usr/bin/gnome-shell`); note on Flatpak GNOME Web; the "Goal" text updated.
7. **Upload**: you upload `dist/*.zip` on extensions.gnome.org with your account (I do not do this). After approval: README link + the backlog note on Extension Manager's "Show details" is resolved.

## Out of scope
- GNOME Shell 51 support (separate backlog item if wanted)
- Creating web apps for Flatpak GNOME Web
- Nix package for nixpkgs (next backlog item)

## Tests
- Unit tests (`tests/test_*.js`), plus a test for the `.po` → `.json` conversion and the JSON loader
- `scripts/ego-check.sh` on the new zip
- Devkit run on this machine for user acceptance
