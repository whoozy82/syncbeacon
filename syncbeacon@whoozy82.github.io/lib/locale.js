// Reads the translation files in locale/ and activates the chosen language.
// Used by the extension and by the settings window (a separate process).
// The source tree has <code>.po files; the release zip has <code>.json
// instead (scripts/pack.sh), which win when both exist.
// All file IO is async: the extension runs inside gnome-shell.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseCatalogJson, parsePo, pickLanguage, setMessages} from './i18n.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async');

const decoder = new TextDecoder();
// Directory entries per next_files_async() call.
const BATCH = 32;

function isCancelled(e) {
    return e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) ?? false;
}

async function readCatalog(path, cancellable) {
    const [bytes] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
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
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<Map<string, string>>}
 */
async function catalogFiles(extensionPath, cancellable = null) {
    const dir = localeDir(extensionPath);
    const files = new Map();
    let names;
    try {
        names = await Gio.File.new_for_path(dir).enumerate_children_async('standard::name',
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
    } catch (e) {
        if (isCancelled(e))
            throw e;
        return files;
    }
    try {
        let infos;
        while ((infos = await names.next_files_async(BATCH, GLib.PRIORITY_DEFAULT, cancellable)).length) {
            for (const info of infos) {
                const file = info.get_name();
                const m = file.match(/^(.+)\.(po|json)$/);
                if (m && (m[2] === 'json' || !files.has(m[1])))
                    files.set(m[1], GLib.build_filenamev([dir, file]));
            }
        }
    } finally {
        names.close_async(GLib.PRIORITY_DEFAULT, null).catch(() => {});
    }
    return files;
}

/**
 * The languages with a translation file, by their own name, e.g.
 * [{code: 'de', name: 'Deutsch'}, {code: 'en', name: 'English'}].
 *
 * @param {string} extensionPath
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<{code: string, name: string}[]>}
 */
export async function availableLanguages(extensionPath, cancellable = null) {
    const languages = [];
    for (const [code, path] of await catalogFiles(extensionPath, cancellable)) {
        let name = code;
        try {
            name = (await readCatalog(path, cancellable)).headers['Language-Name'] || code;
        } catch (e) {
            if (isCancelled(e))
                throw e;
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
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<Map<string, string[]>|null>}
 */
async function loadMessages(extensionPath, code, cancellable = null) {
    const path = (await catalogFiles(extensionPath, cancellable)).get(code);
    try {
        if (!path)
            throw new Error('no translation file');
        return (await readCatalog(path, cancellable)).messages;
    } catch (e) {
        if (isCancelled(e))
            throw e;
        console.error(`Syncbeacon: cannot load the ${code} translation: ${e.message}`);
        return null;
    }
}

/**
 * Activate the language of the setting ('system' or a code), with English
 * for the texts it lacks. When the cancellable is cancelled, this rejects
 * with Gio.IOErrorEnum.CANCELLED and the active texts stay as they are.
 *
 * @param {string} extensionPath
 * @param {string} setting
 * @param {Gio.Cancellable} [cancellable]
 */
export async function loadLanguage(extensionPath, setting, cancellable = null) {
    const codes = (await availableLanguages(extensionPath, cancellable)).map(l => l.code);
    const code = pickLanguage(setting, codes, GLib.get_language_names());
    const english = await loadMessages(extensionPath, 'en', cancellable);
    const table = code === 'en' ? english : await loadMessages(extensionPath, code, cancellable);
    setMessages(table, english);
}
