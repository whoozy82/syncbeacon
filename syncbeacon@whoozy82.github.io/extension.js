// Syncbeacon: Syncthing status in the GNOME top bar.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {SyncthingClient, isCancelled} from './lib/client.js';
import {resolveConnection} from './lib/config.js';
import {ConflictScanner} from './lib/conflicts.js';
import {deriveStatus} from './lib/state.js';
import {SyncthingUnit} from './lib/systemd.js';
import {
    createWebApp, epiphanyAvailable, findAppByCommand, findWebApp, storeWebAppCommand, windowCommand,
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
const RATE_INTERVAL_S = 2;

export default class SyncbeaconExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._status = null;
        this._uri = null;
        this._configGen = 0;
        this._lastAuthReload = 0;
        this._folderKey = '';

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
            this);

        this._placeIndicator();
        Main.wm.addKeybinding('toggle-window', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this.toggleWindow());

        this._reconfigure();
    }

    disable() {
        Main.wm.removeKeybinding('toggle-window');
        this._settings.disconnectObject(this);
        for (const id of [this._updateId, this._retryId, this._rateId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._updateId = this._retryId = this._rateId = 0;
        this._configCancellable?.cancel();
        this._configCancellable = null;

        this._indicator?.destroy();
        this._indicator = null;
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
        const command = this._windowCommand();
        const app = this._windowApp(command);
        if (app) {
            app.activate();
            return;
        }
        if (command) {
            this._runCommand(command);
            return;
        }
        // URI mode, or command mode without a command: the default browser.
        const uri = this._uri;
        if (!uri) {
            Main.notifyError('Syncbeacon', 'The Syncthing GUI address is unknown.');
            return;
        }
        try {
            Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
        } catch (e) {
            Main.notifyError('Syncbeacon', `Cannot open ${uri}: ${e.message}`);
        }
    }

    toggleWindow() {
        const app = this._windowApp(this._windowCommand());
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

    /** Sample the device transfer rates while the info box is open. */
    setRateSampling(on) {
        if (this._rateId) {
            GLib.source_remove(this._rateId);
            this._rateId = 0;
        }
        if (!on)
            return;
        this._rateId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, RATE_INTERVAL_S, () => {
            this._client.sampleRates().catch(e => {
                if (!isCancelled(e))
                    console.debug(`Syncbeacon: rate sample failed: ${e}`);
            });
            return GLib.SOURCE_CONTINUE;
        });
    }

    setRunning(running) {
        const action = running ? this._client.resumeAll() : this._client.pauseAll();
        action.then(() => {
            // Fetch the new state now rather than waiting for the events.
            if (this._client)
                this.refresh();
        }, e => {
            Main.notifyError('Syncbeacon', `${running ? 'Resume' : 'Pause'} failed: ${e.message}`);
            this._scheduleUpdate();
        });
    }

    // ---- Internals ----

    _windowCommand() {
        if (this._settings.get_string('window-mode') !== 'command')
            return null;
        return windowCommand(this._settings, this._uri);
    }

    // The app whose Exec line is the window command, so an open window is
    // raised (or minimised by the hotkey) instead of started again.
    _windowApp(command) {
        const info = command ? findAppByCommand(command) : null;
        return info ? Shell.AppSystem.get_default().lookup_app(info.get_id()) : null;
    }

    _runCommand(command) {
        let proc;
        try {
            proc = Gio.Subprocess.new(['/bin/sh', '-c', command], Gio.SubprocessFlags.NONE);
        } catch (e) {
            Main.notifyError('Syncbeacon', `Cannot run ${command}: ${e.message}`);
            return;
        }
        proc.wait_async(null, (_proc, result) => {
            try {
                proc.wait_finish(result);
            } catch {
                return;
            }
            if (proc.get_if_exited() && proc.get_exit_status() !== 0)
                Main.notifyError('Syncbeacon', `${command} exited with status ${proc.get_exit_status()}`);
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
            this._uri = this._settings.get_string('gui-uri') || null;
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
        storeWebAppCommand(this._settings, this._uri);
    }

    // One-time setup once the GUI address is known. With GNOME Web, the
    // window is its Syncthing web app, created if there is none yet. Without
    // it, the window is the GUI address in the default browser. Keys that are
    // already set stay as they are.
    _firstRun() {
        const settings = this._settings;
        if (settings.get_boolean('first-run-done') || !this._uri)
            return;
        settings.set_boolean('first-run-done', true);

        if (epiphanyAvailable()) {
            let command = findWebApp(this._uri)?.command;
            if (!command) {
                try {
                    command = createWebApp(this._uri,
                        GLib.build_filenamev([this.path, 'icons', 'syncbeacon-syncthing-symbolic.svg']));
                } catch (e) {
                    console.error(`Syncbeacon: cannot create the Syncthing web app: ${e}`);
                }
            }
            if (command) {
                if (!settings.get_string('window-command'))
                    settings.set_string('window-command', command);
                return;
            }
        }
        if (settings.get_user_value('window-mode') === null)
            settings.set_string('window-mode', 'uri');
        if (!settings.get_string('gui-uri'))
            settings.set_string('gui-uri', this._uri);
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
