# Change: Pause button in the folder hover actions

Backlog: "At the small hover menu over each folder: Add a button to pause the specific folder and reduce the spacing between the icons by 20%."

Branch: `feat/folder-pause-action`

## Plan

1. **Client** (`lib/client.js`): add `setFolderPaused(folderId, paused)` → `PATCH /rest/config/folders/{id}` with `{paused}` (same call `setFoldersPaused` already uses for all folders).
2. **Controller** (`extension.js`): add `setFolderPaused(folderId, paused)`; on success `refresh()`, on failure notify with `notify.pause-folder-failed` / `notify.resume-folder-failed` (same pattern as `setPaused`).
3. **Info box** (`ui/infobox.js`, `folderActions`): add a button as 2nd (after Open Folder, decided in user test) showing ⏸ (`media-playback-pause-symbolic`) while running and ▶ (`media-playback-start-symbolic`) while paused; accessible name "Pause folder" / "Resume folder"; the info box stays open so the new state shows in place. Icon and name update in `sync()` from `folder.paused`.
4. **Spacing** (`stylesheet.css`): `.syncbeacon-folder-actions` `spacing: 12px` → `10px` (−20 % = 9.6 px, rounded). The headline Pause box uses the same class but has only one button, so it is unaffected.
5. **Translations** (`locale/en.po`, `locale/de.po`): `infobox.folder.pause`, `infobox.folder.resume`, `notify.pause-folder-failed`, `notify.resume-folder-failed`; check with `scripts/i18n-check.js`.
6. **Test**: scripts under `scripts/`, then devkit for user test.
7. **Version**: `bump-version.sh minor`, HISTORY.md, BACKLOG.md.

## Extension (requested in user test)

8. **Device pause**: hovering a device's name shows the same framed box with one Pause/Resume button for that device (`POST /rest/system/pause|resume?device={id}`); `folderActions` and the new `deviceActions` share `rowActions`; keys `infobox.device.pause|resume`, `notify.pause|resume-device-failed`.
