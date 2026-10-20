# Change: disclaimer in the settings' About section

Backlog: "In Settings Box in section 'Info': Add the following … Create German version as well."

## Plan

1. **Branch** `feat/about-disclaimer` from an up-to-date `main`.
2. **prefs.js `_aboutGroup()`**: below the Version row, add a wrapped, dimmed `Gtk.Label`.
   It is placed under the boxed list, not as a row, because `Adw.PreferencesGroup.add()` puts non-row widgets below the list.
   The label has three lines, each a separate translatable text:
   - `This extension is not part of the official Syncthing project!`
   - `But Syncthing is essential for this extension to work.`
   - `Recommended is Epiphany (GNOME Web) for Web App feature.`
3. **locale/de.po**: add the German texts:
   - `Diese Erweiterung ist kein Teil des offiziellen Syncthing-Projekts!`
   - `Syncthing ist jedoch Voraussetzung, damit diese Erweiterung funktioniert.`
   - `Für die Web-App-Funktion wird Epiphany (GNOME Web) empfohlen.`
4. **Test**: `gjs -m scripts/i18n-check.js`, `tests/test_i18n.js`, the rest of the test suite, then the prefs window in the devkit.
5. **Version bump** `patch`, then update HISTORY.md and BACKLOG.md, commit, push, merge and tag.

## Notes

- I changed "Gnome Web" to "GNOME Web" so it matches the existing UI strings.
