# History

## Current version

<!-- Current version + date, gets bumped with new updates -->
- `v0.14.0` created at _20.10.2026_

## Changelog

<!-- Each change adds an entry as bullet point with date and short headline, newest first -->
- [2026-10-20] Info box layouts — new setting Layout › Orientation: Vertical (folders above devices, as before), Horizontal (folders left, devices right, equally wide, a dim line between them) or Auto (default; side by side with 10 or more folders and devices together)
- [2026-10-20] GUI URI from config.xml — the GUI URI setting is empty by default again, so the settings window and the extension use the address from Syncthing's `config.xml`; `http://localhost:8384` is only the fallback when `config.xml` cannot be read; applying the shown address unchanged does not pin it; the "GUI URI and port" mode and field are renamed "URL+Port", and the settings texts say "URL" instead of "GUI URI"
- [2026-10-20] Epiphany Web App window mode — new default "Syncthing window" mode that opens or raises the GNOME Web app matching the GUI URI (looked up each time, created if GNOME Web is installed and it is missing); the settings show its identifier read-only; Command mode is no longer pre-filled, and a stored web app command from earlier versions is cleared once; the GUI URI defaults to `http://localhost:8384`
- [2026-10-20] Folder actions on the name — hovering a folder's name swaps it for the Open Folder, Rescan and Edit Ignore List buttons (the ⋯ hint is gone); the box is framed in the GNOME accent colour and the buttons are 50 % further apart
- [2026-10-20] Centred header — the device name and the short state sit centred in the info box's top bar, between Open UI and Settings
- [2026-10-20] Timed status refresh — besides the live events, the statuses are polled every 10 s while the info box is closed and every 1 s while it is open (rates included, replacing the 2 s rate sampling); the expensive folder status (`/rest/db/status`) at most every 15 s
- [2026-10-20] Pause from the list headlines — the Run/Pause button is gone; clicking "Folders (x)" or "Devices (x/y online)" pauses or resumes that area on its own (hover underlines it and adds "[Click to pause]"), a paused area reads "Folders (x, Paused)" / "Devices (y, Paused)" and the panel counts show ⏸ after its count
- [2026-10-20] Coloured Syncthing logo in the info box — the Open UI button shows the logo in Syncthing's colours (blue gradient disc, white mark, `syncbeacon-syncthing.svg` from `make-icons.py`); the panel icon stays symbolic
- [2026-10-20] Folders first — the info box lists the folders above the devices
- [2026-10-20] Pause folders too — Pause in the info box pauses every folder as well as every device (`PATCH /rest/config/folders/{id}`); Run resumes all of them, including folders paused one by one in the web UI
- [2026-10-20] Header in the top bar — the device name and the short state ("In Sync", "Paused", …) sit in the info box's top bar, left-aligned after Open UI; the long state message is no longer shown and the separate header row is gone
- [2026-10-20] Run/Pause button — the Run/Pause switch in the info box is now a round icon button like Open UI and Settings, showing ▶ while running and ⏸ while paused; the Refresh button is removed (the box still refreshes when it opens)
- [2026-10-20] Local device name in the header — the info box header shows the name of Syncthing's "This device" instead of the state label ("In Sync", …); the colour and the message line still show the state, the state label is the fallback while the name is unknown
- [2026-10-20] Overlay right alignment — the hover detail text (device rates / last seen, folder last scan) now ends where the status text ends; the box is drawn shifted by its padding (`translation_x`, layout unchanged)
- [2026-10-20] Folder action press feedback — the action buttons are round; while one is pressed it shows a circle in the GNOME accent colour (`-st-accent-color`)
- [2026-10-20] Folder actions polish — the row no longer grows when the actions show (the cell fills the row, no vertical padding); a dimmed ⋯ replaces the ring; Edit Ignore List gets its own icon (page with a no-entry badge, `syncbeacon-ignore-symbolic.svg`); a little more space between the buttons
- [2026-10-19] Folder last scan on hover — hovering a folder's status shows a clock icon and the last scan time (`DD.MM. HH:MM`, "Never scanned" otherwise), styled like the device last-seen detail; taken from `/rest/stats/folder` and updated when a scan finishes
- [2026-10-19] Folder action circle — each folder line has a small ring centred in the row; hovering the ring (instead of the status) reveals Open Folder, Rescan and Edit Ignore List in its place
- [2026-10-19] Folder actions on hover — hovering a folder's status shows Open Folder, Rescan (inactive while paused) and Edit Ignore List (opens `.stignore` in the default text editor, created if missing) on the 10 % darker background
- [2026-10-19] Device detail layout — hover detail sized to its text and flush with the status text on the right (status was centred in its cell); rates read `↓0 B/s  ↑0 B/s` (0 before the first sample); clock icon before the last-seen date
- [2026-10-19] Device status hover — hovering a device's status shows ↓/↑ rates (connected, sampled every 2 s while the info box is open) or the last-seen time (disconnected), on a 10 % darker background; list rows now update in place
- [2026-10-19] Version bump script — `VERSION.md` dropped, `metadata.json` holds the version; `bump-version.sh major|minor|patch|X.Y.Z` updates metadata.json, README badge and HISTORY.md, `--tag` sets and pushes the git tag
- [2026-10-19] Dev tooling fixes — devShell sets its own `GI_TYPELIB_PATH` (gjs crashed on `import Gio`); `dev-install.sh` / `pack.sh` call `bump-version.sh`; README links fixed
- [2026-10-18] Icons from Syncthing's tray icons — symbolic logo with state badge (✓ / arrows / ! / ‖ / ✕), generated by `scripts/make-icons.py`
- [2026-10-18] First-run setup of the Syncthing window — creates a GNOME Web app for the GUI URI (or falls back to the default browser); existing settings are kept
- [2026-10-18] Lighter button bar, settings window refresh — action band 10 % darker; "Syncthing window" choice between command (default: GNOME Web app) and GUI URI
- [2026-10-18] Info box refresh — button row moved to the top on a darker band; status refreshes on open and after pause/resume
- [2026-10-18] Version from VERSION.md — version synced into `metadata.json` (`version-name` and integer `version`); "About" group in settings
- [2026-10-17] Refresh button in info box — refresh restarts the REST snapshot, re-reads config.xml and rescans for conflicts
- [2026-10-17] Context menu merged into info box — one popup with Run/Pause, Open UI and Settings; left click opens the info box, double click opens Syncthing
