// Syncbeacon settings window.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {isCancelled, testConnection} from './lib/client.js';
import {DEFAULT_GUI_URI, detectConfigDir, loadConfig, normalizeUri, resolveConnection} from './lib/config.js';
import {SyncthingUnit} from './lib/systemd.js';
import {commandArgv, epiphanyAvailable, findAppByCommand, findWebApp, windowCommand} from './lib/webapp.js';

Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

const POSITIONS = [
    ['far-left', 'Far left'],
    ['left', 'Left'],
    ['middle', 'Middle'],
    ['right', 'Right'],
    ['far-right', 'Far right'],
];

const WINDOW_MODES = [
    ['webapp', 'Epiphany Web App'],
    ['command', 'Command'],
    ['uri', 'URL+Port'],
];

const ENABLED_LABELS = {
    'enabled': 'Yes',
    'enabled-runtime': 'Yes (until reboot)',
    'static': 'Static (started by another unit)',
    'linked': 'Linked',
    'disabled': 'No',
    'masked': 'Masked',
};

function suffixButton(params) {
    return new Gtk.Button({valign: Gtk.Align.CENTER, ...params});
}

// connectObject() exists only inside gnome-shell, not in the prefs process.
function watch(window, settings, key, callback) {
    const id = settings.connect(`changed::${key}`, callback);
    window.connect('close-request', () => {
        settings.disconnect(id);
        return false;
    });
}

function toast(window, title) {
    window.add_toast(new Adw.Toast({title, timeout: 5}));
}

async function effectiveUri(settings) {
    try {
        return (await resolveConnection(settings)).uri;
    } catch {
        return null; // Shown by the test row.
    }
}

function dbusErrorMessage(e) {
    const remote = Gio.DBusError.get_remote_error(e);
    if (remote === 'org.freedesktop.DBus.Error.AccessDenied' ||
        remote === 'org.freedesktop.DBus.Error.InteractiveAuthorizationRequired')
        return 'Not authorised';
    if (remote)
        Gio.DBusError.strip_remote_error(e);
    return e.message;
}

export default class SyncbeaconPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(640, 760);

        const page = new Adw.PreferencesPage({title: 'Settings', icon_name: 'emblem-system-symbolic'});
        page.add(this._serviceGroup(window));
        page.add(this._connectionGroup(window, settings));
        page.add(this._positionGroup(window, settings));
        page.add(this._hotkeyGroup(window, settings));
        page.add(this._aboutGroup());
        window.add(page);
    }

    _aboutGroup() {
        const group = new Adw.PreferencesGroup({title: 'About'});
        const row = new Adw.ActionRow({title: 'Version', subtitle: this.metadata['version-name'] ?? '–'});
        row.add_css_class('property');
        group.add(row);
        return group;
    }

    _serviceGroup(window) {
        const group = new Adw.PreferencesGroup({
            title: 'Syncthing service',
            description: 'The systemd unit that runs Syncthing',
        });
        const unitRow = new Adw.ActionRow({title: 'Unit', subtitle: 'Detecting…'});
        const enabledRow = new Adw.ActionRow({title: 'Enabled at boot', subtitle: '–'});
        const stateRow = new Adw.ActionRow({title: 'Status', subtitle: '–'});
        const startButton = suffixButton({label: 'Start', sensitive: false});
        const stopButton = suffixButton({label: 'Stop', sensitive: false});
        stateRow.add_suffix(startButton);
        stateRow.add_suffix(stopButton);
        for (const row of [unitRow, enabledRow, stateRow]) {
            row.add_css_class('property');
            group.add(row);
        }

        let busy = false;
        const unit = new SyncthingUnit(() => update());
        const update = () => {
            if (!unit.found) {
                unitRow.subtitle = 'No Syncthing unit found';
                startButton.sensitive = stopButton.sensitive = false;
                return;
            }
            unitRow.subtitle = `${unit.name} (${unit.scope === 'system' ? 'system' : 'user'} unit)`;
            enabledRow.subtitle = ENABLED_LABELS[unit.unitFileState] ?? unit.unitFileState ?? '–';
            stateRow.subtitle = unit.activeState ?? '–';
            startButton.sensitive = !busy && unit.active === false;
            stopButton.sensitive = !busy && unit.active === true;
        };
        const run = async action => {
            busy = true;
            update();
            try {
                await action();
            } catch (e) {
                if (!isCancelled(e))
                    toast(window, dbusErrorMessage(e));
            } finally {
                busy = false;
                update();
            }
        };
        startButton.connect('clicked', () => run(() => unit.start()));
        stopButton.connect('clicked', () => run(() => unit.stop()));

        unit.init().catch(e => {
            unitRow.subtitle = `Detection failed: ${e.message}`;
        });
        window.connect('close-request', () => {
            unit.destroy();
            return false;
        });
        return group;
    }

    _connectionGroup(window, settings) {
        const group = new Adw.PreferencesGroup({title: 'Connection'});

        // Config directory
        const dirRow = new Adw.EntryRow({title: 'Config directory', show_apply_button: true});
        const showDir = () => {
            dirRow.text = settings.get_string('config-dir') || detectConfigDir() || '';
        };
        dirRow.connect('apply', () => settings.set_string('config-dir', dirRow.text.trim()));
        const browse = suffixButton({icon_name: 'folder-open-symbolic', tooltip_text: 'Choose…',
            css_classes: ['flat']});
        browse.connect('clicked', async () => {
            const dialog = new Gtk.FileDialog({title: 'Syncthing config directory', modal: true});
            try {
                const folder = await dialog.select_folder(window, null);
                settings.set_string('config-dir', folder.get_path());
            } catch (e) {
                if (!e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    toast(window, e.message);
            }
        });
        const detectDir = suffixButton({icon_name: 'edit-undo-symbolic', tooltip_text: 'Auto-detect',
            css_classes: ['flat']});
        detectDir.connect('clicked', () => settings.set_string('config-dir', ''));
        dirRow.add_suffix(browse);
        dirRow.add_suffix(detectDir);
        group.add(dirRow);

        // Syncthing window: how it is opened. The row below shows the web app,
        // the command or the GUI URI, depending on the choice.
        const modeRow = new Adw.ComboRow({title: 'Syncthing window',
            model: Gtk.StringList.new(WINDOW_MODES.map(([, label]) => label))});
        modeRow.connect('notify::selected', () => {
            const value = WINDOW_MODES[modeRow.selected]?.[0];
            if (value && value !== settings.get_string('window-mode'))
                settings.set_string('window-mode', value);
        });
        group.add(modeRow);

        // Web app: the one found for the GUI URI, read-only.
        const webAppRow = new Adw.ActionRow({title: 'Web app identifier', subtitle: '–'});
        webAppRow.add_css_class('property');
        group.add(webAppRow);

        // Command
        const commandRow = new Adw.EntryRow({title: 'Command', show_apply_button: true});
        commandRow.connect('apply', () => {
            const text = commandRow.text.trim();
            if (text && !commandArgv(text)) {
                toast(window, `Invalid command: ${text}`);
                return;
            }
            settings.set_string('window-command', text);
        });
        group.add(commandRow);

        // GUI URI
        // Without a stored URI, the address from config.xml is shown; applying
        // it unchanged keeps following config.xml.
        const uriRow = new Adw.EntryRow({title: 'URL+Port', show_apply_button: true});
        let configUri = null;
        const showUri = async () => {
            const override = settings.get_string('gui-uri');
            if (override) {
                uriRow.text = override;
                return;
            }
            const dir = settings.get_string('config-dir') || detectConfigDir();
            let uri = null;
            try {
                uri = dir ? (await loadConfig(dir)).uri : null;
            } catch {
                // Not readable: the fallback below.
            }
            configUri = uri ?? DEFAULT_GUI_URI;
            if (!settings.get_string('gui-uri'))
                uriRow.text = configUri;
        };
        uriRow.connect('apply', () => {
            const text = uriRow.text.trim();
            const uri = text ? normalizeUri(text) : '';
            if (uri === null) {
                toast(window, `Invalid URI: ${text}`);
                return;
            }
            const following = !settings.get_string('gui-uri') && configUri && uri === normalizeUri(configUri);
            settings.set_string('gui-uri', following ? '' : uri);
        });
        const detectUri = suffixButton({icon_name: 'edit-undo-symbolic', tooltip_text: 'Use the address from config.xml',
            css_classes: ['flat']});
        detectUri.connect('clicked', () => settings.set_string('gui-uri', ''));
        uriRow.add_suffix(detectUri);
        group.add(uriRow);

        // Test
        const testRow = new Adw.ActionRow({title: 'Test connection', subtitle: ''});
        const testButton = suffixButton({label: 'Test'});
        testButton.connect('clicked', async () => {
            testButton.sensitive = false;
            testRow.subtitle = 'Connecting…';
            try {
                const conn = await resolveConnection(settings);
                const version = await testConnection(conn);
                testRow.subtitle = `Connected to Syncthing ${version} at ${conn.uri}`;
            } catch (e) {
                testRow.subtitle = `Failed: ${e.message}`;
            } finally {
                testButton.sensitive = true;
            }
        });
        testRow.add_suffix(testButton);
        group.add(testRow);

        const showWindow = async () => {
            const mode = settings.get_string('window-mode');
            modeRow.selected = Math.max(0, WINDOW_MODES.findIndex(([v]) => v === mode));
            webAppRow.visible = mode === 'webapp';
            commandRow.visible = mode === 'command';
            uriRow.visible = mode === 'uri';
            if (mode === 'uri') {
                modeRow.subtitle = 'Opens the URL in the default browser';
                return;
            }
            if (mode === 'webapp') {
                const uri = await effectiveUri(settings);
                const webApp = uri ? findWebApp(uri) : null;
                webAppRow.subtitle = webApp?.id ?? '–';
                if (webApp) {
                    modeRow.subtitle = `Opens or raises ${webApp.name}`;
                } else if (!epiphanyAvailable()) {
                    modeRow.subtitle = 'GNOME Web is not installed. Until it is, the default browser is used.';
                } else {
                    modeRow.subtitle = 'No GNOME Web app for the URL yet. It is created as soon as ' +
                        'the extension knows the URL; until then the default browser is used.';
                }
                return;
            }
            const command = windowCommand(settings);
            commandRow.text = command ?? '';
            const app = command ? findAppByCommand(command) : null;
            if (!command) {
                modeRow.subtitle = 'Enter a command. Until then the default browser is used.';
            } else if (app) {
                modeRow.subtitle = `Opens or raises ${app.get_display_name()}`;
            } else {
                modeRow.subtitle = 'Runs the command in a shell';
            }
        };

        const refresh = () => {
            showDir();
            showUri();
            showWindow();
            testRow.subtitle = '';
        };
        for (const key of ['config-dir', 'gui-uri', 'window-mode', 'window-command'])
            watch(window, settings, key, refresh);
        // A web app created or removed meanwhile, e.g. by the extension.
        const appMonitor = Gio.AppInfoMonitor.get();
        const appMonitorId = appMonitor.connect('changed', () => showWindow());
        window.connect('close-request', () => {
            appMonitor.disconnect(appMonitorId);
            return false;
        });
        refresh();
        return group;
    }

    _positionGroup(window, settings) {
        const group = new Adw.PreferencesGroup({title: 'Top bar'});
        const model = Gtk.StringList.new(POSITIONS.map(([, label]) => label));
        const row = new Adw.ComboRow({title: 'Position', model});
        const sync = () => {
            row.selected = Math.max(0, POSITIONS.findIndex(([v]) => v === settings.get_string('position')));
        };
        row.connect('notify::selected', () => {
            const value = POSITIONS[row.selected]?.[0];
            if (value && value !== settings.get_string('position'))
                settings.set_string('position', value);
        });
        watch(window, settings, 'position', sync);
        sync();
        group.add(row);
        return group;
    }

    _hotkeyGroup(window, settings) {
        const group = new Adw.PreferencesGroup({title: 'Hotkey'});
        const row = new Adw.ActionRow({title: 'Open or hide the Syncthing window'});
        const label = new Gtk.ShortcutLabel({disabled_text: 'Disabled', valign: Gtk.Align.CENTER});
        const setButton = suffixButton({label: 'Set…'});
        const clearButton = suffixButton({icon_name: 'edit-clear-symbolic', tooltip_text: 'Disable',
            css_classes: ['flat']});
        const sync = () => {
            const accel = settings.get_strv('toggle-window')[0] ?? '';
            label.accelerator = accel;
            clearButton.sensitive = !!accel;
        };
        setButton.connect('clicked', () => this._recordShortcut(window, settings));
        clearButton.connect('clicked', () => settings.set_strv('toggle-window', []));
        row.add_suffix(label);
        row.add_suffix(setButton);
        row.add_suffix(clearButton);
        watch(window, settings, 'toggle-window', sync);
        sync();
        group.add(row);
        return group;
    }

    _recordShortcut(window, settings) {
        const dialog = new Adw.Dialog({title: 'Set shortcut', content_width: 400});
        const view = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        view.content = new Adw.StatusPage({
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            title: 'Press a key combination',
            description: 'Use at least one modifier, e.g. Super or Ctrl.\nEsc cancels, Backspace disables the shortcut.',
        });
        dialog.child = view;

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
                settings.set_strv('toggle-window', []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (mask === 0 || !Gtk.accelerator_valid(keyval, mask))
                return Gdk.EVENT_STOP;
            settings.set_strv('toggle-window', [Gtk.accelerator_name(Gdk.keyval_to_lower(keyval), mask)]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(keys);
        dialog.present(window);
    }
}
