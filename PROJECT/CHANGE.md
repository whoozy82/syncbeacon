# Change: async translation loading (EGO-X-004)

Branch: `fix/async-locale`

## Problem

Shexli (extensions.gnome.org) warns EGO-X-004: `lib/locale.js:13` reads the
translation file with `GLib.file_get_contents()`, which is synchronous file IO
inside gnome-shell. `catalogFiles()` also lists `locale/` synchronously with
`GLib.Dir`. This is not flagged, but it is the same kind of IO.

## Plan

1. `lib/locale.js`
   - `readCatalog()`: `Gio.File.load_contents_async` (promisified, the same way as `lib/config.js`).
   - `catalogFiles()`: `Gio.File.enumerate_children_async` / `next_files_async` instead of `GLib.Dir`.
   - `availableLanguages()` and `loadLanguage()` become `async` and take an optional `Gio.Cancellable`.
2. `extension.js`
   - `enable()` calls `this._onLanguageChanged()` and no longer calls `loadLanguage()` directly.
   - `_onLanguageChanged()` becomes async: it awaits `loadLanguage()`, then rebuilds the indicator and schedules an update.
     - A cancellable, cancelled in `disable()` and on every new language change, so a stale or late load never touches a disabled extension.
   - Until the catalog is loaded, the indicator shows the bare keys for a moment. This only affects the info box texts, and the info box cannot be open yet.
3. `prefs.js`: `fillPreferencesWindow` becomes `async` (allowed since GNOME 47; the extension targets 49+). `build()` awaits `loadLanguage()` and `availableLanguages()`, with a generation check for quick language switches.
4. `tests/test_state.js`: top-level `await loadLanguage(…)`. `gjs -m` has to run the main loop for this; if it does not, the test drives a `GLib.MainLoop` itself.

## Test

- `gjs -m tests/test_*.js`, `scripts/ego-check.sh` (EGO-X-004 must be gone).
- User test in the Mutter devkit: language at startup, language switch in prefs, disable/enable.
