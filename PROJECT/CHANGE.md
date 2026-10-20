# Change: Release v1.0

Backlog item: "Release v1.0 - what is to be done to have a solid version 1.0? e.g. create a release in GitHub"

Scope: GNOME Shell 50, installed via Nix flake or release zip. Publishing to extensions.gnome.org and other GNOME versions stay in the next backlog item.

## A. Quality gate (must pass before tagging 1.0.0)

1. `nix flake check` green (unit tests + i18n-check).
2. Acceptance checklist (IMPLEMENTATION.md §7) in the devkit session, then in the real session after a re-login (needs you at the screen). §7 is updated first to the current behaviour (headline hover Pause/Resume, wand, layouts, language).
3. Enable/disable leak test (§6): 10× enable/disable in the devkit, journal free of JS errors, no leftover `find` processes, keybinding gone after disable.
4. Release zip: `scripts/pack.sh`, check its contents (no `gschemas.compiled`, no dev files), install the zip into an isolated devkit session (keyfile GSettings backend) to prove the non-Nix install path works.

## B. Documentation

5. README: drop "Currently the implementation is in its infancy", fix typos ("extenion", "offical"), add "Install from release zip" (`gnome-extensions install …zip`), show pinning the flake to a tag (`github:whoozy82/syncbeacon/v1.0.0`), check the screenshot is current.
6. IMPLEMENTATION.md: status line, §4 layout and §5 progress brought up to date.
7. HISTORY.md: 1.0.0 entry.

## C. Release

8. `scripts/bump-version.sh major` → 1.0.0, merge, `--tag` → `v1.0.0`.
9. GitHub release `v1.0.0`: short release notes (feature summary, requirements: GNOME 50, Syncthing, GNOME Web recommended) with the zip attached. `gh` is not installed: `nix shell nixpkgs#gh` + `gh auth login` by you, or you create it in the web UI from prepared notes.

## Not in scope

- extensions.gnome.org submission (next backlog item)
- new features or refactors; bugs found in A are fixed in their own fix/ branches before 1.0.0
