# Change: async file writes when creating the web app

Branch: `fix/async-webapp`

## Problem

`createWebApp()` in `lib/webapp.js` writes the `.app` marker and the desktop
file with the synchronous `GLib.file_set_contents` (lines 150, 178). It also
copies the icon and creates the symlink synchronously. It runs inside
gnome-shell (`extension.js` `_ensureWebApp()`), and Shexli may flag it like
EGO-X-004.

## Plan

1. `lib/webapp.js` `createWebApp()` becomes `async`:
   - `.app` marker and desktop file: `Gio.File.replace_contents_bytes_async` (promisified with `replace_contents_finish`).
   - Icon: `copy_async` instead of `copy`.
   - Symlink: `make_symbolic_link_async` instead of `make_symbolic_link`.
   - Unchanged: the directories (`GLib.mkdir_with_parents`, keeps the 0700/0750 modes) and the `GLib.file_test` existence checks. These are metadata calls, not file reads or writes, and are not in Shexli's list.
2. `extension.js` `_ensureWebApp()`: calls `createWebApp(…)` without awaiting it and logs a failure via `.catch()`. The once-per-URI guard (`_webAppCreatedFor`) is set before the call, as now.
3. Backlog: the item is removed. The earlier "Source ID" item (traced to the Freon extension) is already removed.

## Test

- Unit tests, `pack.sh` + `ego-check.sh`.
- Script in the scratchpad: `createWebApp()` with a temporary `XDG_DATA_HOME`; check the profile `.app`, desktop file, icon and symlink.
- User test in the devkit: delete or rename the Syncthing web app (or change the GUI URI), and check that it is created again and opens.
