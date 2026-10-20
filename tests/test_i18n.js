// Translation lookup, .po parsing and language choice.
// Run: gjs -m tests/test_i18n.js

import {assertEqual, run, test} from './harness.js';
import {_, _n, parsePo, pickLanguage, setMessages} from '../syncbeacon@whoozy82.github.io/lib/i18n.js';

const PO = `# Comment
msgid ""
msgstr ""
"Language: de\\n"
"Language-Name: Deutsch\\n"

#: ui/infobox.js
msgid "Folders ({count})"
msgstr "Ordner ({count})"

msgid "Long"
msgstr ""
"Zeile 1\\n"
"Zeile \\"2\\""

msgid "{n} conflict"
msgid_plural "{n} conflicts"
msgstr[0] "{n} Konflikt"
msgstr[1] "{n} Konflikte"

#, fuzzy
msgid "Unsure"
msgstr "Unsicher"

msgid "Untranslated"
msgstr ""
`;

test('po headers and messages', () => {
    const {headers, messages} = parsePo(PO);
    assertEqual(headers['Language-Name'], 'Deutsch');
    assertEqual(messages.get('Folders ({count})'), ['Ordner ({count})']);
    assertEqual(messages.get('Long'), ['Zeile 1\nZeile "2"']);
    assertEqual(messages.get('{n} conflict'), ['{n} Konflikt', '{n} Konflikte']);
});

test('po skips fuzzy and untranslated entries', () => {
    const {messages} = parsePo(PO);
    assertEqual(messages.has('Unsure'), false);
    assertEqual(messages.has('Untranslated'), false);
    assertEqual(messages.size, 3);
});

test('lookup with placeholders and plurals', () => {
    setMessages(parsePo(PO).messages);
    assertEqual(_('Folders ({count})', {count: 3}), 'Ordner (3)');
    assertEqual(_('Untranslated'), 'Untranslated');
    assertEqual(_n('{n} conflict', '{n} conflicts', 1), '1 Konflikt');
    assertEqual(_n('{n} conflict', '{n} conflicts', 2), '2 Konflikte');
    assertEqual(_('Keeps {unknown}', {}), 'Keeps {unknown}');
});

test('English fallback', () => {
    setMessages(null);
    assertEqual(_('Folders ({count})', {count: 3}), 'Folders (3)');
    assertEqual(_n('{n} conflict', '{n} conflicts', 1), '1 conflict');
    assertEqual(_n('{n} conflict', '{n} conflicts', 0), '0 conflicts');
});

test('language choice', () => {
    const sys = ['de_DE.UTF-8', 'de_DE', 'de.UTF-8', 'de', 'C'];
    assertEqual(pickLanguage('system', ['de'], sys), 'de');
    assertEqual(pickLanguage('system', ['de_AT', 'de'], ['de_AT.UTF-8', 'de']), 'de_AT');
    assertEqual(pickLanguage('system', ['de'], ['fr_FR.UTF-8', 'fr', 'C']), null);
    // English before German in the system list: English.
    assertEqual(pickLanguage('system', ['de'], ['en_US.UTF-8', 'en', 'de']), null);
    assertEqual(pickLanguage('system', ['de'], ['fr', 'de']), 'de');
    assertEqual(pickLanguage('de', ['de'], ['en']), 'de');
    assertEqual(pickLanguage('en', ['de'], sys), null);
    assertEqual(pickLanguage('fr', ['de'], sys), null);
});

run();
