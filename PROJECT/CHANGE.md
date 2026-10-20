# Change: Timed status refresh

Branch: `feat/status-polling`

## Goal

Refresh the folder and device statuses on a timer, on top of the live event stream:

| Info box | Refresh |
|---|---|
| closed | every 10 s |
| opening | full refresh (already the case: new snapshot + conflict scan) |
| open | every 1 s |

## Today

- Live updates come from the `/rest/events` long-poll. A full snapshot is taken on start, when the box opens, on `ConfigSaved` and every 5 min.
- The transfer rates are sampled every 2 s while the box is open (`setRateSampling`).

## Implementation

1. `lib/client.js`: new `poll()`. It re-fetches the changing data and merges it into the current snapshot without restarting the event loop:
   - `/rest/system/connections`: connected / paused flags and transfer rates
   - `/rest/stats/device`, `/rest/stats/folder`: last seen, last scan
   - `/rest/db/completion?device=…` for each online device
   - `/rest/db/status?folder=…` for each folder, at most every 15 s (open or closed), because Syncthing calls it expensive; folder changes still arrive live through the events
   It skips when Syncthing is unreachable or a poll is still running, and it emits one update per poll. The config (device and folder list, names) still comes from the snapshot and `ConfigSaved`.
2. `extension.js`: one poll timer. Its interval is 10 s while the box is closed and 1 s while it is open. `setRateSampling(open)` becomes `setInfoBoxOpen(open)`, which restarts the timer with the new interval. The rates come from the poll (1 s window while open), so the separate 2 s rate timer is removed.
3. `ui/infobox.js`, `ui/indicator.js`: call `setInfoBoxOpen()`; update the doc comments.
4. The conflict scan stays as it is (on open, every 10 min, `ItemFinished` events), because `find` is too expensive for a 1 s interval.
5. Docs: IMPLEMENTATION.md §3.2 and §3.5; HISTORY.md; BACKLOG.md. Version bump: minor (0.11.0).

## Test

- `nix flake check`
- devkit session: the rates and Syncing % count up every second while the box is open; with the box closed, a pause made in the web UI shows up within 10 s, even without events
