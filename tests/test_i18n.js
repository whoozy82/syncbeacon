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
msgid "infobox.folders"
msgstr "Ordner ({count})"

msgid "long"
msgstr ""
"Zeile 1\\n"
"Zeile \\"2\\""

msgid "state.folder.conflicts"
msgid_plural "state.folder.conflicts"
msgstr[0] "{n} Konflikt"
msgstr[1] "{n} Konflikte"

#, fuzzy
msgid "unsure"
msgstr "Unsicher"

msgid "untranslated"
msgstr ""
`;

// English, with a key the German file lacks.
const EN = `msgid "infobox.folders"
msgstr "Folders ({count})"

msgid "untranslated"
msgstr "Only in English"

msgid "state.folder.conflicts"
msgid_plural "state.folder.conflicts"
msgstr[0] "{n} conflict"
msgstr[1] "{n} conflicts"
`;

test('po headers and messages', () => {
    const {headers, messages} = parsePo(PO);
    assertEqual(headers['Language-Name'], 'Deutsch');
    assertEqual(messages.get('infobox.folders'), ['Ordner ({count})']);
    assertEqual(messages.get('long'), ['Zeile 1\nZeile "2"']);
    assertEqual(messages.get('state.folder.conflicts'), ['{n} Konflikt', '{n} Konflikte']);
});

test('po skips fuzzy and untranslated entries', () => {
    const {messages} = parsePo(PO);
    assertEqual(messages.has('unsure'), false);
    assertEqual(messages.has('untranslated'), false);
    assertEqual(messages.size, 3);
});

test('lookup with placeholders and plurals', () => {
    setMessages(parsePo(PO).messages, parsePo(EN).messages);
    assertEqual(_('infobox.folders', {count: 3}), 'Ordner (3)');
    assertEqual(_n('state.folder.conflicts', 1), '1 Konflikt');
    assertEqual(_n('state.folder.conflicts', 2), '2 Konflikte');
});

test('fallback to English, then to the key', () => {
    setMessages(parsePo(PO).messages, parsePo(EN).messages);
    assertEqual(_('untranslated'), 'Only in English');
    assertEqual(_('missing.key'), 'missing.key');
    assertEqual(_n('missing.plural', 2), 'missing.plural');
    assertEqual(_('missing.key {unknown}', {}), 'missing.key {unknown}');
});

test('English as the chosen language', () => {
    const en = parsePo(EN).messages;
    setMessages(en, en);
    assertEqual(_('infobox.folders', {count: 3}), 'Folders (3)');
    assertEqual(_n('state.folder.conflicts', 1), '1 conflict');
    assertEqual(_n('state.folder.conflicts', 0), '0 conflicts');
});

test('no texts loaded: the keys', () => {
    setMessages(null);
    assertEqual(_('infobox.folders', {count: 3}), 'infobox.folders');
});

test('language choice', () => {
    const sys = ['de_DE.UTF-8', 'de_DE', 'de.UTF-8', 'de', 'C'];
    const both = ['de', 'en'];
    assertEqual(pickLanguage('system', both, sys), 'de');
    assertEqual(pickLanguage('system', ['de_AT', 'de', 'en'], ['de_AT.UTF-8', 'de']), 'de_AT');
    assertEqual(pickLanguage('system', both, ['fr_FR.UTF-8', 'fr', 'C']), 'en');
    // English before German in the system list: English.
    assertEqual(pickLanguage('system', both, ['en_US.UTF-8', 'en', 'de']), 'en');
    // Also when en.po is missing.
    assertEqual(pickLanguage('system', ['de'], ['en_US.UTF-8', 'en', 'de']), 'en');
    assertEqual(pickLanguage('system', both, ['fr', 'de']), 'de');
    assertEqual(pickLanguage('de', both, ['en']), 'de');
    assertEqual(pickLanguage('en', both, sys), 'en');
    assertEqual(pickLanguage('fr', both, sys), 'en');
});

run();
