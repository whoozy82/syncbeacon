# Change: Pause button on headline hover

Backlog: Hover text '[Click to Pause]' shall be replaced by a hover button, similar to the folder actions.

## Plan

1. `ui/infobox.js` – `headline()`:
   - Label goes back to plain text ("Folders (x)", "Devices (x/y online)", "…, Paused"); no `[Click to …]` hint, the label itself is no longer a button.
   - While hovered, the headline text is swapped for a round Pause/Resume button (both kept in a BinLayout cell, like `nameCell`, so nothing shifts); the button shows `media-playback-pause-symbolic` while running, `media-playback-start-symbolic` while paused.
   - Swap by opacity, exactly like the folder names.
   - Click → `onClick(!paused)`; disabled (not reactive, not shown) when Syncthing is unreachable or the area is empty; accessible name "Pause folders" / "Resume devices" etc.
2. `stylesheet.css`:
   - Reuse the folder action look: darker box framed in the accent colour, round button, accent circle on press (`syncbeacon-row-detail syncbeacon-folder-actions` + `syncbeacon-folder-action`).
   - Remove the `.syncbeacon-headline` underline rule.
3. Test via `scripts/`, then nested Mutter session for user test.
4. Version bump: minor; HISTORY + BACKLOG + README (if it mentions the hint).
