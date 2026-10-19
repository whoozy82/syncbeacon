# Change: folder actions on status hover

Backlog item: In infobox > folders list > hovering a folder's status reveals 3 buttons with appropriate icons:
- Open Folder
- Rescan
- Edit Ignore List

Branch: `feat/folder-hover-actions`

## Data (`lib/client.js`, `lib/state.js`)
- `folderRow()` also returns `path` and `paused` (the snapshot already has both).
- New `client.rescan(folderId)`: `POST /rest/db/scan?folder=<id>` via `_requireApi()`.

## Controller (`extension.js`)
- `openFolder(path)`: `Gio.AppInfo.launch_default_for_uri('file://…')` → file manager. Error → `Main.notifyError`.
- `rescanFolder(id)`: calls `client.rescan()`; error → notify. The state change arrives through the events.
- `editIgnores(path)`: opens `<path>/.stignore` in the default **text/plain** app (`Gio.AppInfo.get_default_for_type('text/plain')`), creating an empty file if it does not exist. The content type is fixed because an empty or extension-less file would otherwise not resolve to an editor. Syncthing re-reads `.stignore` on the next scan, so Rescan applies the changes.

## UI (`ui/infobox.js`, `stylesheet.css`)
- Same hover mechanism as the device detail: the status cell swaps (by opacity) to a right-aligned box of three small icon buttons on the 10 % darker background.
  - Open Folder: `folder-open-symbolic`
  - Rescan: `view-refresh-symbolic`
  - Edit Ignore List: `document-edit-symbolic`
- Open Folder and Edit Ignore List close the info box; Rescan keeps it open so the new state shows up.
- Rescan is dimmed and inactive for a paused folder.
- The buttons are only reactive while visible (hover), so they cannot be clicked invisibly.
- Placeholder row ("No folders") gets no buttons.
- `statusRow()` takes the detail factory as a parameter instead of a boolean, so device and folder rows share the hover cell.

## Tests
- `tests/test_state.js`: `folderRow` carries `path` and `paused`.
- Run the test scripts. Manual check in the nested shell (`scripts/devkit.sh`): hover a folder, use all three buttons, also on a paused folder and a folder without `.stignore`.

## Version / docs
- `scripts/bump-version.sh minor`, then add a HISTORY entry and remove the item from BACKLOG.
