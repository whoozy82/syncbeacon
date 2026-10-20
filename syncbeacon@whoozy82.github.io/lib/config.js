// Syncthing config discovery and URI helpers.
// Uses only Gio/GLib so that both the extension and prefs.js can import it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// GUI URI when neither the settings nor config.xml give one: Syncthing's default.
export const DEFAULT_GUI_URI = 'http://localhost:8384';

/**
 * Directories where Syncthing keeps config.xml, in lookup order.
 *
 * @returns {string[]}
 */
export function candidateConfigDirs() {
    return [
        GLib.build_filenamev([GLib.get_user_state_dir(), 'syncthing']),
        GLib.build_filenamev([GLib.get_user_config_dir(), 'syncthing']),
    ];
}

/**
 * First candidate directory that contains a config.xml, or null.
 *
 * @returns {string|null}
 */
export function detectConfigDir() {
    return candidateConfigDirs().find(dir =>
        GLib.file_test(GLib.build_filenamev([dir, 'config.xml']), GLib.FileTest.EXISTS)) ?? null;
}

/**
 * Extract the GUI settings from config.xml text.
 * GJS has no usable XML parser and the <gui> element is simple, so targeted
 * regexes are enough.
 *
 * @param {string} xml
 * @returns {{tls: boolean, address: string, apiKey: string}|null}
 */
export function parseConfigXml(xml) {
    const gui = xml.match(/<gui\b([^>]*)>([\s\S]*?)<\/gui>/);
    if (!gui)
        return null;
    const [, attrs, body] = gui;
    const tag = name => body.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() ?? '';
    return {
        tls: /\btls="true"/.test(attrs),
        address: tag('address') || '127.0.0.1:8384',
        apiKey: tag('apikey'),
    };
}

/**
 * GUI base URI from the parsed config, e.g. "http://127.0.0.1:8384".
 *
 * @param {{tls: boolean, address: string}} gui
 * @returns {string|null} null for unix sockets
 */
export function guiUriFromConfig(gui) {
    if (gui.address.startsWith('unix'))
        return null;
    const host = gui.address
        .replace(/^0\.0\.0\.0(?=:|$)/, '127.0.0.1')
        .replace(/^\[::\](?=:|$)/, '[::1]')
        .replace(/^:/, '127.0.0.1:');
    return `${gui.tls ? 'https' : 'http'}://${host}`;
}

/**
 * Normalise a user-entered GUI URI: add a scheme, drop path, query and fragment.
 *
 * @param {string} uri
 * @returns {string|null} null if it cannot be parsed
 */
export function normalizeUri(uri) {
    let text = (uri ?? '').trim();
    if (!text)
        return null;
    if (!/^[a-z]+:\/\//i.test(text))
        text = `http://${text}`;
    try {
        const parsed = GLib.Uri.parse(text, GLib.UriFlags.NONE);
        const scheme = parsed.get_scheme().toLowerCase();
        if (scheme !== 'http' && scheme !== 'https')
            return null;
        let host = parsed.get_host();
        if (!host)
            return null;
        if (host.includes(':') && !host.startsWith('['))
            host = `[${host}]`;
        const port = parsed.get_port();
        return `${scheme}://${host}${port > 0 ? `:${port}` : ''}`;
    } catch {
        return null;
    }
}

/**
 * Host and port of a URI, with loopback names folded together.
 *
 * @param {string} uri
 * @returns {{host: string, port: number}|null}
 */
export function guiEndpoint(uri) {
    const norm = normalizeUri(uri);
    if (!norm)
        return null;
    const parsed = GLib.Uri.parse(norm, GLib.UriFlags.NONE);
    let host = parsed.get_host().toLowerCase();
    if (LOOPBACK_HOSTS.has(host))
        host = 'loopback';
    let port = parsed.get_port();
    if (port <= 0)
        port = parsed.get_scheme() === 'https' ? 443 : 80;
    return {host, port};
}

/**
 * Whether two URIs point at the same Syncthing GUI. The scheme is ignored,
 * because Syncthing serves HTTP and HTTPS on the same port.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameGui(a, b) {
    const ea = guiEndpoint(a);
    const eb = guiEndpoint(b);
    return !!ea && !!eb && ea.host === eb.host && ea.port === eb.port;
}

/**
 * Read and parse config.xml from a directory.
 *
 * @param {string} dir
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<{dir: string, tls: boolean, address: string, apiKey: string, uri: string|null, certPath: string}>}
 */
export async function loadConfig(dir, cancellable = null) {
    const file = Gio.File.new_for_path(GLib.build_filenamev([dir, 'config.xml']));
    let contents;
    try {
        [contents] = await file.load_contents_async(cancellable);
    } catch (e) {
        if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            throw e;
        throw new Error(`Cannot read ${file.get_path()}: ${e.message}`);
    }
    const gui = parseConfigXml(new TextDecoder().decode(contents));
    if (!gui)
        throw new Error(`No <gui> section in ${file.get_path()}`);
    if (!gui.apiKey)
        throw new Error(`No API key in ${file.get_path()}`);
    return {
        dir,
        ...gui,
        uri: guiUriFromConfig(gui),
        certPath: GLib.build_filenamev([dir, 'https-cert.pem']),
    };
}

/**
 * Resolve the effective connection settings from GSettings and config.xml.
 *
 * @param {Gio.Settings} settings
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<{dir: string, apiKey: string, uri: string, certPath: string}>}
 */
export async function resolveConnection(settings, cancellable = null) {
    const dir = settings.get_string('config-dir') || detectConfigDir();
    if (!dir)
        throw new Error('Syncthing config not found');
    const config = await loadConfig(dir, cancellable);
    const override = settings.get_string('gui-uri');
    const uri = override ? normalizeUri(override) : config.uri;
    if (!uri)
        throw new Error(override ? `Invalid URL: ${override}` : 'GUI address is a unix socket; set a URL');
    return {dir, apiKey: config.apiKey, uri, certPath: config.certPath};
}

/**
 * Expand a leading "~" in a Syncthing folder path.
 *
 * @param {string} path
 * @returns {string}
 */
export function expandHome(path) {
    if (path === '~')
        return GLib.get_home_dir();
    if (path.startsWith('~/'))
        return GLib.build_filenamev([GLib.get_home_dir(), path.slice(2)]);
    return path;
}
