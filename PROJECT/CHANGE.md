# Change: device status hover (rates / last seen)

Backlog item: In infobox > device list > hovering a device's status shows
- connected: download and upload rate
- disconnected (incl. paused): last online date and time
- right-aligned, on a background 10 % darker than the info box; the normal status text is hidden while hovering

Branch: `feat/device-status-hover`

## Data (`lib/client.js`)
- **Last seen:** `_snapshot()` also fetches `/rest/stats/device` → `data.lastSeen[id]` (ISO string). On `DeviceDisconnected`, set `lastSeen[id]` to now so it stays current without a refetch.
- **Rates:** Syncthing only reports byte totals (`inBytesTotal` / `outBytesTotal` per device in `/rest/system/connections`), so a rate needs two samples.
  - New `client.sampleRates()`: fetches `/rest/system/connections`, computes bytes/s from the previous sample's totals and time, and stores the result in `data.rates[id] = {down, up}`.
  - The snapshot's connections response is the first sample.
  - Polling runs only **while the info box is open**, every 2 s (one small request), so there is no extra load when the box is closed.

## State (`lib/state.js`, pure)
- `emptySnapshot()` gets `lastSeen: {}` and `rates: {}`.
- `deviceRow()` adds `detail`:
  - online → `↓ 1.2 MB/s  ↑ 34 kB/s`, or `↓ –  ↑ –` until the first rate sample arrives
  - offline/paused → `Last seen 18.10.2026 14:32`, or `Never seen` (Syncthing reports 1970 for devices it has never seen)
- New helpers `formatRate(bytesPerSec)` and `formatLastSeen(iso)`. Formatting is pure JS and fixed to `DD.MM.YYYY HH:MM` for now; i18n is a separate backlog item.

## UI (`ui/infobox.js`, `stylesheet.css`)
- Device rows: the status cell becomes a reactive `St.Bin` with `track_hover`, holding the status label and the detail label. On `notify::hover`, the cell swaps which label is visible.
- `.syncbeacon-row-detail`: right-aligned, `background-color: rgba(0, 0, 0, 0.1)` (same 10 % as the action band), rounded corners, small padding.
- To avoid a stuck hover, rows are not rebuilt while a cell is hovered. On updates, the existing labels' text is changed in place.
- Open/close of the info box starts/stops the 2 s rate timer through the controller (`extension.js`: `startRateSampling()` / `stopRateSampling()`).

## Tests
- `tests/test_state.js`: `formatRate` units (B/s, kB/s, MB/s), `formatLastSeen` including "never", and `detail` for an online, offline and paused device.
- Run the test scripts. Manual check in the nested shell (`scripts/devkit.sh`): hover a connected and a disconnected device.

## Version / docs
- `scripts/bump-version.sh minor`, then add a HISTORY entry and remove the item from BACKLOG.
