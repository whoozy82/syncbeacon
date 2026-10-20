# Change: Pause via the list headlines

Branch: `feat/headline-pause`

## Goal

Replace the Run/Pause button in the info box's top bar with two clickable headlines, one for the folders and one for the devices, so each area can be paused and resumed on its own. The panel element shows which area is paused.

## Behaviour

| Headline | Normal | Hover | Click |
|---|---|---|---|
| Folders | `Folders (5)` | underlined, `Folders (5) [Click to pause]` | pauses every folder → `Folders (5, Paused)` |
| Folders, paused | `Folders (5, Paused)` | underlined, `… [Click to resume]` | resumes every folder |
| Devices | `Devices (2/5 online)` | underlined, `Devices (2/5 online) [Click to pause]` | pauses every device → `Devices (5, Paused)` |
| Devices, paused | `Devices (5, Paused)` | underlined, `… [Click to resume]` | resumes every device |

- "Paused" means *every* folder (or device) is paused; a partly paused area shows the normal text, and a click pauses the rest.
- Not clickable (no hover effect) while Syncthing is unreachable or the area is empty.
- The box stays open after the click and refreshes once the request succeeds, as Run/Pause did.

## Implementation

1. `lib/client.js`: split `pauseAll()` / `resumeAll()` into `setDevicesPaused(bool)` (`POST /rest/system/pause|resume`) and `setFoldersPaused(bool)` (`PATCH /rest/config/folders/{id}`).
2. `extension.js`: replace `setRunning(running)` with `setPaused(area, paused)` (`area` = `'devices'` | `'folders'`), same refresh / error notification.
3. `lib/state.js`: add `devicesPaused` and `foldersPaused` to the status (all paused, at least one present). `countsText()` appends ⏸ to the count of a paused area, e.g. `0/5⏸ · 5⏸`. The panel icon's Paused state keeps following the devices (§3.3), unchanged.
4. `ui/infobox.js`: remove the Run/Pause button; the two `PopupSeparatorMenuItem` headings become reactive with `track_hover`; hover adds the underline style and the `[Click to …]` suffix; click calls `setPaused()`.
5. `stylesheet.css`: hover style for the headline (`text-decoration: underline`, pointer-like highlight not available in St).
6. `tests/test_state.js`: tests for `devicesPaused`, `foldersPaused` and the new `countsText()` output.
7. Docs: IMPLEMENTATION.md §3.2, §3.5, §7; HISTORY.md; BACKLOG.md. Version bump: minor (0.10.0).

## Test

- `nix flake check` (unit tests)
- devkit session: hover/click both headlines, check the web UI, the panel text and the icon
