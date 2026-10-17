// Info box: a popup with the actions (Open UI, Run/Pause, Refresh, Settings) on
// top, then the state and every peer and folder with its status.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {State, STATE_LABELS} from '../lib/state.js';

function statusRow(name, text, kind) {
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
        style_class: 'syncbeacon-row'});
    item.add_child(new St.Widget({
        style_class: `syncbeacon-dot syncbeacon-dot-${kind}`,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    item.add_child(new St.Label({text: name, style_class: 'syncbeacon-row-name',
        y_align: Clutter.ActorAlign.CENTER}));
    item.add_child(new St.Label({text, style_class: 'syncbeacon-row-status',
        x_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER}));
    return item;
}

function iconButton(gicon, accessibleName) {
    return new St.Button({
        style_class: 'icon-button syncbeacon-action',
        can_focus: true,
        accessible_name: accessibleName,
        child: new St.Icon({gicon}),
        y_align: Clutter.ActorAlign.CENTER,
    });
}

export class InfoBox extends PopupMenu.PopupMenu {
    /**
     * @param {Clutter.Actor} sourceActor - the panel button
     * @param {object} controller - the extension; provides path, openWindow(),
     *   setRunning(bool), refresh() and openPreferences()
     */
    constructor(sourceActor, controller) {
        super(sourceActor, 0.5, St.Side.TOP);
        this.actor.add_style_class_name('panel-menu');
        this.actor.add_style_class_name('syncbeacon-infobox');
        this._controller = controller;
        this._updatingSwitch = false;

        // Top bar, on a darker band: Open UI on the left; Run/Pause switch,
        // Refresh and Settings on the right.
        const actions = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
            style_class: 'syncbeacon-actions'});

        const openButton = iconButton(this._extensionIcon('syncbeacon-syncthing-symbolic.svg'),
            'Open Syncthing');
        openButton.connect('clicked', () => {
            this.close();
            this._controller.openWindow();
        });
        actions.add_child(openButton);
        actions.add_child(new St.Widget({x_expand: true}));

        // The switch is not reactive itself, so clicks (and drags on its
        // handle) reach the surrounding button and toggle it in one place.
        this._switch = new PopupMenu.Switch(true);
        this._switch.reactive = false;
        this._runButton = new St.Button({
            style_class: 'syncbeacon-run-button',
            can_focus: true,
            child: this._switch,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._runButton.connect('clicked', () => {
            this._switch.toggle();
            this._syncRunAccessible();
        });
        this._switch.connect('notify::state', () => {
            if (!this._updatingSwitch)
                this._controller.setRunning(this._switch.state);
        });
        actions.add_child(this._runButton);

        // Stays open so the refreshed status shows up in place.
        const refreshButton = iconButton(new Gio.ThemedIcon({name: 'view-refresh-symbolic'}),
            'Refresh status');
        refreshButton.connect('clicked', () => this._controller.refresh());
        actions.add_child(refreshButton);

        const settingsButton = iconButton(new Gio.ThemedIcon({name: 'emblem-system-symbolic'}),
            'Settings');
        settingsButton.connect('clicked', () => {
            this.close();
            this._controller.openPreferences();
        });
        actions.add_child(settingsButton);
        this.addMenuItem(actions);

        // Header: state and message.
        const header = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
            style_class: 'syncbeacon-header'});
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this._title = new St.Label({style_class: 'syncbeacon-header-title'});
        this._message = new St.Label({style_class: 'syncbeacon-header-message'});
        this._message.clutter_text.line_wrap = true;
        box.add_child(this._title);
        box.add_child(this._message);
        header.add_child(box);
        this.addMenuItem(header);

        // Devices and folders, rebuilt on every update.
        this._lists = new PopupMenu.PopupMenuSection();
        this.addMenuItem(this._lists);

        // Fetch a fresh status whenever the box opens.
        this.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._controller.refresh();
        });
    }

    _extensionIcon(name) {
        return new Gio.FileIcon({
            file: Gio.File.new_for_path(GLib.build_filenamev([this._controller.path, 'icons', name])),
        });
    }

    _syncRunAccessible() {
        this._runButton.accessible_name = this._switch.state ? 'Pause all devices' : 'Resume all devices';
    }

    /**
     * @param {object|null} status - from deriveStatus(), or null before the first update
     */
    update(status) {
        const state = status?.state ?? State.ERROR;
        this._title.text = status ? STATE_LABELS[state] : 'Connecting…';
        this._title.style_class = `syncbeacon-header-title syncbeacon-state-${state}`;
        this._message.text = status?.message ?? '';
        this._message.visible = !!status?.message;

        this._updatingSwitch = true;
        this._switch.state = state !== State.PAUSED;
        this._updatingSwitch = false;
        this._syncRunAccessible();
        const canToggle = !!status && status.peersTotal > 0 &&
            !(state === State.ERROR && !status.reachable);
        this._runButton.reactive = canToggle;
        this._runButton.can_focus = canToggle;
        this._runButton.opacity = canToggle ? 255 : 128;

        this._lists.removeAll();
        if (!status)
            return;

        this._lists.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(
            `Devices (${status.peersConnected}/${status.peersTotal} online)`));
        if (status.devices.length === 0)
            this._lists.addMenuItem(statusRow('No remote devices', '', 'offline'));
        for (const dev of status.devices)
            this._lists.addMenuItem(statusRow(dev.name, dev.text, dev.status));

        this._lists.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(`Folders (${status.foldersTotal})`));
        if (status.folders.length === 0)
            this._lists.addMenuItem(statusRow('No folders', '', 'offline'));
        for (const folder of status.folders)
            this._lists.addMenuItem(statusRow(folder.label, folder.text, folder.status));
    }
}
