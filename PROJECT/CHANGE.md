# Change: New shared folder request

Backlog item: when another device offers a folder, the panel icon turns violet and the info box shows a
block "New folder <name> / from <device>" with a [Check] button that opens the Syncthing window.

## Plan

1. **Data (lib/client.js)**
   - Snapshot also fetches `GET /rest/cluster/pending/folders` (optional; `{}` on failure, like the stats).
   - Subscribe to the `PendingFoldersChanged` event and refetch the pending list through `_queue`
     (key `pending`). Accepting or ignoring in the web UI also emits `ConfigSaved`, which already resets.
   - The regular status poll (10 s closed / 1 s open) also fetches the list, as a fallback: the event
     was missed in the first user test.
   - Stored raw in the snapshot as `pendingFolders` (new field in `emptySnapshot()`).

2. **State (lib/state.js, pure, testable)**
   - `deriveStatus()` adds `status.pendingFolders`: one entry per offered folder and offering device,
     `{folderId, label, deviceId, deviceName, time}`, sorted by time (newest first).
     Label falls back to the folder ID; device name comes from the configured devices, else short ID.
   - The `State` stays as it is (a request is not a sync problem).

3. **Panel icon (ui/indicator.js, stylesheet.css)**
   - While a request is pending, the icon gets the class `syncbeacon-pending`: violet `#9141ac`
     (GNOME purple, same as the offline dot).
   - Error (red) and folder issue (amber) keep their colour; violet replaces only the uncoloured
     states (in sync, syncing, paused). Icon glyph unchanged.

4. **Info box (ui/infobox.js, stylesheet.css)**
   - Below the top bar, one block per request on a single line: folder icon, "New folder [name] from
     [device]" with the names on a 10 % darker background, and a [Check] button on the right;
     violet border, standard background.
   - [Check] closes the info box and calls `controller.openWindow()` (the configured Syncthing window).
   - Blocks are hidden when nothing is pending.

5. **Translations (locale/en.po, de.po)**
   - `infobox.pending-request` "New folder {folder} from {device}" / "Neuer Ordner {folder} von {device}"
     (split at the placeholders, so the names can be styled)
   - `infobox.pending-check` "Check" / "Prüfen"
   - `scripts/i18n-check.js` must report nothing missing.

6. **Tests**
   - `scripts/status.js` also prints the pending requests.
   - `tests/test_state.js`: pending list derivation (several devices offering one folder, unknown
     device, missing label, empty / missing data).
   - Run all `tests/` scripts and `scripts/i18n-check.js`.

7. **User test** in the Mutter devkit (`scripts/devkit.sh`). A real request can be produced by sharing
   a new folder from another device; or simulated by temporarily faking the pending data.

8. **Release**: minor version bump, HISTORY.md, remove the item from BACKLOG.md, README feature list if
   it lists such features.
