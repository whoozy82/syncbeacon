# Change: Raise the open settings window

Backlog item: clicking Settings in the info box while the settings window is already open logs
"Already showing a prefs dialog". The open window shall be raised instead, without an error.

Cause: `Extension.openPreferences()` asks the `org.gnome.Shell.Extensions` D-Bus service to open the
dialog; the service shows one prefs dialog at a time and answers a second request with that error,
which GNOME Shell logs. The open window is not raised.

## Plan

1. **extension.js**: override `openPreferences()`. Look for an open window of the GTK application
   `org.gnome.Shell.Extensions` (WM class; the dialog belongs to no GTK application) titled with `metadata.name` ("Syncbeacon", the title GNOME gives the
   prefs dialog); if found, raise it with `Main.activateWindow()`, otherwise call
   `super.openPreferences()`. The info box's Settings button keeps calling `openPreferences()`.

2. **Limitation**: if the settings window of *another* extension is open, GNOME still refuses and logs
   the error; Syncbeacon cannot open its own settings then. Not handled.

3. **Tests**: all `tests/` scripts, EGO check. User test in the devkit: open Settings, click Settings
   again from the info box (window comes to the front, nothing in the log); minimise it and click again
   (window comes back); close it and click again (opens normally).

4. **Release**: patch version bump, HISTORY.md, remove the item from BACKLOG.md.
