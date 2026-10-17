#!/usr/bin/env bash
# Start a nested GNOME Shell (devkit window), so the main session never crashes
# while developing. Run scripts/dev-install.sh and
# `gnome-extensions enable syncbeacon@whoozy82.github.io` first.
#
# The nested shell shares dconf with the main session, so the enabled-extension
# list is the same in both; the main session only loads a newly linked
# extension after a re-login.
set -euo pipefail

export MUTTER_DEBUG_DUMMY_MODE_SPECS=${MUTTER_DEBUG_DUMMY_MODE_SPECS:-1600x900}
exec dbus-run-session -- gnome-shell --devkit --wayland
