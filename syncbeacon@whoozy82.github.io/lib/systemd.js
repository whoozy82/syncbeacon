// Syncthing systemd unit: detection, live state, start/stop.
// Uses only Gio/GLib so that both the extension and prefs.js can import it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {_} from './i18n.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call');

const SYSTEMD = 'org.freedesktop.systemd1';
const MANAGER_PATH = '/org/freedesktop/systemd1';
const MANAGER_IFACE = 'org.freedesktop.systemd1.Manager';
const UNIT_IFACE = 'org.freedesktop.systemd1.Unit';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

// Polkit prompts can take a while to be answered.
const ACTION_TIMEOUT_MS = 120 * 1000;

function candidates() {
    return [
        {scope: 'system', name: 'syncthing.service'},
        {scope: 'system', name: `syncthing@${GLib.get_user_name()}.service`},
        {scope: 'user', name: 'syncthing.service'},
    ];
}

function busFor(scope) {
    return Gio.bus_get_sync(scope === 'system' ? Gio.BusType.SYSTEM : Gio.BusType.SESSION, null);
}

export class SyncthingUnit {
    /**
     * @param {Function} onChange - called when the unit or its state changes
     */
    constructor(onChange) {
        this._onChange = onChange;
        this._cancellable = new Gio.Cancellable();
        this._bus = null;
        this._path = null;
        this._subscription = 0;
        this.scope = null;
        this.name = null;
        this.activeState = null;
        this.unitFileState = null;
    }

    get found() {
        return this._path !== null;
    }

    /** true/false once known, null if no unit was found */
    get active() {
        if (!this.found || this.activeState === null)
            return null;
        return ['active', 'activating', 'reloading'].includes(this.activeState);
    }

    async init() {
        const loaded = [];
        for (const cand of candidates()) {
            try {
                const bus = busFor(cand.scope);
                const [path] = (await bus.call(SYSTEMD, MANAGER_PATH, MANAGER_IFACE, 'LoadUnit',
                    new GLib.Variant('(s)', [cand.name]), new GLib.VariantType('(o)'),
                    Gio.DBusCallFlags.NONE, -1, this._cancellable)).deepUnpack();
                const props = await this._getAll(bus, path);
                if (props.LoadState === 'loaded')
                    loaded.push({...cand, bus, path, props});
            } catch (e) {
                if (this._cancellable.is_cancelled())
                    return;
                console.debug(`Syncbeacon: unit ${cand.name} (${cand.scope}): ${e.message}`);
            }
        }
        const unit = loaded.find(u => u.props.ActiveState === 'active') ?? loaded[0];
        if (!unit) {
            this._onChange?.();
            return;
        }

        this._bus = unit.bus;
        this._path = unit.path;
        this.scope = unit.scope;
        this.name = unit.name;
        this._apply(unit.props);

        // systemd only emits PropertiesChanged for subscribed clients. The
        // subscription is per bus connection and ends with it, so it is not
        // undone in destroy(): other users of the shared connection may rely on it.
        this._bus.call(SYSTEMD, MANAGER_PATH, MANAGER_IFACE, 'Subscribe', null, null,
            Gio.DBusCallFlags.NONE, -1, this._cancellable).catch(() => {});
        this._subscription = this._bus.signal_subscribe(SYSTEMD, PROPS_IFACE, 'PropertiesChanged',
            this._path, null, Gio.DBusSignalFlags.NONE, () => this.refresh());
        this._onChange?.();
    }

    async refresh() {
        if (!this.found)
            return;
        try {
            this._apply(await this._getAll(this._bus, this._path));
            this._onChange?.();
        } catch (e) {
            if (!this._cancellable.is_cancelled())
                console.debug(`Syncbeacon: unit refresh failed: ${e.message}`);
        }
    }

    start() {
        return this._action('StartUnit');
    }

    stop() {
        return this._action('StopUnit');
    }

    destroy() {
        this._cancellable.cancel();
        if (this._subscription)
            this._bus.signal_unsubscribe(this._subscription);
        this._subscription = 0;
        this._onChange = null;
    }

    async _action(method) {
        if (!this.found)
            throw new Error(_('No Syncthing unit found'));
        await this._bus.call(SYSTEMD, MANAGER_PATH, MANAGER_IFACE, method,
            new GLib.Variant('(ss)', [this.name, 'replace']), new GLib.VariantType('(o)'),
            Gio.DBusCallFlags.ALLOW_INTERACTIVE_AUTHORIZATION, ACTION_TIMEOUT_MS, this._cancellable);
        await this.refresh();
    }

    async _getAll(bus, path) {
        const reply = await bus.call(SYSTEMD, path, PROPS_IFACE, 'GetAll',
            new GLib.Variant('(s)', [UNIT_IFACE]), new GLib.VariantType('(a{sv})'),
            Gio.DBusCallFlags.NONE, -1, this._cancellable);
        // Read only what is needed; unpacking everything trips over uint64
        // limits such as MemoryMax that do not fit a JS number.
        const dict = new GLib.VariantDict(reply.get_child_value(0));
        const str = key => dict.lookup_value(key, new GLib.VariantType('s'))?.unpack() ?? null;
        return {LoadState: str('LoadState'), ActiveState: str('ActiveState'), UnitFileState: str('UnitFileState')};
    }

    _apply(props) {
        this.activeState = props.ActiveState ?? null;
        this.unitFileState = props.UnitFileState ?? null;
    }
}
