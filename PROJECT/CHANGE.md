# Change: Folder status hover shows last scan

Backlog: *In folders list: hovering over the status shall display the last scan date and time. Remove year from date. Place an appropriate symbol to the left of the text. Design shall be as in devices list.*

Branch: `feat/folder-last-scan`

## Plan

1. **Data (`lib/client.js`)**
   - Snapshot also fetches `/rest/stats/folder` (`{folderId: {lastScan, lastFile}}`); failure falls back to `{}`, like `/rest/stats/device`.
   - Store it in `data.lastScan[folderId]`.
   - On `StateChanged` with `from: 'scanning'` → set `lastScan[folder]` to now (no extra request, same as `lastSeen` on disconnect).
2. **State (`lib/state.js`)**
   - `emptySnapshot()` gets `lastScan: {}`.
   - `formatLastSeen` → generic `formatTime(iso, fallback)`, same format `DD.MM. HH:MM` (no year). Devices keep "Never seen", folders get "Never scanned".
   - `folderRow` returns `detail: {kind: 'last-scan', text}`.
3. **UI (`ui/infobox.js`)**
   - `deviceDetail()` generalised into one detail widget: icon + label for `last-seen` / `last-scan`, rates for `rates`.
   - Folder rows use it: hovering the status swaps it for icon + last scan on the 10 % darker background, flush right — identical to the device rows. The centred action ring stays as is.
   - Symbol: clock (`document-open-recent-symbolic`), same as device last-seen.
4. **Tests (`tests/test_state.js`)**: `formatTime` fallbacks, folder detail present with and without stats.
5. Version bump `minor`, HISTORY/BACKLOG update, commit, push, merge, tag.
