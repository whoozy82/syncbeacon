// Reads the translation files in locale/ and activates the chosen language.
// Used by the extension and by the settings window (a separate process).

import GLib from 'gi://GLib';

import {parsePo, pickLanguage, setMessages} from './i18n.js';

const decoder = new TextDecoder();

function readPo(path) {
    const [, bytes] = GLib.file_get_contents(path);
    return parsePo(decoder.decode(bytes));
}

function localeDir(extensionPath) {
    return GLib.build_filenamev([extensionPath, 'locale']);
}

/**
 * The languages with a translation file, by their own name, e.g.
 * [{code: 'de', name: 'Deutsch'}]. English is not listed.
 *
 * @param {string} extensionPath
 * @returns {{code: string, name: string}[]}
 */
export function availableLanguages(extensionPath) {
    const dir = localeDir(extensionPath);
    let names;
    try {
        names = GLib.Dir.open(dir, 0);
    } catch {
        return [];
    }
    const languages = [];
    let file;
    while ((file = names.read_name()) !== null) {
        if (!file.endsWith('.po'))
            continue;
        const code = file.slice(0, -3);
        let name = code;
        try {
            name = readPo(GLib.build_filenamev([dir, file])).headers['Language-Name'] || code;
        } catch (e) {
            console.error(`Syncbeacon: cannot read ${file}: ${e.message}`);
            continue;
        }
        languages.push({code, name});
    }
    names.close();
    return languages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Activate the language of the setting ('system', 'en' or a code); English
 * if its file is missing or unreadable.
 *
 * @param {string} extensionPath
 * @param {string} setting
 */
export function loadLanguage(extensionPath, setting) {
    const codes = availableLanguages(extensionPath).map(l => l.code);
    const code = pickLanguage(setting, codes, GLib.get_language_names());
    if (!code) {
        setMessages(null);
        return;
    }
    try {
        setMessages(readPo(GLib.build_filenamev([localeDir(extensionPath), `${code}.po`])).messages);
    } catch (e) {
        console.error(`Syncbeacon: cannot load the ${code} translation: ${e.message}`);
        setMessages(null);
    }
}
