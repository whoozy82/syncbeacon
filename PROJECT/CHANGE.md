# Change: Icon update (info box top bar)

Backlog item: remove the Refresh button; replace the Run/Pause switch with a round icon button like the others.

## Plan

1. Branch `feat/run-pause-button`.
2. `ui/infobox.js`
   - Remove the Refresh button (the box still refreshes whenever it opens; `controller.refresh()` stays).
   - Replace `PopupMenu.Switch` + `syncbeacon-run-button` with `iconButton(...)`, same `syncbeacon-action` style as Open UI / Settings.
   - Icon shows the current state: running → `media-playback-start-symbolic`, paused → `media-playback-pause-symbolic`; a click toggles. Accessible name "Pause all devices" / "Resume all devices".
   - Click calls `controller.setRunning(!running)`; drop `_updatingSwitch`. Greyed out under the same conditions as now.
   - Update header comments.
3. `stylesheet.css`: remove the now unused `.syncbeacon-run-button`.
4. Docs: README (left click description), IMPLEMENTATION.md §3.x top bar + test table row, HISTORY, BACKLOG.
5. Tests via `scripts/`, then devkit for user test, version bump **minor** (0.6.0), commit, push, merge, tag.
