# Change: switch for all hover functions in the info box

Backlog entry: a small "magic" icon in the bottom right corner of the info box toggles all hover functions on or off. Accent colour while enabled, dim grey while disabled.

## Hover functions covered

1. Status detail on hover: device ↓/↑ rates or last seen, folder last scan (`statusRow` detail cell)
2. Folder actions on the folder name: Open Folder, Rescan, Edit Ignore List (`nameCell`)
3. Pause/Resume button on the list headlines (`headline`), included (decided)

## Plan

1. **Setting**: new gsettings key `hover-functions` (boolean, default `false`, so a fresh install starts with the hover functions off), so the choice survives closing the box and restarts. No entry in the settings window; the icon is the only control.
2. **Icon**: own symbolic icon `icons/syncbeacon-magic-symbolic.svg` (magic wand with sparkles). The system's `magic-wand-symbolic` comes from a third-party app and is not on every system.
3. **Footer row** (`ui/infobox.js`): a new non-reactive `PopupBaseMenuItem` below the lists with a small round button at the right edge, styled like the folder action buttons (`syncbeacon-folder-action`, 14 px icon). Clicking toggles the setting; the box stays open. Accessible name: "Disable hover functions" / "Enable hover functions".
4. **Colour** (`stylesheet.css`): `.syncbeacon-hover-toggle` gets `color: -st-accent-color` when enabled and dim grey (`#9a9996`, same as the paused dot) when disabled (`.syncbeacon-hover-toggle-off`).
5. **Gating**: one flag `infoBox._hoverEnabled`, read in the three `notify::hover` handlers. When it is off, the hovered cell keeps showing the name/status/headline text (no swap, buttons not reactive). Toggling re-syncs all cells immediately, so a currently hovered cell switches back at once.
6. **i18n**: new texts go into `locale/de.po` (`scripts/i18n-check.js --update`, then translate).
7. **Tests**: `scripts/i18n-check.js`; existing unit tests; manual check in the Mutter devkit.
8. **Docs**: IMPLEMENTATION.md §3.5 (info box contents), HISTORY.md, BACKLOG.md; version bump `minor`.

