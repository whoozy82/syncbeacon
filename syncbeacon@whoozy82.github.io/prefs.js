// Syncbeacon settings window.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {isCancelled, testConnection} from './lib/client.js';
import {DEFAULT_GUI_URI, detectConfigDir, loadConfig, normalizeUri, resolveConnection} from './lib/config.js';
import {_, N_} from './lib/i18n.js';
import {availableLanguages, loadLanguage} from './lib/locale.js';
import {SyncthingUnit} from './lib/systemd.js';
import {commandArgv, epiphanyAvailable, findAppByCommand, findWebApp, windowCommand} from './lib/webapp.js';

Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

const POSITIONS = [
    ['far-left', N_('Far left')],
    ['left', N_('Left')],
    ['middle', N_('Middle')],
    ['right', N_('Right')],
    ['far-right', N_('Far right')],
];

const ORIENTATIONS = [
    ['auto', N_('Auto')],
    ['vertical', N_('Vertical')],
    ['horizontal', N_('Horizontal')],
];

const WINDOW_MODES = [
    ['webapp', N_('Epiphany Web App')],
    ['command', N_('Command')],
    ['uri', N_('URL+Port')],
];

const ENABLED_LABELS = {
    'enabled': N_('Yes'),
    'enabled-runtime': N_('Yes (until reboot)'),
    'static': N_('Static (started by another unit)'),
    'linked': N_('Linked'),
    'disabled': N_('No'),
    'masked': N_('Masked'),
};

function suffixButton(params) {
    return new Gtk.Button({valign: Gtk.Align.CENTER, ...params});
}

// Cleanups of the current page, run when the window closes or the page is
// built again for another language.
let disposers = [];

function onDispose(callback) {
    disposers.push(callback);
}

function dispose() {
    for (const callback of disposers)
        callback();
    disposers = [];
}

// connectObject() exists only inside gnome-shell, not in the prefs process.
function watch(settings, key, callback) {
    const id = settings.connect(`changed::${key}`, callback);
    onDispose(() => settings.disconnect(id));
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
        return _('Not authorised');
    if (remote)
        Gio.DBusError.strip_remote_error(e);
    return e.message;
}

export default class SyncbeaconPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(640, 760);

        // Another language: the page is built again with the new texts.
        let page = null;
        const build = () => {
            dispose();
            if (page)
                window.remove(page);
            loadLanguage(this.path, settings.get_string('language'));
            page = this._page(window, settings);
            window.add(page);
        };
        const languageId = settings.connect('changed::language', build);
        window.connect('close-request', () => {
            settings.disconnect(languageId);
            dispose();
            return false;
        });
        build();
    }

    _page(window, settings) {
        const page = new Adw.PreferencesPage({title: _('Settings'), icon_name: 'emblem-system-symbolic'});
        page.add(this._languageGroup(settings));
        page.add(this._serviceGroup(window));
        page.add(this._connectionGroup(window, settings));
        page.add(this._positionGroup(settings));
        page.add(this._layoutGroup(settings));
        page.add(this._hotkeyGroup(window, settings));
        page.add(this._aboutGroup());
        return page;
    }

    // System, English, then the languages in locale/ by their own names.
    _languageGroup(settings) {
        const group = new Adw.PreferencesGroup({title: _('General')});
        const languages = [['system', _('System')], ['en', 'English'],
            ...availableLanguages(this.path).map(({code, name}) => [code, name])];
        const row = new Adw.ComboRow({title: _('Language'),
            model: Gtk.StringList.new(languages.map(([, label]) => label))});
        const current = settings.get_string('language');
        // A stored language without its file stays selected as its code.
        if (!languages.some(([code]) => code === current)) {
            languages.push([current, current]);
            row.model.append(current);
        }
        row.selected = languages.findIndex(([code]) => code === current);
        row.connect('notify::selected', () => {
            const value = languages[row.selected]?.[0];
            if (value && value !== settings.get_string('language'))
                settings.set_string('language', value);
        });
        group.add(row);
        return group;
    }

    _aboutGroup() {
        const group = new Adw.PreferencesGroup({title: _('About')});
        const row = new Adw.ActionRow({title: _('Version'), subtitle: this.metadata['version-name'] ?? '–'});
        row.add_css_class('property');
        group.add(row);
        return group;
    }

    _serviceGroup(window) {
        const group = new Adw.PreferencesGroup({title: _('Syncthing service')});
        const unitRow = new Adw.ActionRow({title: _('Unit'), subtitle: _('Detecting…')});
        const enabledRow = new Adw.ActionRow({title: _('Enabled at boot'), subtitle: '–'});
        const stateRow = new Adw.ActionRow({title: _('Status'), subtitle: '–'});
        const startButton = suffixButton({label: _('Start'), sensitive: false});
        const stopButton = suffixButton({label: _('Stop'), sensitive: false});
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
                unitRow.subtitle = _('No Syncthing unit found');
                startButton.sensitive = stopButton.sensitive = false;
                return;
            }
            unitRow.subtitle = unit.scope === 'system'
                ? _('{name} (system unit)', {name: unit.name}) : _('{name} (user unit)', {name: unit.name});
            enabledRow.subtitle = ENABLED_LABELS[unit.unitFileState]
                ? _(ENABLED_LABELS[unit.unitFileState]) : unit.unitFileState ?? '–';
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
            unitRow.subtitle = _('Detection failed: {error}', {error: e.message});
        });
        onDispose(() => unit.destroy());
        return group;
    }

    _connectionGroup(window, settings) {
        const group = new Adw.PreferencesGroup({title: _('Connection')});

        // Config directory
        const dirRow = new Adw.EntryRow({title: _('Config directory'), show_apply_button: true});
        const showDir = () => {
            dirRow.text = settings.get_string('config-dir') || detectConfigDir() || '';
        };
        dirRow.connect('apply', () => settings.set_string('config-dir', dirRow.text.trim()));
        const browse = suffixButton({icon_name: 'folder-open-symbolic', tooltip_text: _('Choose…'),
            css_classes: ['flat']});
        browse.connect('clicked', async () => {
            const dialog = new Gtk.FileDialog({title: _('Syncthing config directory'), modal: true});
            try {
                const folder = await dialog.select_folder(window, null);
                settings.set_string('config-dir', folder.get_path());
            } catch (e) {
                if (!e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    toast(window, e.message);
            }
        });
        const detectDir = suffixButton({icon_name: 'edit-undo-symbolic', tooltip_text: _('Auto-detect'),
            css_classes: ['flat']});
        detectDir.connect('clicked', () => settings.set_string('config-dir', ''));
        dirRow.add_suffix(browse);
        dirRow.add_suffix(detectDir);
        group.add(dirRow);

        // Syncthing window: how it is opened. The row below shows the web app,
        // the command or the GUI URI, depending on the choice.
        const modeRow = new Adw.ComboRow({title: _('Syncthing window'),
            model: Gtk.StringList.new(WINDOW_MODES.map(([, label]) => _(label)))});
        modeRow.connect('notify::selected', () => {
            const value = WINDOW_MODES[modeRow.selected]?.[0];
            if (value && value !== settings.get_string('window-mode'))
                settings.set_string('window-mode', value);
        });
        group.add(modeRow);

        // Web app: the one found for the GUI URI, read-only.
        const webAppRow = new Adw.ActionRow({title: _('Web app identifier'), subtitle: '–'});
        webAppRow.add_css_class('property');
        group.add(webAppRow);

        // Command
        const commandRow = new Adw.EntryRow({title: _('Command'), show_apply_button: true});
        commandRow.connect('apply', () => {
            const text = commandRow.text.trim();
            if (text && !commandArgv(text)) {
                toast(window, _('Invalid command: {command}', {command: text}));
                return;
            }
            settings.set_string('window-command', text);
        });
        group.add(commandRow);

        // GUI URI
        // Without a stored URI, the address from config.xml is shown; applying
        // it unchanged keeps following config.xml.
        const uriRow = new Adw.EntryRow({title: _('URL+Port'), show_apply_button: true});
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
                toast(window, _('Invalid URL: {url}', {url: text}));
                return;
            }
            const following = !settings.get_string('gui-uri') && configUri && uri === normalizeUri(configUri);
            settings.set_string('gui-uri', following ? '' : uri);
        });
        const detectUri = suffixButton({icon_name: 'edit-undo-symbolic', tooltip_text: _('Use the address from config.xml'),
            css_classes: ['flat']});
        detectUri.connect('clicked', () => settings.set_string('gui-uri', ''));
        uriRow.add_suffix(detectUri);
        group.add(uriRow);

        // Test
        const testRow = new Adw.ActionRow({title: _('Test connection'), subtitle: ''});
        const testButton = suffixButton({label: _('Test')});
        testButton.connect('clicked', async () => {
            testButton.sensitive = false;
            testRow.subtitle = _('Connecting…');
            try {
                const conn = await resolveConnection(settings);
                const version = await testConnection(conn);
                testRow.subtitle = _('Connected to Syncthing {version} at {url}', {version, url: conn.uri});
            } catch (e) {
                testRow.subtitle = _('Failed: {error}', {error: e.message});
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
                modeRow.subtitle = _('Opens the URL in the default browser');
                return;
            }
            if (mode === 'webapp') {
                const uri = await effectiveUri(settings);
                const webApp = uri ? findWebApp(uri) : null;
                webAppRow.subtitle = webApp?.id ?? '–';
                if (webApp) {
                    modeRow.subtitle = _('Opens or raises {app}', {app: webApp.name});
                } else if (!epiphanyAvailable()) {
                    modeRow.subtitle = _('GNOME Web is not installed. Until it is, the default browser is used.');
                } else {
                    modeRow.subtitle = _('No GNOME Web app for the URL yet. It is created as soon as the extension knows the URL; until then the default browser is used.');
                }
                return;
            }
            const command = windowCommand(settings);
            commandRow.text = command ?? '';
            const app = command ? findAppByCommand(command) : null;
            if (!command) {
                modeRow.subtitle = _('Enter a command. Until then the default browser is used.');
            } else if (app) {
                modeRow.subtitle = _('Opens or raises {app}', {app: app.get_display_name()});
            } else {
                modeRow.subtitle = _('Runs the command in a shell');
            }
        };

        const refresh = () => {
            showDir();
            showUri();
            showWindow();
            testRow.subtitle = '';
        };
        for (const key of ['config-dir', 'gui-uri', 'window-mode', 'window-command'])
            watch(settings, key, refresh);
        // A web app created or removed meanwhile, e.g. by the extension.
        const appMonitor = Gio.AppInfoMonitor.get();
        const appMonitorId = appMonitor.connect('changed', () => showWindow());
        onDispose(() => appMonitor.disconnect(appMonitorId));
        refresh();
        return group;
    }

    _positionGroup(settings) {
        const group = new Adw.PreferencesGroup({title: _('Top bar')});
        const model = Gtk.StringList.new(POSITIONS.map(([, label]) => _(label)));
        const row = new Adw.ComboRow({title: _('Position'), model});
        const sync = () => {
            row.selected = Math.max(0, POSITIONS.findIndex(([v]) => v === settings.get_string('position')));
        };
        row.connect('notify::selected', () => {
            const value = POSITIONS[row.selected]?.[0];
            if (value && value !== settings.get_string('position'))
                settings.set_string('position', value);
        });
        watch(settings, 'position', sync);
        sync();
        group.add(row);
        return group;
    }

    _layoutGroup(settings) {
        const group = new Adw.PreferencesGroup({title: _('Layout')});
        const model = Gtk.StringList.new(ORIENTATIONS.map(([, label]) => _(label)));
        const row = new Adw.ComboRow({title: _('Orientation'), model,
            subtitle: _('Auto: side by side with 10 or more folders and devices')});
        const sync = () => {
            row.selected = Math.max(0, ORIENTATIONS.findIndex(([v]) => v === settings.get_string('layout-orientation')));
        };
        row.connect('notify::selected', () => {
            const value = ORIENTATIONS[row.selected]?.[0];
            if (value && value !== settings.get_string('layout-orientation'))
                settings.set_string('layout-orientation', value);
        });
        watch(settings, 'layout-orientation', sync);
        sync();
        group.add(row);
        return group;
    }

    _hotkeyGroup(window, settings) {
        const group = new Adw.PreferencesGroup({title: _('Hotkey')});
        const row = new Adw.ActionRow({title: _('Open or hide the Syncthing window')});
        const label = new Gtk.ShortcutLabel({disabled_text: _('Disabled'), valign: Gtk.Align.CENTER});
        const setButton = suffixButton({label: _('Set…')});
        const clearButton = suffixButton({icon_name: 'edit-clear-symbolic', tooltip_text: _('Disable'),
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
        watch(settings, 'toggle-window', sync);
        sync();
        group.add(row);
        return group;
    }

    _recordShortcut(window, settings) {
        const dialog = new Adw.Dialog({title: _('Set shortcut'), content_width: 400});
        const view = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        view.content = new Adw.StatusPage({
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            title: _('Press a key combination'),
            description: _('Use at least one modifier, e.g. Super or Ctrl.\nEsc cancels, Backspace disables the shortcut.'),
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
