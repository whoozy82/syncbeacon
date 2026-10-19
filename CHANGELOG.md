# Changelog

## 2026-10-18: Version from VERSION.md

- `scripts/sync-version.sh` copies the version from `VERSION.md` into `metadata.json` (`version-name`)
  - runs automatically in `dev-install.sh` and `pack.sh`
  - the Nix package reads `VERSION.md` directly and patches `metadata.json` in its build
- Settings window shows the version in a new "About" group

## 2026-10-17: Context menu merged into info box

- Combine info box and context menu to one + adapt click events accordingly
- The items from context menu will be included in info box:
  - between headline and devices list
  - all horizontally aligned next to each other
  - Run/Pause Toggle without text
  - UI Start as circular Syncthing icon
  - Settings Button as circular settings icon
- Left Click opens info panel
- Double Click opens Syncthing window

## 2026-10-17: Separator and refresh button in info box

- In infobox between headline and button row a horizontal line is inserted
- Between toggle and Syncthing icon comes a new button to refresh the status
  - `view-refresh-symbolic` icon; info box stays open and updates in place
  - Refresh restarts the REST snapshot (aborts the running long-poll or skips the reconnect backoff),
    re-reads config.xml if that had failed, and rescans for conflict files

## 2026-10-18: Info box refresh

- The horizontal line between headline and button row is removed
- The button row moves to the top, above the headline:
  - Left: Syncthing icon
  - Right: 1. enable / pause toggle, 2. Refresh icon, 3. Settings icon
  - It sits on a band 25% darker than the popup (`rgba(0, 0, 0, 0.25)`), reaching the popup's edges
- The enable / pause toggle refreshes the status once the pause/resume request succeeds
- Opening the info box refreshes the status

## 2026-10-18: Lighter button bar, settings window refresh

- Info box: the top button bar is only 10% darker than the rest (`rgba(0, 0, 0, 0.1)`)
- Settings, block 'Connection':
  1. Config directory (unchanged)
  2. Syncthing window: selection between Command and GUI URI and port (settings `window-mode`, `window-command`; replaces `web-app-id`)
  3. Depending on the selection: the command as text input, or GUI URI and port (as before)
  4. Test connection (unchanged)
- Command (default): runs the command in a shell
  - The command is not left empty: the Exec line of the GNOME Web app matching the GUI URI is stored in it
    (`epiphany --application-mode …`), so the current behaviour stays the default; the reset button re-detects it
  - If the command is an installed app's Exec line, that app is activated instead, so an open window is raised and the hotkey can minimise it
- GUI URI and port: opens the address in the default browser

## 2026-10-18: First run setup of the Syncthing window

- Runs once (setting `first-run-done`), as soon as the GUI address is known from config.xml
- GNOME Web (`epiphany`) detected: create the Syncthing web app unless one matches the GUI URI,
  and set window-command to it (`epiphany --application-mode …`)
  - Laid out like GNOME Web's own "Install Site as Web App…" (profile dir, desktop file and icon under
    `~/.local/share/xdg-desktop-portal/`), so GNOME Web manages it like its own
- GNOME Web not detected: select GUI URI and port and set it to the address from config.xml
- Settings the user already made are kept

## 2026-10-18: Icons from Syncthing's tray icons

- Panel and Open UI icons follow Syncthing's own tray icons (`assets/statusicons`, MPL-2.0):
  the logo with a badge in a bite out of the bottom right corner
  - In Sync: plain logo; Synchronising: arrows; Folder issue: !; Paused: ‖; Error: ✕ (not upstream, same weight)
- Kept symbolic (panel colour, yellow / red for the two coloured states); `scripts/make-icons.py` flattens
  the upstream geometry into filled paths



## Backlog

- i18n: Addtional tab with language in settings with option to translate labels and buttons
- Extend to scope to non NixOS Gnome systems