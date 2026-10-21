// The command that opens the Syncthing window, and the installed app behind it.
// By default that is the GNOME Web ("Epiphany") web app showing the Syncthing GUI.
// Uses only Gio/GLib so that both the extension and prefs.js can import it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {sameGui} from './config.js';

Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_async');
Gio._promisify(Gio.OutputStream.prototype, 'close_async');
Gio._promisify(Gio.File.prototype, 'copy_async');
Gio._promisify(Gio.File.prototype, 'make_symbolic_link_async');

const WEBAPP_PREFIX = 'org.gnome.Epiphany.WebApp_';

/**
 * URL a web app opens, taken from its Exec line.
 *
 * @param {Gio.AppInfo} app
 * @returns {string|null}
 */
export function webAppUrl(app) {
    return app.get_commandline()?.match(/(https?:\/\/[^\s"']+)/)?.[1] ?? null;
}

/**
 * Split a command line into its arguments, without desktop-file field codes
 * such as %U. Quoting differences therefore do not matter when comparing.
 *
 * @param {string} command
 * @returns {string[]|null} null if the command is empty or cannot be parsed
 */
export function commandArgv(command) {
    if (!command?.trim())
        return null;
    try {
        const [, argv] = GLib.shell_parse_argv(command);
        return argv.filter(arg => !/^%[a-zA-Z]$/.test(arg));
    } catch {
        return null;
    }
}

/**
 * All installed GNOME Web web apps.
 *
 * @returns {{id: string, name: string, url: string|null, command: string|null}[]}
 */
export function listWebApps() {
    return Gio.AppInfo.get_all()
        .filter(app => app.get_id()?.startsWith(WEBAPP_PREFIX))
        .map(app => ({
            id: app.get_id(),
            name: app.get_display_name(),
            url: webAppUrl(app),
            command: app.get_commandline(),
        }));
}

/**
 * The web app for the Syncthing GUI: the one whose URL matches the GUI URI.
 *
 * @param {string} uri - effective GUI URI
 * @returns {{id: string, name: string, url: string|null, command: string|null}|null}
 */
export function findWebApp(uri) {
    return listWebApps().find(a => a.url && sameGui(a.url, uri)) ?? null;
}

/**
 * The command from the settings that opens the Syncthing window in command mode.
 *
 * @param {Gio.Settings} settings
 * @returns {string|null}
 */
export function windowCommand(settings) {
    return settings.get_string('window-command').trim() || null;
}

/**
 * Whether a command is a GNOME Web app's Exec line, as earlier versions
 * stored it in window-command.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function isWebAppCommand(command) {
    const argv = commandArgv(command);
    return !!argv && GLib.path_get_basename(argv[0]) === 'epiphany' &&
        argv.includes('--application-mode');
}

/**
 * Whether GNOME Web is installed (natively; a Flatpak install keeps its web
 * apps elsewhere and is not supported).
 *
 * @returns {boolean}
 */
export function epiphanyAvailable() {
    return !!GLib.find_program_in_path('epiphany');
}

// The Syncthing app icon from the hicolor theme, largest first.
function syncthingIconFile() {
    const dirs = [GLib.get_user_data_dir(), ...GLib.get_system_data_dirs()];
    const names = ['scalable/apps/syncthing.svg', '512x512/apps/syncthing.png',
        '256x256/apps/syncthing.png', '128x128/apps/syncthing.png'];
    for (const name of names) {
        for (const dir of dirs) {
            const path = GLib.build_filenamev([dir, 'icons', 'hicolor', name]);
            if (GLib.file_test(path, GLib.FileTest.EXISTS))
                return path;
        }
    }
    return null;
}

/**
 * Create a GNOME Web app for the Syncthing GUI. The files are laid out the way
 * GNOME Web's "Install Site as Web App…" leaves them (through the
 * DynamicLauncher portal), so GNOME Web lists and manages it like its own:
 * - profile directory ~/.local/share/<id>/ with an empty .app marker
 * - desktop file in ~/.local/share/xdg-desktop-portal/applications/, linked
 *   from ~/.local/share/applications/
 * - icon in ~/.local/share/xdg-desktop-portal/icons/192x192/
 * The ID is the SHA-1 of the app name, as in GNOME Web.
 *
 * @param {string} uri - GUI URI the web app opens
 * @param {string|null} fallbackIcon - icon file if Syncthing ships none
 * @returns {Promise<string>} the web app's command
 */
export async function createWebApp(uri, fallbackIcon = null) {
    const dataDir = GLib.get_user_data_dir();
    const portalDir = GLib.build_filenamev([dataDir, 'xdg-desktop-portal']);
    const desktopName = id => `${id}.desktop`;
    const taken = id => [
        [dataDir, id],
        [dataDir, 'applications', desktopName(id)],
        [portalDir, 'applications', desktopName(id)],
    ].some(parts => GLib.file_test(GLib.build_filenamev(parts), GLib.FileTest.EXISTS));

    const name = ['Syncthing', 'Syncthing GUI', 'Syncthing (Syncbeacon)'].find(n =>
        !taken(WEBAPP_PREFIX + GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, n, -1)));
    if (!name)
        throw new Error('All web app names for Syncthing are taken');
    const id = WEBAPP_PREFIX + GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, name, -1);

    const mkdir = (path, mode = 0o700) => {
        if (GLib.mkdir_with_parents(path, mode) !== 0)
            throw new Error(`Cannot create ${path}`);
    };
    const write = (path, text) => Gio.File.new_for_path(path).replace_contents_bytes_async(
        new GLib.Bytes(new TextEncoder().encode(text)), null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    // An empty file: write() cannot do this, empty bytes never complete.
    const touch = async path => {
        const stream = await Gio.File.new_for_path(path).replace_async(null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, GLib.PRIORITY_DEFAULT, null);
        await stream.close_async(GLib.PRIORITY_DEFAULT, null);
    };
    const profile = GLib.build_filenamev([dataDir, id]);
    mkdir(profile, 0o750);
    await touch(GLib.build_filenamev([profile, '.app']));

    let icon = 'syncthing';
    const iconSource = syncthingIconFile() ?? fallbackIcon;
    if (iconSource) {
        const iconDir = GLib.build_filenamev([portalDir, 'icons', '192x192']);
        mkdir(iconDir);
        icon = GLib.build_filenamev([iconDir, `${id}.${iconSource.split('.').pop()}`]);
        await Gio.File.new_for_path(iconSource).copy_async(Gio.File.new_for_path(icon),
            Gio.FileCopyFlags.OVERWRITE, GLib.PRIORITY_DEFAULT, null, null);
    }

    const command = `epiphany --application-mode "--profile=${profile}" ${uri}`;
    const desktop = [
        '[Desktop Entry]',
        `Exec=${command}`,
        'StartupNotify=true',
        'Terminal=false',
        'Type=Application',
        'Categories=GNOME;GTK;',
        `StartupWMClass=${id}`,
        'X-Purism-FormFactor=Workstation;Mobile;',
        `Name=${name}`,
        `Icon=${icon}`,
        '',
    ].join('\n');
    const appsDir = GLib.build_filenamev([portalDir, 'applications']);
    mkdir(appsDir);
    await write(GLib.build_filenamev([appsDir, desktopName(id)]), desktop);

    const linkDir = GLib.build_filenamev([dataDir, 'applications']);
    mkdir(linkDir);
    await Gio.File.new_for_path(GLib.build_filenamev([linkDir, desktopName(id)]))
        .make_symbolic_link_async(`../xdg-desktop-portal/applications/${desktopName(id)}`,
            GLib.PRIORITY_DEFAULT, null);
    return command;
}

/**
 * The installed app whose Exec line runs this command, if any.
 *
 * @param {string} command
 * @returns {Gio.AppInfo|null}
 */
export function findAppByCommand(command) {
    const key = commandArgv(command)?.join('\0');
    if (!key)
        return null;
    return Gio.AppInfo.get_all()
        .find(app => commandArgv(app.get_commandline())?.join('\0') === key) ?? null;
}
