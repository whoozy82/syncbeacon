// Info box: a popup with the actions (Open UI, Run/Pause, Refresh, Settings) on
// top, then the state and every peer and folder with its status.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {State, STATE_LABELS} from '../lib/state.js';

/**
 * A row with a coloured dot, a name and a status. With withDetail, hovering
 * the status swaps it for a detail text on a darker background.
 *
 * @returns {{item: PopupMenu.PopupBaseMenuItem, set: Function}}
 */
function statusRow(withDetail = false) {
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
        style_class: 'syncbeacon-row'});
    const dot = new St.Widget({y_align: Clutter.ActorAlign.CENTER});
    const nameLabel = new St.Label({style_class: 'syncbeacon-row-name',
        y_align: Clutter.ActorAlign.CENTER});
    const status = new St.Label({style_class: 'syncbeacon-row-status',
        x_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER});
    item.add_child(dot);
    item.add_child(nameLabel);

    let detail = null;
    if (withDetail) {
        // Both labels stay in the layout (hidden by opacity), so the cell
        // keeps its width and hover state while the texts swap.
        detail = new St.Label({style_class: 'syncbeacon-row-detail', opacity: 0,
            x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER});
        const cell = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        cell.add_child(status);
        cell.add_child(detail);
        cell.connect('notify::hover', () => {
            status.opacity = cell.hover ? 0 : 255;
            detail.opacity = cell.hover ? 255 : 0;
        });
        item.add_child(cell);
    } else {
        item.add_child(status);
    }

    const set = (name, text, kind, detailText = '') => {
        dot.style_class = `syncbeacon-dot syncbeacon-dot-${kind}`;
        nameLabel.text = name;
        status.text = text;
        if (detail)
            detail.text = detailText;
    };
    return {item, set};
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
     *   setRunning(bool), refresh(), setRateSampling(bool) and openPreferences()
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

        // Devices and folders, rebuilt when the set of devices or folders
        // changes and updated in place otherwise, so a hovered row stays.
        this._lists = new PopupMenu.PopupMenuSection();
        this._listKey = null;
        this.addMenuItem(this._lists);

        // Fetch a fresh status whenever the box opens; sample the transfer
        // rates while it is open.
        this.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._controller.refresh();
            this._controller.setRateSampling(open);
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

        if (!status) {
            this._lists.removeAll();
            this._listKey = null;
            return;
        }

        const key = JSON.stringify([status.devices.map(d => d.id), status.folders.map(f => f.id)]);
        if (key !== this._listKey) {
            this._listKey = key;
            this._buildLists(status);
        }

        this._devicesHeading.label.text = `Devices (${status.peersConnected}/${status.peersTotal} online)`;
        this._foldersHeading.label.text = `Folders (${status.foldersTotal})`;
        status.devices.forEach((dev, i) =>
            this._deviceRows[i].set(dev.name, dev.text, dev.status, dev.detail));
        status.folders.forEach((folder, i) =>
            this._folderRows[i].set(folder.label, folder.text, folder.status));
    }

    _buildLists(status) {
        this._lists.removeAll();
        this._devicesHeading = new PopupMenu.PopupSeparatorMenuItem('');
        this._lists.addMenuItem(this._devicesHeading);
        if (status.devices.length === 0)
            this._addPlaceholder('No remote devices');
        this._deviceRows = status.devices.map(() => this._addRow(true));

        this._foldersHeading = new PopupMenu.PopupSeparatorMenuItem('');
        this._lists.addMenuItem(this._foldersHeading);
        if (status.folders.length === 0)
            this._addPlaceholder('No folders');
        this._folderRows = status.folders.map(() => this._addRow(false));
    }

    _addRow(withDetail) {
        const row = statusRow(withDetail);
        this._lists.addMenuItem(row.item);
        return row;
    }

    _addPlaceholder(text) {
        this._addRow(false).set(text, '', 'offline');
    }
}
