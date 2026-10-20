// Syncbeacon: Syncthing status in the GNOME top bar.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {_, N_} from './lib/i18n.js';
import {loadLanguage} from './lib/locale.js';
import {SyncthingClient, isCancelled} from './lib/client.js';
import {DEFAULT_GUI_URI, resolveConnection} from './lib/config.js';
import {ConflictScanner} from './lib/conflicts.js';
import {deriveStatus} from './lib/state.js';
import {SyncthingUnit} from './lib/systemd.js';
import {
    createWebApp, epiphanyAvailable, findAppByCommand, findWebApp, isWebAppCommand, windowCommand,
} from './lib/webapp.js';
import {Indicator} from './ui/indicator.js';

// Setting value -> [panel box, index]; -1 appends at the end of the box.
const POSITIONS = {
    'far-left': ['left', 0],
    'left': ['left', -1],
    'middle': ['center', -1],
    'right': ['right', 0],
    'far-right': ['right', -1],
};

const UPDATE_DELAY_MS = 100;
const CONFIG_RETRY_S = 30;
const AUTH_RELOAD_MIN_S = 10;
// Status poll on top of the events, in seconds: with the info box closed and open.
const POLL_CLOSED_S = 10;
const POLL_OPEN_S = 1;

export default class SyncbeaconExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._status = null;
        this._uri = null;
        this._configGen = 0;
        this._lastAuthReload = 0;
        this._folderKey = '';
        this._webAppCreatedFor = null;
        this._migrateSettings();
        loadLanguage(this.path, this._settings.get_string('language'));

        this._client = new SyncthingClient({
            onUpdate: () => this._scheduleUpdate(),
            onAuthError: () => this._onAuthError(),
            onConflictHint: folderId => this._conflicts?.hint(folderId),
        });
        this._conflicts = new ConflictScanner(() => this._scheduleUpdate());
        this._unit = new SyncthingUnit(() => this._onUnitChanged());
        this._unit.init().catch(e => console.error(`Syncbeacon: unit detection failed: ${e}`));

        this._settings.connectObject(
            'changed::config-dir', () => this._reconfigure(),
            'changed::gui-uri', () => this._reconfigure(),
            'changed::position', () => this._placeIndicator(),
            'changed::window-mode', () => this._ensureWebApp(),
            'changed::language', () => this._onLanguageChanged(),
            this);

        this._placeIndicator();
        Main.wm.addKeybinding('toggle-window', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this.toggleWindow());

        this._reconfigure();
        this._startPolling(POLL_CLOSED_S);
    }

    disable() {
        Main.wm.removeKeybinding('toggle-window');
        this._settings.disconnectObject(this);
        // First, so closing an open info box cannot start the poll timer again.
        this._indicator?.destroy();
        this._indicator = null;
        for (const id of [this._updateId, this._retryId, this._pollId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._updateId = this._retryId = this._pollId = 0;
        this._configCancellable?.cancel();
        this._configCancellable = null;

        this._client.stop();
        this._client = null;
        this._conflicts.destroy();
        this._conflicts = null;
        this._unit.destroy();
        this._unit = null;
        this._settings = null;
        this._status = null;
    }

    // ---- Actions used by the indicator ----

    openWindow() {
        const app = this._windowApp();
        if (app) {
            app.activate();
            return;
        }
        const command = this._windowCommand();
        if (command) {
            this._runCommand(command);
            return;
        }
        // URI mode, web app mode without a web app, or command mode without a
        // command: the default browser.
        const uri = this._uri;
        if (!uri) {
            Main.notifyError('Syncbeacon', _('The Syncthing GUI address is unknown.'));
            return;
        }
        try {
            Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
        } catch (e) {
            Main.notifyError('Syncbeacon', _('Cannot open {target}: {error}', {target: uri, error: e.message}));
        }
    }

    toggleWindow() {
        const app = this._windowApp();
        const focused = global.display.focus_window;
        if (app && focused && app.get_windows().includes(focused)) {
            focused.minimize();
            return;
        }
        this.openWindow();
    }

    refresh() {
        // A pending retry means config.xml could not be read; try that again.
        if (this._retryId)
            this._reconfigure();
        else
            this._client.refresh();
        this._conflicts.scanAll();
    }

    /** Poll faster while the info box is open. */
    setInfoBoxOpen(open) {
        this._startPolling(open ? POLL_OPEN_S : POLL_CLOSED_S);
    }

    openFolder(path) {
        try {
            Gio.AppInfo.launch_default_for_uri(Gio.File.new_for_path(path).get_uri(),
                global.create_app_launch_context(0, -1));
        } catch (e) {
            Main.notifyError('Syncbeacon', _('Cannot open {target}: {error}', {target: path, error: e.message}));
        }
    }

    rescanFolder(folderId) {
        // The new folder state arrives through the events.
        this._client.rescan(folderId).catch(e =>
            Main.notifyError('Syncbeacon', _('Rescan failed: {error}', {error: e.message})));
    }

    /**
     * Open the folder's .stignore in the default text editor, creating it if
     * needed. The content type is fixed, because an empty or extension-less
     * file would not resolve to an editor. Syncthing reads it on the next scan.
     */
    editIgnores(path) {
        const file = Gio.File.new_for_path(GLib.build_filenamev([path, '.stignore']));
        try {
            try {
                file.create(Gio.FileCreateFlags.NONE, null).close(null);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                    throw e;
            }
            const app = Gio.AppInfo.get_default_for_type('text/plain', false);
            if (!app)
                throw new Error(_('no default text editor'));
            app.launch([file], global.create_app_launch_context(0, -1));
        } catch (e) {
            Main.notifyError('Syncbeacon', _('Cannot edit {path}: {error}', {path: file.get_path(), error: e.message}));
        }
    }

    /**
     * @param {string} area - 'devices' or 'folders'
     * @param {boolean} paused
     */
    setPaused(area, paused) {
        const action = area === 'devices'
            ? this._client.setDevicesPaused(paused) : this._client.setFoldersPaused(paused);
        action.then(() => {
            // Fetch the new state now rather than waiting for the events.
            if (this._client)
                this.refresh();
        }, e => {
            const failed = area === 'devices'
                ? paused ? N_('Pause devices failed: {error}') : N_('Resume devices failed: {error}')
                : paused ? N_('Pause folders failed: {error}') : N_('Resume folders failed: {error}');
            Main.notifyError('Syncbeacon', _(failed, {error: e.message}));
            this._scheduleUpdate();
        });
    }

    // ---- Internals ----

    _windowCommand() {
        if (this._settings.get_string('window-mode') !== 'command')
            return null;
        return windowCommand(this._settings);
    }

    // The app behind the Syncthing window, so an open window is raised (or
    // minimised by the hotkey) instead of started again: the web app for the
    // GUI URI, or the app whose Exec line is the window command.
    _windowApp() {
        let id = null;
        const mode = this._settings.get_string('window-mode');
        if (mode === 'webapp' && this._uri) {
            id = findWebApp(this._uri)?.id;
        } else if (mode === 'command') {
            const command = this._windowCommand();
            id = command ? findAppByCommand(command)?.get_id() : null;
        }
        return id ? Shell.AppSystem.get_default().lookup_app(id) : null;
    }

    _runCommand(command) {
        let proc;
        try {
            proc = Gio.Subprocess.new(['/bin/sh', '-c', command], Gio.SubprocessFlags.NONE);
        } catch (e) {
            Main.notifyError('Syncbeacon', _('Cannot run {command}: {error}', {command, error: e.message}));
            return;
        }
        proc.wait_async(null, (_proc, result) => {
            try {
                proc.wait_finish(result);
            } catch {
                return;
            }
            if (proc.get_if_exited() && proc.get_exit_status() !== 0)
                Main.notifyError('Syncbeacon', _('{command} exited with status {status}', {command, status: proc.get_exit_status()}));
        });
    }

    _startPolling(seconds) {
        if (this._pollId)
            GLib.source_remove(this._pollId);
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._client.poll().catch(e => {
                if (!isCancelled(e))
                    console.debug(`Syncbeacon: status poll failed: ${e}`);
            });
            return GLib.SOURCE_CONTINUE;
        });
    }

    _placeIndicator() {
        this._indicator?.destroy();
        const [box, index] = POSITIONS[this._settings.get_string('position')] ?? POSITIONS.right;
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, index, box);
        if (this._status)
            this._indicator.setStatus(this._status);
    }

    // New texts everywhere: the indicator and the info box are built again,
    // and the status is derived again for the row texts.
    _onLanguageChanged() {
        loadLanguage(this.path, this._settings.get_string('language'));
        this._placeIndicator();
        this._scheduleUpdate();
    }

    async _reconfigure() {
        const gen = ++this._configGen;
        if (this._retryId) {
            GLib.source_remove(this._retryId);
            this._retryId = 0;
        }
        this._configCancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        this._configCancellable = cancellable;

        let conn;
        try {
            conn = await resolveConnection(this._settings, cancellable);
        } catch (e) {
            if (isCancelled(e) || gen !== this._configGen)
                return;
            this._uri = this._settings.get_string('gui-uri') || DEFAULT_GUI_URI;
            this._client.configure(null, e.message);
            this._retryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, CONFIG_RETRY_S, () => {
                this._retryId = 0;
                this._reconfigure();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        if (gen !== this._configGen)
            return;
        this._uri = conn.uri;
        this._client.configure(conn);
        this._firstRun();
        this._ensureWebApp();
    }

    // Earlier versions stored the web app's Exec line as the window command.
    // It is cleared once, and the command mode it implied goes back to the
    // default (the web app mode, which finds the web app by its URL).
    _migrateSettings() {
        const settings = this._settings;
        if (settings.get_int('settings-version') >= 1)
            return;
        if (isWebAppCommand(settings.get_string('window-command'))) {
            settings.reset('window-command');
            if (settings.get_string('window-mode') === 'command')
                settings.reset('window-mode');
        }
        settings.set_int('settings-version', 1);
    }

    // In web app mode, with GNOME Web installed, create the Syncthing web app
    // if none matches the GUI URI; at most once per URI, so a failed attempt
    // or a deleted app is not created again and again.
    _ensureWebApp() {
        const uri = this._uri;
        if (this._settings.get_string('window-mode') !== 'webapp' || !uri ||
            uri === this._webAppCreatedFor || !epiphanyAvailable() || findWebApp(uri))
            return;
        this._webAppCreatedFor = uri;
        try {
            createWebApp(uri, GLib.build_filenamev([this.path, 'icons', 'syncbeacon-syncthing-symbolic.svg']));
        } catch (e) {
            console.error(`Syncbeacon: cannot create the Syncthing web app: ${e}`);
        }
    }

    // One-time setup once the GUI address is known: without GNOME Web, the
    // window is the GUI address in the default browser. Keys that are already
    // set stay as they are.
    _firstRun() {
        const settings = this._settings;
        if (settings.get_boolean('first-run-done') || !this._uri)
            return;
        settings.set_boolean('first-run-done', true);

        if (epiphanyAvailable())
            return;
        if (settings.get_user_value('window-mode') === null)
            settings.set_string('window-mode', 'uri');
    }

    _onAuthError() {
        // The API key may have been regenerated; re-read config.xml, but not
        // in a tight loop.
        const now = GLib.get_monotonic_time() / 1e6;
        if (now - this._lastAuthReload < AUTH_RELOAD_MIN_S)
            return;
        this._lastAuthReload = now;
        this._reconfigure();
    }

    _onUnitChanged() {
        if (this._unit?.active)
            this._client?.retryNow();
        this._scheduleUpdate();
    }

    _scheduleUpdate() {
        if (this._updateId || !this._client)
            return;
        this._updateId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UPDATE_DELAY_MS, () => {
            this._updateId = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _update() {
        const data = this._client.data;
        const folderKey = data.folders.map(f => `${f.id}\0${f.path}`).join('\n');
        if (folderKey !== this._folderKey) {
            this._folderKey = folderKey;
            this._conflicts.setFolders(data.folders);
        }
        this._status = deriveStatus({
            ...data,
            unitActive: this._unit.active,
            conflicts: this._conflicts.counts,
        });
        this._indicator?.setStatus(this._status);
    }
}
