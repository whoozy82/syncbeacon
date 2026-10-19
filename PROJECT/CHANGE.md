# Change: Folders Action Buttons update

Branch: `fix/folder-actions-polish` · Version bump: patch (`v0.4.0` → `v0.4.1`)

## 1. Line height stays the same on hover
Cause: the action cell (`.syncbeacon-action-cell`) has `padding: 4px` on all sides.
The 10px ring fits inside the row line, but once the 18px action buttons show, the
cell is 26px tall and pushes the row up.
- Cell: `y_align: FILL` so it spans the full row height. The hover zone stays as
  tall as before, and the padding becomes horizontal only (`padding: 0 4px`)
- Action buttons: `padding: 0 4px` (the vertical padding is dropped) so the action box is
  never taller than the text line

## 2. "Actions" symbol instead of the ring
- Replace the ring widget with an `St.Icon` `view-more-horizontal-symbolic` (⋯, the
  GNOME standard for "more actions"), 12px, dimmed (`#9a9996`, same as the old ring)
- `.syncbeacon-action-ring` → `.syncbeacon-action-hint`

## 3. Ignore list icon: "document with blocked elements"
- New `icons/syncbeacon-ignore-symbolic.svg`: a page outline with a "no entry" badge
  (circle with a slash) in the bottom right, one filled path like the other icons
- Loaded via `Gio.FileIcon` (same helper as the Syncthing logo)

## 4. Slightly more space between the icons
- `.syncbeacon-folder-actions` `spacing: 2px` → `4px`

## Test
- `nix flake check` (unit tests), then a devkit session (`scripts/devkit.sh`) to
  confirm the extension loads with no JS errors
- Visual check (row height, icons) needs you at the screen
