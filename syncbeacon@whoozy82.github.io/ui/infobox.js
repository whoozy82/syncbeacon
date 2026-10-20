// Info box: a popup with the actions (Open UI, Settings) and the
// state on top, then every folder and peer with its status; the list
// headlines pause and resume their area.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {State, STATE_LABELS} from '../lib/state.js';

/**
 * The row detail shown on hover: a device's ↓/↑ rates while connected,
 * otherwise a clock icon and when the device was last seen or the folder was
 * last scanned.
 *
 * @returns {{actor: St.BoxLayout, set: Function}}
 */
function rowDetail() {
    const actor = new St.BoxLayout({style_class: 'syncbeacon-row-detail',
        x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER});

    const down = new St.Label({y_align: Clutter.ActorAlign.CENTER});
    const up = new St.Label({y_align: Clutter.ActorAlign.CENTER});
    const rates = new St.BoxLayout({style_class: 'syncbeacon-detail-rates'});
    rates.add_child(down);
    rates.add_child(up);

    const seenLabel = new St.Label({y_align: Clutter.ActorAlign.CENTER});
    const seen = new St.BoxLayout({style_class: 'syncbeacon-detail-part'});
    seen.add_child(new St.Icon({icon_name: 'document-open-recent-symbolic',
        style_class: 'syncbeacon-detail-icon', y_align: Clutter.ActorAlign.CENTER}));
    seen.add_child(seenLabel);

    actor.add_child(rates);
    actor.add_child(seen);

    const set = detail => {
        rates.visible = detail?.kind === 'rates';
        seen.visible = detail?.kind === 'last-seen' || detail?.kind === 'last-scan';
        if (rates.visible) {
            down.text = `↓${detail.down}`;
            up.text = `↑${detail.up}`;
        } else {
            seenLabel.text = detail?.text ?? '';
        }
    };
    return {actor, set};
}

/**
 * The folder actions shown when hovering the folder's ⋯ hint: Open Folder,
 * Rescan and Edit Ignore List.
 *
 * @param {InfoBox} infoBox
 * @returns {{actor: St.BoxLayout, set: Function}}
 */
function folderActions(infoBox) {
    const actor = new St.BoxLayout({style_class: 'syncbeacon-row-detail syncbeacon-folder-actions',
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    let folder = null;

    const button = (icon, accessibleName, onClick) => {
        const b = new St.Button({style_class: 'syncbeacon-folder-action',
            accessible_name: accessibleName, child: new St.Icon(icon),
            y_align: Clutter.ActorAlign.CENTER});
        b.connect('clicked', () => folder && onClick(folder));
        actor.add_child(b);
        return b;
    };
    const controller = infoBox._controller;
    button({icon_name: 'folder-open-symbolic'}, 'Open folder', f => {
        infoBox.close();
        controller.openFolder(f.path);
    });
    // Stays open so the scan state shows up in place.
    const rescan = button({icon_name: 'view-refresh-symbolic'}, 'Rescan folder',
        f => controller.rescanFolder(f.id));
    button({gicon: infoBox._extensionIcon('syncbeacon-ignore-symbolic.svg')}, 'Edit ignore list', f => {
        infoBox.close();
        controller.editIgnores(f.path);
    });

    const set = value => {
        folder = value;
        rescan.reactive = !folder?.paused;
        rescan.opacity = folder?.paused ? 128 : 255;
    };
    return {actor, set};
}

/**
 * A small ⋯ hint that turns into the folder actions while hovered. The actions
 * are hidden otherwise, so they take no clicks and the hover zone is the hint;
 * once shown, the cell spans them and moving onto them keeps the hover. The
 * cell fills the row height, so the row does not grow when they show.
 */
function actionsCell(actions) {
    const hint = new St.Icon({style_class: 'syncbeacon-action-hint',
        icon_name: 'view-more-horizontal-symbolic',
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    actions.actor.visible = false;
    const cell = new St.Widget({
        style_class: 'syncbeacon-action-cell',
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        track_hover: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.FILL,
    });
    cell.add_child(hint);
    cell.add_child(actions.actor);
    cell.connect('notify::hover', () => {
        hint.visible = !cell.hover;
        actions.actor.visible = cell.hover;
    });
    return cell;
}

/** Wrap actor in a box that fills its parent and keeps actor at the right. */
function alignEnd(actor) {
    const box = new St.BoxLayout({x_expand: true, x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.CENTER});
    box.add_child(new St.Widget({x_expand: true}));
    box.add_child(actor);
    return box;
}

/**
 * A row with a coloured dot, a name and a status. With makeDetail, hovering
 * the status swaps it for the row detail on a darker background. With
 * makeActions, a ⋯ hint centred in the row reveals the folder actions on hover.
 *
 * @param {Function|null} makeDetail - returns {actor, set}
 * @param {Function|null} makeActions - returns {actor, set}
 * @returns {{item: PopupMenu.PopupBaseMenuItem, set: Function}}
 */
function statusRow(makeDetail = null, makeActions = null) {
    const withDetail = !!makeDetail;
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
        style_class: 'syncbeacon-row'});
    // With actions, the line sits under the hint in an overlay, so every hint
    // is centred in the row whatever the name and status widths.
    const actions = makeActions?.();
    const line = actions
        ? new St.BoxLayout({style_class: 'syncbeacon-row-line', x_expand: true})
        : item;
    if (actions) {
        const overlay = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
        overlay.add_child(line);
        overlay.add_child(actionsCell(actions));
        item.add_child(overlay);
    }
    const dot = new St.Widget({y_align: Clutter.ActorAlign.CENTER});
    const nameLabel = new St.Label({style_class: 'syncbeacon-row-name',
        y_align: Clutter.ActorAlign.CENTER});
    const status = new St.Label({style_class: 'syncbeacon-row-status',
        x_expand: !withDetail, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER});
    line.add_child(dot);
    line.add_child(nameLabel);

    let detail = null;
    if (withDetail) {
        // Status and detail stay in the layout (hidden by opacity), so the
        // cell keeps its width and hover state while they swap. BinLayout
        // centres children that do not fill it, so each fills the cell in a
        // box whose spacer pushes it to the right edge.
        detail = makeDetail();
        detail.actor.opacity = 0;
        const cell = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        // The detail text ends where the status text ends: the cell is drawn
        // (and hovered) shifted right by the detail's padding, the status
        // shifted back. Translation leaves the layout alone; negative margins
        // break the popup's size.
        const statusBox = alignEnd(status);
        cell.add_child(statusBox);
        cell.add_child(alignEnd(detail.actor));
        detail.actor.connect('style-changed', () => {
            const shift = detail.actor.get_theme_node().get_padding(St.Side.RIGHT);
            cell.translation_x = shift;
            statusBox.translation_x = -shift;
        });
        cell.connect('notify::hover', () => {
            status.opacity = cell.hover ? 0 : 255;
            detail.actor.opacity = cell.hover ? 255 : 0;
        });
        line.add_child(cell);
    } else {
        line.add_child(status);
    }

    const set = (name, text, kind, detailValue = null, actionsValue = null) => {
        dot.style_class = `syncbeacon-dot syncbeacon-dot-${kind}`;
        nameLabel.text = name;
        status.text = text;
        detail?.set(detailValue);
        actions?.set(actionsValue);
    };
    return {item, set};
}

/**
 * A list headline that pauses or resumes its area when clicked. Hovering it
 * underlines it and appends what a click does.
 *
 * @param {Function} onClick - called with the paused value to set
 * @returns {{item: PopupMenu.PopupSeparatorMenuItem, set: Function}}
 */
function headline(onClick) {
    const item = new PopupMenu.PopupSeparatorMenuItem('');
    // The label moves into a button, so only the text takes clicks; the item
    // stays non-reactive and the box stays open.
    const label = item.label;
    item.remove_child(label);
    const button = new St.Button({style_class: 'syncbeacon-headline', can_focus: true,
        child: label, y_align: Clutter.ActorAlign.CENTER});
    item.insert_child_at_index(button, 0);

    let text = '';
    let paused = false;
    const sync = () => {
        const hint = paused ? 'Click to resume' : 'Click to pause';
        label.text = button.hover && button.reactive ? `${text} [${hint}]` : text;
        button.accessible_name = `${text}, ${hint.toLowerCase()}`;
    };
    button.connect('notify::hover', sync);
    button.connect('clicked', () => onClick(!paused));

    const set = (value, isPaused, enabled) => {
        text = value;
        paused = isPaused;
        button.reactive = enabled;
        button.can_focus = enabled;
        sync();
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
     *   setPaused(area, bool), refresh(), setInfoBoxOpen(bool), openPreferences(),
     *   openFolder(path), rescanFolder(id) and editIgnores(path)
     */
    constructor(sourceActor, controller) {
        super(sourceActor, 0.5, St.Side.TOP);
        this.actor.add_style_class_name('panel-menu');
        this.actor.add_style_class_name('syncbeacon-infobox');
        this._controller = controller;

        // Top bar, on a darker band: Open UI on the left, the header (local
        // device name and short state) in the middle, Settings on the right.
        const actions = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
            style_class: 'syncbeacon-actions'});

        const openButton = iconButton(this._extensionIcon('syncbeacon-syncthing.svg'),
            'Open Syncthing');
        openButton.connect('clicked', () => {
            this.close();
            this._controller.openWindow();
        });
        actions.add_child(openButton);

        // Header: name and short state, centred and wrapped when long. It
        // takes the free space between the two equally wide buttons, so it
        // sits in the middle of the box.
        const header = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'syncbeacon-header', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._title = new St.Label({style_class: 'syncbeacon-header-title',
            x_align: Clutter.ActorAlign.CENTER});
        this._message = new St.Label({style_class: 'syncbeacon-header-message',
            x_align: Clutter.ActorAlign.CENTER});
        this._message.clutter_text.line_wrap = true;
        this._message.clutter_text.line_alignment = Pango.Alignment.CENTER;
        header.add_child(this._title);
        header.add_child(this._message);
        actions.add_child(header);

        const settingsButton = iconButton(new Gio.ThemedIcon({name: 'emblem-system-symbolic'}),
            'Settings');
        settingsButton.connect('clicked', () => {
            this.close();
            this._controller.openPreferences();
        });
        actions.add_child(settingsButton);
        this.addMenuItem(actions);

        // Folders, then devices, rebuilt when the set of devices or folders
        // changes and updated in place otherwise, so a hovered row stays.
        this._lists = new PopupMenu.PopupMenuSection();
        this._listKey = null;
        this.addMenuItem(this._lists);

        // Fetch a fresh status whenever the box opens; poll faster while it
        // is open.
        this.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._controller.refresh();
            this._controller.setInfoBoxOpen(open);
        });
    }

    _extensionIcon(name) {
        return new Gio.FileIcon({
            file: Gio.File.new_for_path(GLib.build_filenamev([this._controller.path, 'icons', name])),
        });
    }

    /**
     * @param {object|null} status - from deriveStatus(), or null before the first update
     */
    update(status) {
        const state = status?.state ?? State.ERROR;
        this._title.text = status ? status.myName || STATE_LABELS[state] : 'Connecting…';
        this._title.style_class = `syncbeacon-header-title syncbeacon-state-${state}`;
        // The short state under the name; not repeated when it is the title.
        this._message.text = STATE_LABELS[state];
        this._message.visible = !!status?.myName;

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

        // Pause and resume need Syncthing and something to act on.
        this._foldersHeading.set(status.foldersPaused
            ? `Folders (${status.foldersTotal}, Paused)` : `Folders (${status.foldersTotal})`,
        status.foldersPaused, status.reachable && status.foldersTotal > 0);
        this._devicesHeading.set(status.devicesPaused
            ? `Devices (${status.peersTotal}, Paused)`
            : `Devices (${status.peersConnected}/${status.peersTotal} online)`,
        status.devicesPaused, status.reachable && status.peersTotal > 0);
        status.devices.forEach((dev, i) =>
            this._deviceRows[i].set(dev.name, dev.text, dev.status, dev.detail));
        status.folders.forEach((folder, i) =>
            this._folderRows[i].set(folder.label, folder.text, folder.status, folder.detail, folder));
    }

    _buildLists(status) {
        this._lists.removeAll();
        this._foldersHeading = headline(paused => this._controller.setPaused('folders', paused));
        this._lists.addMenuItem(this._foldersHeading.item);
        if (status.folders.length === 0)
            this._addPlaceholder('No folders');
        this._folderRows = status.folders.map(() => this._addRow(rowDetail, () => folderActions(this)));

        this._devicesHeading = headline(paused => this._controller.setPaused('devices', paused));
        this._lists.addMenuItem(this._devicesHeading.item);
        if (status.devices.length === 0)
            this._addPlaceholder('No remote devices');
        this._deviceRows = status.devices.map(() => this._addRow(rowDetail));
    }

    _addRow(makeDetail = null, makeActions = null) {
        const row = statusRow(makeDetail, makeActions);
        this._lists.addMenuItem(row.item);
        return row;
    }

    _addPlaceholder(text) {
        this._addRow().set(text, '', 'offline');
    }
}
