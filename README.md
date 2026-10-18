# Syncbeacon - a Gnome Shell Extension for Syncthing

Shows the Syncthing status at a glance in the GNOME top bar and opens the Syncthing web UI in its own window, like a GNOME Web app. Inspired by the *Syncthing Indicator* extension. Targets GNOME Shell 50.

## Description

- A state icon with counts, e.g. `2/5 · 5` (online/total peers · folders). There are five states: In Sync, Synchronising…, Folder sync error or conflicts (yellow), Paused, Error with Syncthing (red).
- **Left click** opens an info box and refreshes the status: a slightly darker bar of controls on top (Open UI on the left; Run / Pause switch for all devices, Refresh, Settings on the right), then the state and every peer and folder.
- **Left double click** opens the Syncthing window: by default the Syncthing web UI in its GNOME Web app window.
- **Settings:** systemd unit info with Start / Stop, Syncthing config directory, how the Syncthing window opens (a command, by default the GNOME Web app, or the GUI URI and port in the default browser), position in the top bar (far left … far right), and a hotkey.

Design and decisions: [IMPLEMENTATION.md](IMPLEMENTATION.md).

## Layout

```
flake.nix                          package, devShell, checks (unit tests)
syncbeacon@whoozy82.github.io/     the extension
  extension.js                     wiring: client, conflicts, systemd, indicator, hotkey
  prefs.js                         settings window
  lib/state.js                     pure state rules (unit-tested)
  lib/config.js                    config.xml discovery, URI helpers
  lib/client.js                    REST snapshot + /rest/events long-poll
  lib/conflicts.js                 conflict scan via `find` subprocess
  lib/systemd.js                   unit detection, state, start/stop (D-Bus)
  lib/webapp.js                    GNOME Web app detection
  ui/indicator.js  ui/infobox.js   panel button, info box with controls
  icons/  schemas/  stylesheet.css
tests/                             gjs unit tests
scripts/                           dev-install, devkit, pack, status, make-icons (icons from Syncthing's tray icons)
```

## Develop

```sh
nix develop
gjs -m tests/test_state.js && gjs -m tests/test_config.js   # unit tests
gjs -m scripts/status.js                                    # live status of the local Syncthing, read-only
scripts/dev-install.sh                                      # compile schema, symlink into ~/.local/share/gnome-shell/extensions
###
nix develop -c scripts/dev-install.sh                       # nix and script in one go
###
gnome-extensions enable syncbeacon@whoozy82.github.io       # Enable the extension
gsettings reset org.gnome.shell.extensions.syncbeacon first-run-done   # Reset the first run flag
###
scripts/devkit.sh                                           # nested GNOME Shell window for testing
```

GNOME only loads a newly linked extension in the main session after a re-login. Use the devkit window until then. Watch for errors with:

```sh
journalctl --user -f -o cat /run/current-system/sw/bin/gnome-shell
```

Disable the other Syncthing indicators while testing.

## Install with Nix

```nix
# flake inputs
syncbeacon.url = "github:whoozy82/syncbeacon";

# NixOS configuration
environment.systemPackages = [ inputs.syncbeacon.packages.${pkgs.system}.default ];
# and add "syncbeacon@whoozy82.github.io" to org/gnome/shell enabled-extensions
```

`nix flake check` runs the unit tests. `scripts/pack.sh` builds the zip for extensions.gnome.org.

