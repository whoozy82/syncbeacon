# Syncbeacon: Implementation Plan

Status: v5, 2026-10-17. Implemented in [syncbeacon/](syncbeacon/), see §5 for what is verified.
Source: [PROJECT.md](PROJECT.md), [ui-mockup.png](ui-mockup.png)

This version replaces the earlier plan (a Python backend with separate panel frontends for GNOME and Noctalia). With GNOME as the only target, a single GNOME Shell extension plus the existing GNOME Web app covers every feature, in about half the time.

## 1. What this machine has

| Item | Value | Consequence |
|---|---|---|
| OS | NixOS 26.05 | Ship as a Nix flake (package + devShell). No writes to `/usr`. |
| Desktop | GNOME Shell 50.5, Wayland | The extension uses ESM (GNOME 45+). No X11 tricks. |
| Syncthing | v2.1.3, **system** unit `syncthing.service` (NixOS module), config in `~/.config/syncthing/` | Start and Stop on a system unit need polkit. The enabled state is only displayed, which suits NixOS, where the unit is declarative. |
| GUI | `config.xml` has `<gui tls="false">` at `127.0.0.1:8384`. Syncthing still answers HTTPS on the same port with a self-signed cert, which is what the web app uses (`https://localhost:8384`). | The REST client takes the scheme from `config.xml`. When TLS is used, it trusts exactly `https-cert.pem`, never all invalid certs. Web app and GUI URI are compared by host and port only, with loopback names treated as equal. |
| GNOME Web | `epiphany` installed. A web app "Syncthing" already exists (`org.gnome.Epiphany.WebApp_a008d57e….desktop`, URL `https://localhost:8384/#`) | The mockup is this web app. The extension launches it instead of building its own window. |
| Existing extensions | `syncthing@gnome.2nv2u.com` (Syncthing Indicator, the reference), `syncthing-toggle@…` | Disable both while testing. |

## 2. Technology evaluation

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **GNOME Shell extension only** | Native top-bar integration with full control over clicks, popups, menus and placement. Extension prefs are a native libadwaita window, so the settings screen comes for free. No extra process. Syncthing Indicator proves the approach. | GNOME only. Code runs inside the gnome-shell process, so a bug can crash the shell and blocking I/O freezes it. The extension API changes with most GNOME releases. | **Chosen** |
| Python/GTK4 backend + thin extension (previous plan) | One source of truth for several shells. Own WebKit window. | An extra resident process, a custom D-Bus interface, a second settings system and Python packaging. Its only advantage, multi-shell support, no longer applies. | Rejected |
| GTK4 app with tray icon (StatusNotifierItem) | Works in any shell with a tray | GNOME needs the AppIndicator extension. SNI has no double click and cannot open a custom info box on left click, so the required behaviour cannot be built. | Rejected |
| Fork Syncthing Indicator | REST client, panel button and systemd toggle already exist | The click behaviour, info box, five states and settings differ, so most of it would be rewritten. License and code age need checking. | Use as a reference only |
| Electron / Tauri | Cross-platform | Heavy, and does not solve the panel integration. The brief says to avoid Electron. | Rejected |

**Window:** launch the GNOME Web web app rather than building a WebKitGTK window. It already looks like the mockup, keeps its own login session, has already accepted the certificate, and GNOME Shell raises the existing window when it is launched again. The trade-off is that its URL is fixed in the web app. The prefs show a warning if it differs from the configured URI (§3.6).

## 3. Design

```
                     ┌──────────────────── syncbeacon@whoozy82.github.io (GJS, in gnome-shell) ───────────────────┐
Syncthing REST ◄────►│ client.js ──► state.js (pure) ──► indicator.js: icon + counts, colour by state             │
 /rest/events        │  (Soup 3,      5 rules,            infobox.js:   left-click popup with the controls       │
 long-poll           │  pinned cert)  details rows                      (Run/Pause, Open UI, Settings)          │
                     │ conflicts.js (async `find`)        keybinding:   hotkey → open/raise window               │
systemd (D-Bus) ◄───►│ systemd.js (unit state, start/stop)                                                       │
                     └───────────────┬──────────────────────────────────────────────────┬────────────────────────┘
                                     │ double click / "Open UI" / hotkey                │ "Settings"
                                     ▼                                                  ▼
                       GNOME Web app "Syncthing" (existing)                 prefs.js (Adw preferences window)
```

### 3.1 Naming

- **Product name: Syncbeacon** (confirmed). It does not start with "Syncthing", as the Syncthing project and the extensions.gnome.org reviewers prefer. The description says *"Syncthing status in the top bar"*.
- **Extension UUID: `syncbeacon@whoozy82.github.io`.** This is the extension's permanent identity on extensions.gnome.org, so use it from day one.
- **Settings schema:** `org.gnome.shell.extensions.syncbeacon` at path `/org/gnome/shell/extensions/syncbeacon/`.
- **Repo:** `github.com/whoozy82/syncbeacon`. If a standalone app is ever added, its app ID will be `io.github.whoozy82.Syncbeacon`.

### 3.2 Connection: `lib/config.js`, `lib/client.js`

- **Discovery:** read `config.xml` asynchronously from the configured config directory (auto-detect: `$XDG_STATE_HOME/syncthing`, then `~/.config/syncthing`). Pull out `<gui tls=…>`, `<address>` and `<apikey>` with targeted regexes, because GJS has no usable XML parser and these elements are simple. A URI set in the prefs (scheme, host and port) overrides the address. The file is re-read when the settings change or when a request returns 403 (the API key changed).
- **HTTP:** one `Soup.Session`. Every request sends the `X-API-Key` header. TLS: the `accept-certificate` signal accepts the peer certificate only if it `is_same()` as `https-cert.pem` from the config directory.
- **Initial snapshot:**
  - `/rest/system/status`
  - `/rest/config` (folders, devices, pause flags)
  - `/rest/system/connections`
  - `/rest/db/status?folder=…` for each folder
  - `/rest/db/completion?device=…` for each device
  - `/rest/system/error`
  - Failed items come from `pullErrors` in `/rest/db/status` and `FolderSummary`. A separate `/rest/folder/errors` call is not needed.
- **Live updates:** long-poll `/rest/events?since=N&timeout=60&events=StateChanged,FolderSummary,FolderCompletion,FolderErrors,DeviceConnected,DeviceDisconnected,DevicePaused,DeviceResumed,ConfigSaved,ItemFinished`. On `ConfigSaved`, or if the event ID goes backwards (Syncthing restarted), take a fresh snapshot.
- **Reconnect:** backoff of 1, 2, 5, 10 and 30 s while unreachable.
- **Actions (Run / Pause):** these cover all devices, online and offline, the same as the web UI's "Pause All" and "Resume All".
  - **Pause** sends `POST /rest/system/pause`.
  - **Run** sends `POST /rest/system/resume`, which also resumes devices that were paused individually in the web UI.
  - Syncthing saves the pause in its config, so it survives restarts. An offline device that comes back stays paused.
- **Lifetime:** everything is async with a `Gio.Cancellable`. `disable()` cancels it and aborts the session, so nothing outlives the extension.

### 3.3 State: `lib/state.js`

A pure function, `snapshot → Status`. It imports nothing from `gi://`, so it can be unit-tested outside the shell.

- `Status = {state, peersConnected, peersTotal, foldersTotal, devices[], folders[], message}`
- Rules, highest priority first. PROJECT.md defines In Sync, Synchronising and Paused by devices, so the rules look at devices, not at local folder activity:
  1. **Error with Syncthing itself** (`error`, red): REST unreachable or auth failed, a non-empty `/rest/system/error`, or the systemd unit not active. The message says which: "Syncthing service stopped", "Cannot reach GUI at …", "API key rejected", or the system error text.
  2. **Folder sync error or conflicts** (`folder-issue`, yellow): any folder in state `error`, folder pull errors, or at least one conflict file. The rows say which folder and why, e.g. "Tech: 2 conflicts" or "Musik: 3 failed items".
  3. **Paused** (`paused`): all online devices are paused. Syncthing disconnects a device when it is paused, so a literal "online and paused" never happens. The rule is therefore: at least one device is paused, and no unpaused device is connected. Offline, unpaused devices do not prevent Paused. Paused folders alone do not count. This rule comes before Synchronising, so the icon shows Paused straight after Pause, even while a transfer is still winding down.
  4. **Synchronising…** (`syncing`): at least one device is actively syncing. That is either a connected, unpaused device with completion below 100 %, or a local folder in `sync-preparing` or `syncing` (downloading from a device). Local `scanning`, `scan-waiting` and `sync-waiting` do not count, because no device is transferring. The info box still shows them in the folder rows.
  5. **In Sync** (`in-sync`): all online (connected) devices are at 100 % and nothing is downloading. Offline devices are ignored. If no device is online, the state is In Sync and the info box header says "No devices online".

### 3.4 Conflicts: `lib/conflicts.js`

Syncthing has no API for conflicts, so the extension searches the folders itself:
- **Scan:** for each folder path from `/rest/config`, run `find <path> -name '*.sync-conflict-*' -not -path '*/.stversions/*'` through `Gio.Subprocess` (async). This keeps the file-system work out of the shell process. The scan runs at start-up and every 10 minutes, one folder at a time, and is killed after 30 s.
- **Between scans:** an `ItemFinished` event for a name matching `.sync-conflict-` adds it to the set right away. A deletion is noticed at the next scan.
- **Permissions:** Syncthing runs as the desktop user here, so the folders are readable. If a folder is not readable, its row shows "conflict check unavailable" and the state is not affected.

### 3.5 Panel element: `ui/indicator.js`, `ui/infobox.js`

- **Button:** a `PanelMenu.Button` with an `St.Icon` (state icon) and an `St.Label` with the counts, e.g. `3/5 · 5` (connected/total peers · folders). Counts can be hidden in the prefs.
- **Colour:** the icon carries the style class `syncbeacon-<state>`. `stylesheet.css` colours `.syncbeacon-folder-issue` yellow (`#e5a50a`) and `.syncbeacon-error` red (`#e01b24`). The other three states set no colour and follow the panel theme.
- **Placement:** `Main.panel.addToStatusArea(uuid, button, index, box)`. The five positions from PROJECT.md map to GNOME's three panel boxes:

  | Setting | Box | Index | Where it appears |
  |---|---|---|---|
  | Far left | `left` | `0` | Before the Activities button |
  | Left | `left` | end | After the Activities button |
  | Middle | `center` | end | Right of the clock |
  | Right | `right` | `0` | Leftmost of the status icons |
  | Far right | `right` | end | After the system menu, at the screen edge |

  A change in the prefs removes the button from its box and re-inserts it live. That is as much positioning as GNOME allows.
- **Mouse:** the button has no menu of its own (`dontCreateMenu`). A `Clutter.ClickGesture` handles presses, and the time between two left presses is compared with the double-click time:

  | Input | Action |
  |---|---|
  | Left click | Open or close the info box |
  | Left double click | Close the info box and open the Syncthing window |

  A single click acts at once instead of waiting for a possible second click. The info box therefore flashes open briefly on a double click, which avoids a delay of about 400 ms on every single click. While the info box is open it holds a grab, so its `captured-event` handler passes presses on the button to the same logic.
- **Info box:** a `PopupMenu.PopupMenu` attached to the button, with its own `PopupMenuManager`. Shell positioning, click-outside, Esc and keyboard focus come for free, so no custom popup code is needed. Contents:
  - a bar of controls at the top, on a band 10 % darker than the popup (`rgba(0, 0, 0, 0.1)`) that reaches the popup's edges:
    - Open UI, on the left: a round `icon-button` with the Syncthing logo (`icons/syncbeacon-syncthing-symbolic.svg`). It closes the info box and opens the Syncthing window.
    - Run/Pause, right-aligned like the rest: a `PopupMenu.Switch` without a label inside an `St.Button`. It is on unless the state is Paused, and switching it calls Run or Pause (§3.2) and refreshes the status once the request succeeds. It is greyed out when no devices are configured or Syncthing is unreachable.
    - Refresh: a round `icon-button` (`view-refresh-symbolic`). The info box stays open. It restarts the REST snapshot (aborts the running long-poll or skips the reconnect backoff), re-reads config.xml if that had failed, and rescans for conflict files.
    - Settings: a round `icon-button` with a gear. It closes the info box and opens the settings window (`openPreferences()`).
  - a header with the state and message
  - one row per device: status dot, name, Connected / Syncing x % / Disconnected / Paused
  - one row per folder: name, Up to date / Syncing x % / Scanning / Paused / n failed items / n conflicts

  Opening it triggers the same refresh as the Refresh button. It updates live while open. Only the device and folder rows are rebuilt, so the controls keep their focus and hover state.
- **Hotkey:** `Main.wm.addKeybinding('toggle-window', settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, …)`. If the Syncthing window is focused it is minimised. Otherwise it is opened or raised.

### 3.6 Syncthing window: `lib/webapp.js`

The setting `window-mode` picks one of two ways to open the window:

- **Command** (default): run `window-command`.
  - **Default command:** while `window-command` is empty, the extension (after reading `config.xml`) and the settings window (when shown) store the `Exec` line of the GNOME Web app (`org.gnome.Epiphany.WebApp_*.desktop`) whose URL matches the GUI URI. The setting therefore holds the real command. The reset button in the settings, or applying an empty field, stores the detected command again.
  - **Known app:** if the command is the `Exec` line of an installed app (compared as parsed arguments, without field codes like `%U`), `Shell.AppSystem.lookup_app(<desktop ID>).activate()` is used instead. It starts the app or raises its existing window, and the hotkey can minimise it. With the default command this is always the case.
  - **Any other command:** run with `/bin/sh -c`. A non-zero exit status is reported as a notification. The hotkey cannot find this window, so it only opens it.
  - **No command and no web app:** open the GUI URI in the default browser. The prefs explain how to create a web app (GNOME Web → ⋮ → "Install Site as Web App…").
- **GUI URI and port:** open the GUI URI in the default browser.

**First run** (`first-run-done` is false; runs once the GUI URI is known from `config.xml`):

- **GNOME Web installed** (`epiphany` in `PATH`): if no web app matches the GUI URI, one named "Syncthing" is created (`createWebApp()` in `lib/webapp.js`), and `window-command` is set to its command. The files are laid out as GNOME Web's own "Install Site as Web App…" leaves them through the DynamicLauncher portal, so GNOME Web lists and manages the app like its own:
  - ID `org.gnome.Epiphany.WebApp_<SHA-1 of the name>`, as in GNOME Web. If that ID is taken, "Syncthing GUI" or "Syncthing (Syncbeacon)" is used instead.
  - profile `~/.local/share/<id>/` with an empty `.app` marker; GNOME Web fills in the rest on first start
  - desktop file `~/.local/share/xdg-desktop-portal/applications/<id>.desktop`, symlinked from `~/.local/share/applications/`
  - icon: Syncthing's `hicolor` app icon, copied to `~/.local/share/xdg-desktop-portal/icons/192x192/`
  
  The portal itself is not used: it only accepts desktop file IDs prefixed with the caller's app ID, and it asks for confirmation in a dialog. A Flatpak GNOME Web counts as not installed, because it keeps its web apps elsewhere.
- **GNOME Web not installed:** `window-mode` is set to `uri` and `gui-uri` to the address from `config.xml`.
- Keys the user has already set are left alone.

### 3.7 Settings window: `prefs.js`

`ExtensionPreferences.fillPreferencesWindow()` builds one `Adw.PreferencesPage` with the following groups. The hotkey is unset by default, to avoid clashing with existing shortcuts.

| Page / group | Settings | Implementation |
|---|---|---|
| Service (systemd) | **Info:** unit name and enabled state (e.g. `syncthing.service`, system, enabled), plus the live active state. **Controls:** Start, Stop. | `lib/systemd.js`: `org.freedesktop.systemd1` over the system bus, falling back to the session bus for a user unit. The unit is auto-detected from `syncthing.service`, `syncthing@$USER.service` or a user `syncthing.service`. It reads `Id`, `UnitFileState` and `ActiveState`, and calls `StartUnit` / `StopUnit` with `ALLOW_INTERACTIVE_AUTHORIZATION` so GNOME shows the polkit prompt. Info and buttons update live from `PropertiesChanged`. The enabled state is display-only, so no NixOS special case is needed. |
| Connection | In this order: Syncthing config directory (file chooser + auto-detect). "Syncthing window": Command or GUI URI and port (§3.6). The third row depends on that choice: the command (default from the GNOME Web app, with a reset button) or the GUI URI including port (default from `config.xml`). "Test connection" button. | The "Syncthing window" row's subtitle says what will happen: which app is opened or raised, that the command runs in a shell, or the "no web app" note from §3.6. The GUI URI is also used for the REST connection; while the Command mode hides its row, the address from `config.xml` (or an earlier override) still applies. Test: `GET /rest/noauth/health`, then an authenticated `/rest/system/version`, showing the result inline. |
| Position | Far left / Left / Middle / Right / Far right (`Adw.ComboRow`) | Stored as an enum in GSettings and applied live by the extension (§3.5) |
| Hotkey | Shortcut to open or raise the Syncthing window | A small shortcut-recorder dialog (`Gtk.EventControllerKey` → `Gtk.accelerator_name`), stored as `as` in GSettings. libadwaita has no ready-made shortcut widget. |

`lib/config.js` and `lib/systemd.js` use only `Gio`/`GLib`, so `prefs.js` can share them. The prefs run in a separate process and cannot import Shell modules.

### 3.8 Icons: `icons/`

- Taken from Syncthing's own tray icons ([`assets/statusicons`](https://github.com/syncthing/syncthing/tree/main/assets/statusicons), MPL-2.0): the logo, with a bite out of the bottom right corner holding a badge.
- Five symbolic SVGs, `syncbeacon-<state>-symbolic.svg`:

  | State | Icon | Upstream |
  |---|---|---|
  | `in-sync` | plain logo, no badge | `default.svg` |
  | `syncing` | badge with two arrows | `sync.svg` |
  | `folder-issue` | badge with ! | `notify.svg` |
  | `paused` | badge with ‖ | `pause.svg` |
  | `error` | badge with ✕ | none, drawn in the same weight |

- `syncbeacon-syncthing-symbolic.svg`: the plain logo for the Open UI button in the info box.
- The shell recolours symbolic icons by forcing `fill`, so upstream's masks and strokes would break. `scripts/make-icons.py` flattens the upstream geometry into one filled path per icon with boolean operations (skia-pathops); the lines of the logo are cut out of the disc. Rerun it after a change, the command is in its header.
- They are loaded with `Gio.FileIcon` from the extension directory. Being symbolic, they take the panel colour, or the CSS colour for the two coloured states.
- Optional: animate the arrows in `syncing` by swapping frames.

## 4. Repository layout

```
Syncthing_UX/
├── PROJECT.md  IMPLEMENTATION.md  ui-mockup.png
└── syncbeacon/                                  # the program (future git repo)
    ├── flake.nix  README.md  .gitignore         # package, devShell, checks (unit tests)
    ├── syncbeacon@whoozy82.github.io/
    │   ├── metadata.json  extension.js  prefs.js  stylesheet.css
    │   ├── lib/      config.js  client.js  state.js  conflicts.js  systemd.js  webapp.js
    │   ├── ui/       indicator.js  infobox.js
    │   ├── icons/    syncbeacon-{in-sync,syncing,folder-issue,paused,error,syncthing}-symbolic.svg
    │   └── schemas/  org.gnome.shell.extensions.syncbeacon.gschema.xml
    ├── tests/        harness.js  test_state.js  test_config.js   # run with `gjs -m`
    └── scripts/      dev-install.sh  devkit.sh  pack.sh  status.js  make-icons.py
```

`scripts/status.js` runs the real client, systemd and conflict code outside the shell and prints the derived status. It is read-only.

## 5. Phases

Each phase ends with something that runs and can be checked.

**Progress (2026-10-17):** the code for all phases is written.

Verified automatically:
- 28 unit tests pass (`nix flake check`).
- `scripts/status.js` shows the correct live state of the local instance: 2/5 peers, 5 folders, unit `syncthing.service` active and enabled, web app detected.
- The conflict scanner finds conflict files and skips `.stversions`.
- In an isolated headless GNOME Shell 50, the extension reaches state ACTIVE and the prefs open, both without JS errors.

Still open, because they need a person at the screen:
- the Phase 0 spikes (double click while the info box is open, raising the web app)
- the acceptance checklist in §7

**Phase 0: Scaffold and spike (½–1 day)**
- `flake.nix` devShell, `metadata.json` (`shell-version: ["50"]`), an empty button in the panel, and the schema compiled.
- Dev loop: symlink the extension into `~/.local/share/gnome-shell/extensions/` and run `dbus-run-session gnome-shell --devkit --wayland`, so the main session never crashes.
- **Spike** the two riskiest parts first:
  - `get_click_count()` returns 2 on a double click, even while the info box opened by the first click holds its grab.
  - `lookup_app(...).activate()` raises the existing GNOME Web window.
- ✅ The button appears in the devkit session. A left click opens a placeholder box, a double click opens the web app, and a right click opens a placeholder menu.

**Phase 1: Status (1½ days)**
- `config.js`, `client.js`, `state.js`, `conflicts.js`. Icon, colour and counts on the button.
- Unit tests for every state rule and the priority order.
- ✅ The icon changes correctly when you:
  - pause or resume in the web UI
  - create a fake `x.sync-conflict-20261017-000000-ABCDEFG.txt`
  - stop the service
  - change the API key

**Phase 2: Interaction (1 day)**
- Info box contents, the context menu with a working pause toggle, the window launch and the hotkey (with a hard-coded shortcut for now).
- ✅ Acceptance criteria 2–4 are met in the devkit session (§7). "Settings" opens a stub prefs window.

**Phase 3: Settings (1½ days)**
- `prefs.js` with all four pages, `systemd.js`, the shortcut recorder and live panel re-positioning.
- ✅ Each setting has a visible effect:
  - the unit name and enabled state are shown
  - Stop and Start work after a polkit prompt, and the panel icon goes red and back
  - a changed URI or port is used for status
  - the hotkey can be changed
  - the button moves live to each of the five positions

**Phase 4: Packaging and polish (½–1 day)**
- A Nix package that installs to `share/gnome-shell/extensions/<uuid>` with the schema compiled. Add it to the NixOS config and enable it through dconf `enabled-extensions`.
- Run `gnome-extensions pack` for a later extensions.gnome.org upload. Write the README, and optionally add de/en translations (gettext).
- ✅ The acceptance checklist (§7) passes on the real session after a re-login.

Rough total: 5–6 working days.

## 6. Testing

- **Unit:** `gjs -m tests/test_state.js` and `tests/test_config.js`, run against snapshots built in the tests. No running Syncthing needed.
- **Integration:** a throwaway Syncthing instance (`syncthing serve --home=$(mktemp -d) --no-browser --gui-address=127.0.0.1:18384`), with the extension's URI and config path pointed at it and driven over REST to produce each state.
- **Shell:** run `journalctl --user -f -o cat /run/current-system/sw/bin/gnome-shell` and watch for JS errors. Enable and disable the extension 10 times and confirm there are no errors, no leftover actors or keybindings, and no running `find` processes.

## 7. Acceptance checklist

| # | Criterion (PROJECT.md) | How to verify |
|---|---|---|
| 1 | UI element is visible on taskbar on this machine | After installation and enabling, the icon and `x/5 · 5` appear in the top bar. Each of the five positions in the prefs moves it live. |
| 2 | Context menu shows the described functions and each one works | The info box (left click) shows the Run/Pause switch, the Open UI button (Syncthing icon) and the Settings button (gear icon) below its header. Switching Run/Pause off pauses all devices: within 2 s the icon shows Paused and the web UI shows every device, online or offline, as paused. Switching it on resumes all of them. "Open UI" closes the info box and shows the window. "Settings" closes it and opens the prefs. |
| 3 | Info box pops up when clicking the taskbar element | A left click shows all 5 devices and 5 folders with their current status. A click outside, Esc, or another click on the button closes it. |
| 4 | Syncthing UI pops up when double clicking the taskbar element | A double click opens or raises the "Syncthing" GNOME Web app at `https://localhost:8384`, and the info box is closed. |
| — | States and colours | Force each of the 5 states (see Phase 1). Folder issue is yellow and Syncthing error is red. The other three match the other top-bar icons in light and dark style. |

## 8. Open questions

None at the moment.

Resolved:
- Run / Pause pauses and resumes all devices through the REST API, and Syncthing keeps running (§3.2).
- In Sync and Paused consider online devices only. A paused device counts as "online and paused" (§3.3).
- GNOME only. Hyprland, Noctalia and the auto-run setting are dropped.
- No hover action. A left click shows the info box and a double click opens the window. The acceptance criteria now say the same.
- No separate context menu and no right-click action. Run/Pause, Open UI and Settings sit in the info box below the header (PLAN.md, 2026-10-17).
- Systemd settings: show the name and enabled state, with Start and Stop only.
- Panel position: five presets (§3.5).
- Five icons. Folder issues are yellow and Syncthing errors red.
- The window is the GNOME Web app.
- Name Syncbeacon, UUID `syncbeacon@whoozy82.github.io`.

## 9. Risks

| Risk | Mitigation |
|---|---|
| A bug in the extension freezes or crashes the shell | All I/O is async with cancellables, and conflict scanning runs out of process. Develop in a devkit session. Do the enable/disable leak test from §6. |
| GNOME Shell API changes with each release | Keep `state.js` and `config.js` free of Shell imports. Pin `shell-version` and re-test on each GNOME upgrade. |
| Double click does not register while the info box holds its grab | This is the Phase 0 spike. Fallback: handle the second press inside the info box's `captured-event`, or open the info box on button release. |
| The GNOME Web app is missing or its URL is stale | Detect it in the prefs and show a warning. Fall back to the default browser. |
| `find` is slow on large folders | One folder at a time, 30 s timeout, 10 min interval, plus `ItemFinished` events in between. |
| Polkit prompts for the system unit | Only on an explicit action in Settings, never automatically. |
