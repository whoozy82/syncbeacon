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
    ['far-left', N_('prefs.layout.position.far-left')],
    ['left', N_('prefs.layout.position.left')],
    ['middle', N_('prefs.layout.position.middle')],
    ['right', N_('prefs.layout.position.right')],
    ['far-right', N_('prefs.layout.position.far-right')],
];

const ORIENTATIONS = [
    ['auto', N_('prefs.layout.orientation.auto')],
    ['vertical', N_('prefs.layout.orientation.vertical')],
    ['horizontal', N_('prefs.layout.orientation.horizontal')],
];

const WINDOW_MODES = [
    ['webapp', N_('prefs.connection.window.webapp')],
    ['command', N_('prefs.connection.window.command')],
    ['uri', N_('prefs.connection.window.uri')],
];

const ENABLED_LABELS = {
    'enabled': N_('prefs.service.enabled.yes'),
    'enabled-runtime': N_('prefs.service.enabled.runtime'),
    'static': N_('prefs.service.enabled.static'),
    'linked': N_('prefs.service.enabled.linked'),
    'disabled': N_('prefs.service.enabled.no'),
    'masked': N_('prefs.service.enabled.masked'),
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
        return _('prefs.service.not-authorised');
    if (remote)
        Gio.DBusError.strip_remote_error(e);
    return e.message;
}

export default class SyncbeaconPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(640, 760);

        // Another language: the page is built again with the new texts. A
        // newer change or closing the window cancels a load still running.
        let page = null;
        let cancellable = null;
        const build = async () => {
            cancellable?.cancel();
            const current = new Gio.Cancellable();
            cancellable = current;
            let languages;
            try {
                await loadLanguage(this.path, settings.get_string('language'), current);
                languages = await availableLanguages(this.path, current);
            } catch (e) {
                if (!isCancelled(e))
                    console.error(`Syncbeacon: cannot load the language: ${e}`);
                return;
            }
            if (current.is_cancelled())
                return;
            dispose();
            if (page)
                window.remove(page);
            page = this._page(window, settings, languages);
            window.add(page);
        };
        const languageId = settings.connect('changed::language', () => build());
        window.connect('close-request', () => {
            settings.disconnect(languageId);
            cancellable?.cancel();
            dispose();
            return false;
        });
        await build();
    }

    _page(window, settings, languages) {
        const page = new Adw.PreferencesPage({title: _('common.settings'), icon_name: 'emblem-system-symbolic'});
        page.add(this._languageGroup(settings, languages));
        page.add(this._serviceGroup(window));
        page.add(this._connectionGroup(window, settings));
        page.add(this._layoutGroup(settings));
        page.add(this._hotkeyGroup(window, settings));
        page.add(this._aboutGroup());
        return page;
    }

    // System, then the languages in locale/ (English included) by their own names.
    _languageGroup(settings, available) {
        const group = new Adw.PreferencesGroup({title: _('prefs.general.title')});
        const languages = [['system', _('prefs.general.language-system')],
            ...available.map(({code, name}) => [code, name])];
        const row = new Adw.ComboRow({title: _('prefs.general.language'),
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
        const group = new Adw.PreferencesGroup({title: _('prefs.about.title')});
        const row = new Adw.ActionRow({title: _('prefs.about.version'), subtitle: this.metadata['version-name'] ?? '–'});
        row.add_css_class('property');
        group.add(row);
        group.add(new Adw.PreferencesRow({activatable: false, child: new Gtk.Label({
            label: [
                _('prefs.about.not-official'),
                _('prefs.about.needs-syncthing'),
                _('prefs.about.epiphany-recommended'),
            ].join('\n'),
            wrap: true, xalign: 0, css_classes: ['dim-label'],
            margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
        })}));
        return group;
    }

    _serviceGroup(window) {
        const group = new Adw.PreferencesGroup({title: _('prefs.service.title')});
        const unitRow = new Adw.ActionRow({title: _('prefs.service.unit'), subtitle: _('prefs.service.detecting')});
        const enabledRow = new Adw.ActionRow({title: _('prefs.service.enabled-at-boot'), subtitle: '–'});
        const stateRow = new Adw.ActionRow({title: _('prefs.service.status'), subtitle: '–'});
        const startButton = suffixButton({label: _('prefs.service.start'), sensitive: false});
        const stopButton = suffixButton({label: _('prefs.service.stop'), sensitive: false});
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
                unitRow.subtitle = _('systemd.no-unit');
                startButton.sensitive = stopButton.sensitive = false;
                return;
            }
            unitRow.subtitle = unit.scope === 'system'
                ? _('prefs.service.system-unit', {name: unit.name}) : _('prefs.service.user-unit', {name: unit.name});
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
            unitRow.subtitle = _('prefs.service.detection-failed', {error: e.message});
        });
        onDispose(() => unit.destroy());
        return group;
    }

    _connectionGroup(window, settings) {
        const group = new Adw.PreferencesGroup({title: _('prefs.connection.title')});

        // Config directory
        const dirRow = new Adw.EntryRow({title: _('prefs.connection.config-dir'), show_apply_button: true});
        const showDir = () => {
            dirRow.text = settings.get_string('config-dir') || detectConfigDir() || '';
        };
        dirRow.connect('apply', () => settings.set_string('config-dir', dirRow.text.trim()));
        const browse = suffixButton({icon_name: 'folder-open-symbolic', tooltip_text: _('prefs.connection.choose'),
            css_classes: ['flat']});
        browse.connect('clicked', async () => {
            const dialog = new Gtk.FileDialog({title: _('prefs.connection.config-dir-dialog'), modal: true});
            try {
                const folder = await dialog.select_folder(window, null);
                settings.set_string('config-dir', folder.get_path());
            } catch (e) {
                if (!e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    toast(window, e.message);
            }
        });
        const detectDir = suffixButton({icon_name: 'edit-undo-symbolic', tooltip_text: _('prefs.connection.auto-detect'),
            css_classes: ['flat']});
        detectDir.connect('clicked', () => settings.set_string('config-dir', ''));
        dirRow.add_suffix(browse);
        dirRow.add_suffix(detectDir);
        group.add(dirRow);

        // Syncthing window: how it is opened. The row below shows the web app,
        // the command or the GUI URI, depending on the choice.
        const modeRow = new Adw.ComboRow({title: _('prefs.connection.window'),
            model: Gtk.StringList.new(WINDOW_MODES.map(([, label]) => _(label)))});
        modeRow.connect('notify::selected', () => {
            const value = WINDOW_MODES[modeRow.selected]?.[0];
            if (value && value !== settings.get_string('window-mode'))
                settings.set_string('window-mode', value);
        });
        group.add(modeRow);

        // Web app: the one found for the GUI URI, read-only.
        const webAppRow = new Adw.ActionRow({title: _('prefs.connection.webapp-id'), subtitle: '–'});
        webAppRow.add_css_class('property');
        group.add(webAppRow);

        // Command
        const commandRow = new Adw.EntryRow({title: _('prefs.connection.command'), show_apply_button: true});
        commandRow.connect('apply', () => {
            const text = commandRow.text.trim();
            if (text && !commandArgv(text)) {
                toast(window, _('prefs.connection.invalid-command', {command: text}));
                return;
            }
            settings.set_string('window-command', text);
        });
        group.add(commandRow);

        // GUI URI
        // Without a stored URI, the address from config.xml is shown; applying
        // it unchanged keeps following config.xml.
        const uriRow = new Adw.EntryRow({title: _('prefs.connection.uri'), show_apply_button: true});
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
                toast(window, _('common.invalid-url', {url: text}));
                return;
            }
            const following = !settings.get_string('gui-uri') && configUri && uri === normalizeUri(configUri);
            settings.set_string('gui-uri', following ? '' : uri);
        });
        const detectUri = suffixButton({icon_name: 'edit-undo-symbolic', tooltip_text: _('prefs.connection.use-config-address'),
            css_classes: ['flat']});
        detectUri.connect('clicked', () => settings.set_string('gui-uri', ''));
        uriRow.add_suffix(detectUri);
        group.add(uriRow);

        // Test
        const testRow = new Adw.ActionRow({title: _('prefs.connection.test-connection'), subtitle: ''});
        const testButton = suffixButton({label: _('prefs.connection.test')});
        testButton.connect('clicked', async () => {
            testButton.sensitive = false;
            testRow.subtitle = _('common.connecting');
            try {
                const conn = await resolveConnection(settings);
                const version = await testConnection(conn);
                testRow.subtitle = _('prefs.connection.connected-to', {version, url: conn.uri});
            } catch (e) {
                testRow.subtitle = _('prefs.connection.test-failed', {error: e.message});
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
                modeRow.subtitle = _('prefs.connection.window.uri-hint');
                return;
            }
            if (mode === 'webapp') {
                const uri = await effectiveUri(settings);
                const webApp = uri ? findWebApp(uri) : null;
                webAppRow.subtitle = webApp?.id ?? '–';
                if (webApp) {
                    modeRow.subtitle = _('prefs.connection.window.opens-app', {app: webApp.name});
                } else if (!epiphanyAvailable()) {
                    modeRow.subtitle = _('prefs.connection.window.no-epiphany');
                } else {
                    modeRow.subtitle = _('prefs.connection.window.no-webapp');
                }
                return;
            }
            const command = windowCommand(settings);
            commandRow.text = command ?? '';
            const app = command ? findAppByCommand(command) : null;
            if (!command) {
                modeRow.subtitle = _('prefs.connection.window.enter-command');
            } else if (app) {
                modeRow.subtitle = _('prefs.connection.window.opens-app', {app: app.get_display_name()});
            } else {
                modeRow.subtitle = _('prefs.connection.window.command-hint');
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

    _positionRow(settings) {
        const model = Gtk.StringList.new(POSITIONS.map(([, label]) => _(label)));
        const row = new Adw.ComboRow({title: _('prefs.layout.position'), model});
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
        return row;
    }

    _layoutGroup(settings) {
        const group = new Adw.PreferencesGroup({title: _('prefs.layout.title')});
        group.add(this._positionRow(settings));
        const model = Gtk.StringList.new(ORIENTATIONS.map(([, label]) => _(label)));
        const row = new Adw.ComboRow({title: _('prefs.layout.orientation'), model,
            subtitle: _('prefs.layout.orientation-hint')});
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
        const group = new Adw.PreferencesGroup({title: _('prefs.hotkey.title')});
        const row = new Adw.ActionRow({title: _('prefs.hotkey.toggle-window')});
        const label = new Gtk.ShortcutLabel({disabled_text: _('prefs.hotkey.disabled'), valign: Gtk.Align.CENTER});
        const setButton = suffixButton({label: _('prefs.hotkey.set')});
        const clearButton = suffixButton({icon_name: 'edit-clear-symbolic', tooltip_text: _('prefs.hotkey.disable'),
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
        const dialog = new Adw.Dialog({title: _('prefs.hotkey.dialog-title'), content_width: 400});
        const view = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        view.content = new Adw.StatusPage({
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            title: _('prefs.hotkey.press'),
            description: _('prefs.hotkey.hint'),
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
