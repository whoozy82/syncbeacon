// Compare the texts marked for translation in the code (_('…'), _n('…', '…'),
// N_('…')) with the translation files in locale/.
//
// Run: gjs -m scripts/i18n-check.js [--update]
//   lists per language the texts that are missing and the ones no longer used;
//   --update appends the missing ones as empty entries to each .po file.
// Exits with 1 if a text is missing or untranslated, so it can run in checks.

import GLib from 'gi://GLib';
import System from 'system';

import {parsePo} from '../syncbeacon@whoozy82.github.io/lib/i18n.js';

const ROOT = GLib.build_filenamev([GLib.path_get_dirname(System.programPath), '..']);
const EXT = GLib.build_filenamev([ROOT, 'syncbeacon@whoozy82.github.io']);
const LOCALE = GLib.build_filenamev([EXT, 'locale']);
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const STR = String.raw`'((?:[^'\\]|\\.)*)'`;
const PATTERNS = [
    new RegExp(String.raw`\b_n\(\s*${STR}\s*,\s*${STR}`, 'g'),
    new RegExp(String.raw`\b[N]?_\(\s*${STR}`, 'g'),
];

function read(path) {
    return decoder.decode(GLib.file_get_contents(path)[1]);
}

function jsUnescape(s) {
    return s.replace(/\\(.)/g, (_m, c) => ({n: '\n', t: '\t'})[c] ?? c);
}

function poQuote(s) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function sourceFiles(dir, prefix = '') {
    const files = [];
    const d = GLib.Dir.open(dir, 0);
    let name;
    while ((name = d.read_name()) !== null) {
        const path = GLib.build_filenamev([dir, name]);
        if (GLib.file_test(path, GLib.FileTest.IS_DIR))
            files.push(...sourceFiles(path, `${prefix}${name}/`));
        else if (name.endsWith('.js'))
            files.push([`${prefix}${name}`, path]);
    }
    d.close();
    return files.sort();
}

// msgid -> {plural, refs}
const used = new Map();
for (const [rel, path] of sourceFiles(EXT)) {
    const text = read(path);
    for (const pattern of PATTERNS) {
        for (const m of text.matchAll(pattern)) {
            const msgid = jsUnescape(m[1]);
            const entry = used.get(msgid) ?? {plural: null, refs: new Set()};
            if (m[2] !== undefined)
                entry.plural = jsUnescape(m[2]);
            entry.refs.add(rel);
            used.set(msgid, entry);
        }
    }
}

const update = ARGV.includes('--update');
let incomplete = false;
const poFiles = [];
const dir = GLib.Dir.open(LOCALE, 0);
let file;
while ((file = dir.read_name()) !== null) {
    if (file.endsWith('.po'))
        poFiles.push(file);
}
dir.close();

print(`${used.size} texts in the code`);
for (const po of poFiles.sort()) {
    const path = GLib.build_filenamev([LOCALE, po]);
    const text = read(path);
    const {messages} = parsePo(text);
    // All msgids in the file, translated or not.
    const present = new Set([...text.matchAll(/^msgid\s+"((?:[^"\\]|\\.)*)"/gm)]
        .map(m => jsUnescape(m[1])).filter(id => id));
    const missing = [...used.keys()].filter(id => !present.has(id));
    const untranslated = [...used.keys()].filter(id => present.has(id) && !messages.has(id));
    const unused = [...present].filter(id => !used.has(id));

    print(`\n${po}: ${missing.length} missing, ${untranslated.length} untranslated, ${unused.length} unused`);
    for (const id of missing)
        print(`  missing:      ${JSON.stringify(id)}`);
    for (const id of untranslated)
        print(`  untranslated: ${JSON.stringify(id)}`);
    for (const id of unused)
        print(`  unused:       ${JSON.stringify(id)}`);
    if (missing.length || untranslated.length)
        incomplete = true;

    if (update && missing.length) {
        const entries = missing.map(id => {
            const {plural, refs} = used.get(id);
            const lines = [`#: ${[...refs].join(' ')}`, `msgid ${poQuote(id)}`];
            if (plural !== null)
                lines.push(`msgid_plural ${poQuote(plural)}`, 'msgstr[0] ""', 'msgstr[1] ""');
            else
                lines.push('msgstr ""');
            return lines.join('\n');
        });
        const sep = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
        GLib.file_set_contents(path, encoder.encode(`${text}${sep}${entries.join('\n\n')}\n`));
        print(`  ${missing.length} added to ${po}`);
    }
}

System.exit(incomplete ? 1 : 0);
