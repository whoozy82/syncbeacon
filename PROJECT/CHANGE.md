# Change: i18n – multilingual UI

Backlog: language selection (System, English, German) in the settings window; fall back to English; languages maintainable as text files inside the extension.

## Why not plain gettext

GNOME Shell's gettext follows the language of the whole Shell process (`LANGUAGE`/locale), so an extension cannot pick its own language with it. Instead: a small loader of our own that reads translation text files at runtime (no compile step, no `.mo` files).

## Plan

1. **Translation files** – `syncbeacon@whoozy82.github.io/locale/de.po`
   - Standard gettext `.po` format (`msgid` / `msgstr`, comments allowed), editable by hand or with Poedit; English is the source text in the code, so no `en` file is needed.
   - New language = drop in `<code>.po`; it then shows up in the selection automatically (name taken from a `Language-Name` header line).
   - `scripts/i18n-check.sh` (or a gjs script) lists strings used in code but missing in a `.po` file and strings no longer used.
2. **`lib/i18n.js`** (no gi imports in the core, so it is unit-testable)
   - `parsePo(text)` → map; `_()` looks up the active map, falls back to the English msgid; `_f('… {name} …', {name})` for strings with values.
   - `loadLanguage(dir, setting)`: `system` → first match of `GLib.get_language_names()` (e.g. `de_DE.UTF-8` → `de`) among the available files, otherwise English.
3. **Wrap strings** in `extension.js`, `prefs.js`, `lib/*.js`, `ui/*.js` (~140 user-visible strings: state labels, folder states, headlines, placeholders, tooltips/accessible names, notifications, settings texts). Not translated: Syncthing's own error texts from the REST API, log messages, metadata.json description.
4. **Setting** – schema key `language` (`system` | `en` | `de` | …, default `system`); settings window: new row "Language" (combo: System, English, Deutsch, … from the available files) – probably in a new "General" group at the top.
5. **Live switch**
   - Extension: on `changed::language` reload the table and rebuild the indicator + info box.
   - Settings window: rebuild its pages in place (or, if that turns out fiddly, show "Takes effect when the settings window is reopened").
6. **German translation** of all strings (`de.po`), terms matching Syncthing's German UI (e.g. "Ordner", "Geräte", "Pausiert", "Synchronisiere…").
7. **Tests** – `tests/test_i18n.js` (po parsing incl. multi-line/escapes, fallback, system language matching); add to flake checks. Then devkit user test in both languages.
8. Version bump: minor; HISTORY, BACKLOG, README (language setting, how to add a language).
