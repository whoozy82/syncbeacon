# Change: folder actions behind a centred circle

Requirement update to v0.3.0 (folder actions on status hover):
each folder line gets a circle, centred in the folders area, between folder name and status. Hovering the circle (not the status) shows the three buttons Open Folder, Rescan, Edit Ignore List.

Branch: `feat/folder-action-circle`

## UI (`ui/infobox.js`, `stylesheet.css`)
- Folder row = an overlay (`Clutter.BinLayout`) of two layers:
  1. the normal line: dot · name · spacer · status (status no longer swaps on hover)
  2. a hover cell, horizontally centred in the row, so every circle sits in the same column regardless of name and status width
- Hover cell (reactive, `track_hover`):
  - idle: a small hollow ring (10px, 1px grey #9a9996 border, readable on light and dark popups)
  - hovered: the ring is hidden and the three buttons appear in its place, centred on the same spot, on the 10 % darker pill. The cell then spans the buttons, so moving onto them keeps the hover.
  - The buttons are hidden (`visible = false`) when not hovered, so they cannot be clicked invisibly and the hover zone is only the circle.
- Button behaviour unchanged: Open Folder and Edit Ignore List close the box, Rescan keeps it open and is dimmed/inactive for paused folders.
- Device rows unchanged (rates / last seen on status hover). "No folders" placeholder gets no circle.
- Known limit: a very long folder name or status can run under the circle. Names are short in practice; truncation is not part of this change.

## Data / controller
- No change (`openFolder`, `rescanFolder`, `editIgnores` stay).

## Tests
- No state change, unit tests rerun. Manual check in the nested shell (`scripts/devkit.sh`): circles aligned in one column, hover shows the buttons, all three work.

## Version / docs
- `scripts/bump-version.sh patch` (refines v0.3.0), HISTORY entry, README sentence adjusted.
