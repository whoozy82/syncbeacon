# Change: Epiphany Web App window mode

## Plan
1. Schema: `window-mode` gains `webapp` (new default). `window-command` no longer auto-filled. New `settings-version` (int) for one-time migrations.
2. `lib/webapp.js`: drop `storeWebAppCommand()`; `windowCommand()` returns the setting only.
3. `extension.js`: `webapp` mode opens/raises (hotkey: minimises) the web app whose URL matches the GUI URI, looked up each time. Created automatically when GNOME Web is installed and none matches (once per URI per session). Fallback: default browser. First run: no GNOME Web → `uri` mode; no longer writes `window-command`.
   Migration (settings-version 0 → 1): a `window-command` that is an Epiphany web app Exec line is cleared; `window-mode` `command` is then reset to the default.
4. `prefs.js`: modes "Epiphany Web App", "Command", "GUI URI and port". Web app mode shows a read-only row with the desktop ID and name (updates via `Gio.AppInfoMonitor`; notes a missing app or GNOME Web). Command field not pre-filled, reset button removed; empty → default browser.
6. Requested during test: `gui-uri` defaults to `http://localhost:8384` (empty still means config.xml); the dead first-run copy of the config.xml address into an empty `gui-uri` is removed.
5. Docs: IMPLEMENTATION §3.6/§3.7, README, HISTORY, BACKLOG. Branch `feat/webapp-window-mode`, minor bump.
