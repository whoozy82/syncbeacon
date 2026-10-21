// Reads the translation files in locale/ and activates the chosen language.
// Used by the extension and by the settings window (a separate process).
// The source tree has <code>.po files; the release zip has <code>.json
// instead (scripts/pack.sh), which win when both exist.

import GLib from 'gi://GLib';

import {parseCatalogJson, parsePo, pickLanguage, setMessages} from './i18n.js';

const decoder = new TextDecoder();

function readCatalog(path) {
    const [, bytes] = GLib.file_get_contents(path);
    const text = decoder.decode(bytes);
    return path.endsWith('.json') ? parseCatalogJson(text) : parsePo(text);
}

function localeDir(extensionPath) {
    return GLib.build_filenamev([extensionPath, 'locale']);
}

/**
 * The translation file of each language, e.g. {de: '…/locale/de.json'}.
 *
 * @param {string} extensionPath
 * @returns {Map<string, string>}
 */
function catalogFiles(extensionPath) {
    const dir = localeDir(extensionPath);
    const files = new Map();
    let names;
    try {
        names = GLib.Dir.open(dir, 0);
    } catch {
        return files;
    }
    let file;
    while ((file = names.read_name()) !== null) {
        const m = file.match(/^(.+)\.(po|json)$/);
        if (m && (m[2] === 'json' || !files.has(m[1])))
            files.set(m[1], GLib.build_filenamev([dir, file]));
    }
    names.close();
    return files;
}

/**
 * The languages with a translation file, by their own name, e.g.
 * [{code: 'de', name: 'Deutsch'}, {code: 'en', name: 'English'}].
 *
 * @param {string} extensionPath
 * @returns {{code: string, name: string}[]}
 */
export function availableLanguages(extensionPath) {
    const languages = [];
    for (const [code, path] of catalogFiles(extensionPath)) {
        let name = code;
        try {
            name = readCatalog(path).headers['Language-Name'] || code;
        } catch (e) {
            console.error(`Syncbeacon: cannot read ${path}: ${e.message}`);
            continue;
        }
        languages.push({code, name});
    }
    return languages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The texts of a language, null if its file is missing or unreadable.
 *
 * @param {string} extensionPath
 * @param {string} code
 * @returns {Map<string, string[]>|null}
 */
function loadMessages(extensionPath, code) {
    const path = catalogFiles(extensionPath).get(code);
    try {
        if (!path)
            throw new Error('no translation file');
        return readCatalog(path).messages;
    } catch (e) {
        console.error(`Syncbeacon: cannot load the ${code} translation: ${e.message}`);
        return null;
    }
}

/**
 * Activate the language of the setting ('system' or a code), with English
 * for the texts it lacks.
 *
 * @param {string} extensionPath
 * @param {string} setting
 */
export function loadLanguage(extensionPath, setting) {
    const codes = availableLanguages(extensionPath).map(l => l.code);
    const code = pickLanguage(setting, codes, GLib.get_language_names());
    const english = loadMessages(extensionPath, 'en');
    setMessages(code === 'en' ? english : loadMessages(extensionPath, code), english);
}
