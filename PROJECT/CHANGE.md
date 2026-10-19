# Change 1: Pause folders and devices together

Backlog item: the "pause" function shall pause folders and devices altogether.

## Plan

1. Branch `feat/pause-folders`.
2. `lib/client.js`
   - `Api.request()` takes an optional JSON body; add `patch(path, body)`.
   - `pauseAll()`: `POST /rest/system/pause` (devices, as now), then `PATCH /rest/config/folders/{id}` with `{"paused": true}` for every folder that is not paused yet.
   - `resumeAll()`: `POST /rest/system/resume`, then `{"paused": false}` for every paused folder. Like the devices, this also resumes folders that were paused individually in the web UI.
   - Requests run in parallel; if one fails, the error notification shows it (as now).
3. `ui/infobox.js`: Run/Pause is also usable when there are folders but no remote devices (now: greyed out without devices).
4. State rule unchanged: Paused still means "all devices paused" (paused folders alone do not count), so the button and icon behave as before.
5. Docs: README, IMPLEMENTATION.md §3.2 actions, HISTORY, BACKLOG.
6. Tests, devkit user test, version bump **minor** (0.8.0), commit, push, merge, tag.

# Change 2: Folders above devices

Backlog item: folders list on top, devices list below it.

## Plan

1. Branch `feat/folders-first` (after change 1 is merged).
2. `ui/infobox.js` `_buildLists()`: build the folders heading and rows first, then the devices.
3. Docs: README ("every folder and peer"), IMPLEMENTATION.md info box contents, HISTORY, BACKLOG.
4. Tests, devkit user test, version bump **patch** (0.8.1), commit, push, merge, tag.
