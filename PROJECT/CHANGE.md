# Change: English as a translation (en.po) with symbolic keys

Backlog item: *i18n: have English as translated language with en.po and placeholders in program / scripts.*

Branch: `feat/i18n-en-po`

## Decisions

- The code uses symbolic keys instead of English sentences: `_('notify.rescan-failed', {error})`.
- `locale/en.po` holds the English texts. It is a translation like `de.po`.
- Lookup order: chosen language → `en.po` → the raw key.

## Key naming

`<area>.<name>`, lowercase, kebab-case. Areas follow the file or UI part:

| Area | Source |
|---|---|
| `notify.*` | notifications in `extension.js` |
| `indicator.*`, `infobox.*` | `ui/` |
| `state.*` | `lib/state.js` (status texts) |
| `client.*`, `config.*`, `systemd.*`, `webapp.*` | `lib/` error texts |
| `prefs.<group>.*` | `prefs.js`, e.g. `prefs.connection.test` |

Placeholders (`{error}`, `{count}`, `{n}`) stay as they are, inside the `.po` texts.

## Steps

1. **`lib/i18n.js`**
   - Keep two tables: the base (`en`) and the active language. `_()` looks in the active table, then the base, then returns the key.
   - Change `_n(key, n, values)` to take one key. Plural forms come from `msgstr[0]`/`msgstr[1]` in each `.po` file.
   - `pickLanguage()` treats `en` like any other language. If nothing matches, the result is `en`.
2. **`lib/locale.js`**
   - `loadLanguage()` always loads `en.po` as the base, then lays the chosen language over it.
   - `availableLanguages()` now lists `en` as well.
3. **`prefs.js`**: remove the hard-coded `['en', 'English']` entry. English comes from `en.po` (`Language-Name: English`). The order stays: System, then the languages by name.
4. **Convert the texts** (a one-off script in the scratchpad, not committed):
   - Map each of the ~129 English msgids to a key.
   - Rewrite the `_()`, `_n()` and `N_()` calls in the code.
   - Generate `en.po` from the current English texts.
   - Rekey `de.po`, keeping every German translation.
   - For plurals, `en.po` and `de.po` get `msgid` and `msgid_plural` both set to the key.
5. **`scripts/i18n-check.js`**
   - Match the new `_n(key, …)` form.
   - Check every `.po` file, `en.po` included, against the keys in the code.
   - `--update` adds the missing keys as empty entries to every `.po` file. Plural entries come from `_n` calls.
6. **`tests/test_i18n.js`**: update the tests to keys, and add tests for the fallback (language → en → key), the plural keys and `pickLanguage` with `en` available.
7. **Docs**: README (translation section and how to add a language), IMPLEMENTATION.md (General settings row, file tree with `en.po`), HISTORY, BACKLOG.

## Test

- `nix develop -c gjs -m tests/test_i18n.js` and the other unit tests
- `nix develop -c gjs -m scripts/i18n-check.js` reports 0 missing or untranslated for `en.po` and `de.po`
- `nix flake check`
- Devkit: System, English and Deutsch each show the same texts as before, with no raw keys anywhere (indicator, info box, settings, notifications).

## Version

Minor bump: the translation file format for contributors changes. Users see no change.
