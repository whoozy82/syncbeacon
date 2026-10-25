// Info box: a popup with the actions (Open UI, Settings) and the
// state on top, a block per folder another device offers, then every folder and peer with its status, stacked or side
// by side; hovering a list headline shows its Pause/Resume button. A wand
// in the bottom right corner switches all hover functions on or off.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {_, N_} from '../lib/i18n.js';
import {State, STATE_LABELS} from '../lib/state.js';

// Auto layout: folders and devices side by side from this many entries on.
const AUTO_HORIZONTAL_MIN = 10;

// The box is at most this share of its monitor's height; the lists scroll.
const MAX_HEIGHT_SHARE = 0.6;

// Accessible names of the headline button: [pause, resume].
const HEADLINE_ACTIONS = {
    folders: [N_('infobox.pause-folders'), N_('infobox.resume-folders')],
    devices: [N_('infobox.pause-devices'), N_('infobox.resume-devices')],
};

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
 * The framed box of round buttons shown when hovering a row's name.
 * addButtons(button) adds the buttons via button(icon, accessibleName,
 * onClick) and returns sync(item, shown), which updates them for the row's
 * folder or device and whether the box is shown.
 *
 * @param {Function} addButtons
 * @returns {{actor: St.BoxLayout, set: Function, setShown: Function}}
 */
function rowActions(addButtons) {
    const actor = new St.BoxLayout({style_class: 'syncbeacon-row-detail syncbeacon-folder-actions',
        x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.CENTER});
    let item = null;
    let shown = false;

    const button = (icon, accessibleName, onClick) => {
        const b = new St.Button({style_class: 'syncbeacon-folder-action',
            accessible_name: accessibleName, child: new St.Icon(icon),
            y_align: Clutter.ActorAlign.CENTER});
        b.connect('clicked', () => item && onClick(item));
        actor.add_child(b);
        return b;
    };
    const sync = addButtons(button);
    const set = value => {
        item = value;
        sync(item, shown);
    };
    const setShown = value => {
        shown = value;
        sync(item, shown);
    };
    return {actor, set, setShown};
}

/**
 * Show ⏸ on a pause button while running and ▶ while paused.
 *
 * @param {St.Button} button
 * @param {boolean} paused
 * @param {string[]} names - accessible names [pause, resume]
 */
function syncPauseButton(button, paused, names) {
    button.child.icon_name = paused ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic';
    button.accessible_name = _(names[paused ? 1 : 0]);
}

const FOLDER_PAUSE_NAMES = [N_('infobox.folder.pause'), N_('infobox.folder.resume')];
const DEVICE_PAUSE_NAMES = [N_('infobox.device.pause'), N_('infobox.device.resume')];

/**
 * The folder actions shown when hovering the folder's name: Open Folder,
 * Pause/Resume, Rescan and Edit Ignore List.
 *
 * @param {InfoBox} infoBox
 * @returns {{actor: St.BoxLayout, set: Function, setShown: Function}}
 */
function folderActions(infoBox) {
    const controller = infoBox._controller;
    return rowActions(button => {
        const open = button({icon_name: 'folder-open-symbolic'}, _('infobox.folder.open'), f => {
            infoBox.close();
            controller.openFolder(f.path);
        });
        // Stays open so the paused state shows up in place.
        const pause = button({icon_name: 'media-playback-pause-symbolic'}, _(FOLDER_PAUSE_NAMES[0]),
            f => controller.setFolderPaused(f.id, !f.paused));
        // Stays open so the scan state shows up in place.
        const rescan = button({icon_name: 'view-refresh-symbolic'}, _('infobox.folder.rescan'),
            f => controller.rescanFolder(f.id));
        const ignores = button({gicon: infoBox._extensionIcon('syncbeacon-ignore-symbolic.svg')}, _('infobox.folder.edit-ignores'), f => {
            infoBox.close();
            controller.editIgnores(f.path);
        });

        // The buttons take clicks only while shown, never through the name.
        return (folder, shown) => {
            open.reactive = shown;
            ignores.reactive = shown;
            rescan.reactive = shown && !folder?.paused;
            rescan.opacity = folder?.paused ? 128 : 255;
            pause.reactive = shown;
            syncPauseButton(pause, !!folder?.paused, FOLDER_PAUSE_NAMES);
        };
    });
}

/**
 * The device actions shown when hovering the device's name: Pause/Resume.
 *
 * @param {InfoBox} infoBox
 * @returns {{actor: St.BoxLayout, set: Function, setShown: Function}}
 */
function deviceActions(infoBox) {
    const controller = infoBox._controller;
    return rowActions(button => {
        // Stays open so the paused state shows up in place.
        const pause = button({icon_name: 'media-playback-pause-symbolic'}, _(DEVICE_PAUSE_NAMES[0]),
            d => controller.setDevicePaused(d.id, !d.paused));
        return (device, shown) => {
            pause.reactive = shown;
            syncPauseButton(pause, !!device?.paused, DEVICE_PAUSE_NAMES);
        };
    });
}

/**
 * The name, swapped for the row actions while hovered. Both stay in the
 * layout (hidden by opacity), so the cell is as wide as the wider of the two
 * and the row does not shift when they swap. BinLayout centres children that
 * do not fill it, so each fills the cell in a box that keeps it at the left.
 *
 * @param {St.Label} nameLabel
 * @param {{actor: St.BoxLayout, setShown: Function}} actions
 * @param {object} hover - InfoBox._hover: {enabled, syncs}
 */
function nameCell(nameLabel, actions, hover) {
    actions.actor.opacity = 0;
    const cell = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    cell.add_child(alignStart(nameLabel));
    cell.add_child(alignStart(actions.actor));
    const sync = () => {
        const shown = cell.hover && hover.enabled;
        nameLabel.opacity = shown ? 0 : 255;
        actions.actor.opacity = shown ? 255 : 0;
        actions.setShown(shown);
    };
    cell.connect('notify::hover', sync);
    hover.syncs.push(sync);
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

/** Wrap actor in a box that fills its parent and keeps actor at the left. */
function alignStart(actor) {
    const box = new St.BoxLayout({x_expand: true, x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.CENTER});
    box.add_child(actor);
    box.add_child(new St.Widget({x_expand: true}));
    return box;
}

/**
 * A row with a coloured dot, a name and a status. With makeDetail, hovering
 * the status swaps it for the row detail on a darker background. With
 * makeActions, hovering the name swaps it for the folder or device actions.
 *
 * @param {object} hover - InfoBox._hover: {enabled, syncs}
 * @param {Function|null} makeDetail - returns {actor, set}
 * @param {Function|null} makeActions - returns {actor, set, setShown}
 * @returns {{item: PopupMenu.PopupBaseMenuItem, set: Function}}
 */
function statusRow(hover, makeDetail = null, makeActions = null) {
    const withDetail = !!makeDetail;
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
        style_class: 'syncbeacon-row'});
    const actions = makeActions?.();
    const dot = new St.Widget({y_align: Clutter.ActorAlign.CENTER});
    const nameLabel = new St.Label({style_class: 'syncbeacon-row-name',
        y_align: Clutter.ActorAlign.CENTER});
    const status = new St.Label({style_class: 'syncbeacon-row-status',
        x_expand: !withDetail, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER});
    item.add_child(dot);
    item.add_child(actions ? nameCell(nameLabel, actions, hover) : nameLabel);

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
        const sync = () => {
            const shown = cell.hover && hover.enabled;
            status.opacity = shown ? 0 : 255;
            detail.actor.opacity = shown ? 255 : 0;
        };
        cell.connect('notify::hover', sync);
        hover.syncs.push(sync);
        item.add_child(cell);
    } else {
        item.add_child(status);
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
 * A list headline. Hovering its text swaps it for a button that pauses or
 * resumes the area, the same way as a folder name and its actions.
 *
 * @param {object} hover - InfoBox._hover: {enabled, syncs}
 * @param {string} area - 'folders' or 'devices'
 * @param {Function} onClick - called with the paused value to set
 * @returns {{item: PopupMenu.PopupSeparatorMenuItem, set: Function}}
 */
function headline(hover, area, onClick) {
    const item = new PopupMenu.PopupSeparatorMenuItem('');
    // The label moves into a cell with the button, so only the text takes
    // hover and clicks; the item stays non-reactive and the box stays open.
    const label = item.label;
    item.remove_child(label);

    const icon = new St.Icon();
    const button = new St.Button({style_class: 'syncbeacon-folder-action',
        can_focus: true, child: icon, y_align: Clutter.ActorAlign.CENTER});
    button.connect('clicked', () => onClick(!paused));
    const actions = new St.BoxLayout({style_class: 'syncbeacon-row-detail syncbeacon-folder-actions',
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    actions.add_child(button);

    // As in nameCell, but the button is centred over the text (BinLayout
    // centres it); expanding is set explicitly, so the filling box of the
    // label does not take the space of the separator line.
    const cell = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        track_hover: true,
        x_expand: false,
        y_align: Clutter.ActorAlign.CENTER,
    });
    cell.add_child(alignStart(label));
    cell.add_child(actions);
    item.insert_child_at_index(cell, 0);

    let paused = false;
    let enabled = false;
    const sync = () => {
        const shown = cell.hover && enabled && hover.enabled;
        label.opacity = shown ? 0 : 255;
        actions.opacity = shown ? 255 : 0;
        button.reactive = shown;
    };
    cell.connect('notify::hover', sync);
    hover.syncs.push(sync);

    const set = (value, isPaused, isEnabled) => {
        label.text = value;
        paused = isPaused;
        enabled = isEnabled;
        icon.icon_name = paused ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic';
        button.accessible_name = _(HEADLINE_ACTIONS[area][paused ? 1 : 0]);
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
     *   openFolder(path), rescanFolder(id), editIgnores(path),
     *   setFolderPaused(id, bool), setDevicePaused(id, bool) and getSettings()
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
            _('infobox.open-syncthing'));
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
            _('common.settings'));
        settingsButton.connect('clicked', () => {
            this.close();
            this._controller.openPreferences();
        });
        actions.add_child(settingsButton);
        this.addMenuItem(actions);

        // Folders other devices offer to share, one block each, below the
        // top bar; Check opens the Syncthing window to accept or decline.
        this._pending = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'syncbeacon-pending-list', visible: false});
        this.box.add_child(this._pending);
        this._pendingKey = null;

        // Folders, then devices, each in its own column: stacked or side by
        // side, depending on the orientation of the box. Rebuilt when the set
        // of devices or folders changes and updated in place otherwise, so a
        // hovered row stays.
        // Whether hovering a row or headline shows its detail or buttons;
        // syncs re-applies it to every cell of the current lists.
        this._settings = controller.getSettings();
        this._hover = {enabled: this._settings.get_boolean('hover-functions'), syncs: []};

        this._lists = new St.BoxLayout({x_expand: true});
        this._foldersColumn = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'syncbeacon-folders-column', x_expand: true});
        this._devicesColumn = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'syncbeacon-devices-column', x_expand: true});
        this._lists.add_child(this._foldersColumn);
        this._lists.add_child(this._devicesColumn);
        // The lists scroll without a scrollbar once the box reaches its
        // maximum height; the top bar and the footer always stay visible.
        // EXTERNAL rather than NEVER, so the view may get smaller than its content.
        this._scroll = new St.ScrollView({style_class: 'vfade', child: this._lists,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.EXTERNAL});
        this.box.add_child(this._scroll);
        this._listKey = null;
        this._entryCount = 0;

        // Footer: the wand that switches the hover functions on or off, in
        // the bottom right corner. The box stays open. A chevron in the middle
        // shows while the lists go on below the bottom edge. BinLayout only
        // aligns a child that has x_expand.
        const footer = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
            style_class: 'syncbeacon-footer'});
        const footerBin = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
        this._moreBelow = new St.Icon({icon_name: 'pan-down-symbolic', style_class: 'syncbeacon-more-below',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, visible: false});
        footerBin.add_child(this._moreBelow);
        this._hoverToggle = new St.Button({style_class: 'syncbeacon-folder-action syncbeacon-hover-toggle',
            can_focus: true, x_expand: true, x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({gicon: this._extensionIcon('syncbeacon-magic-symbolic.svg')})});
        this._hoverToggle.connect('clicked', () =>
            this._settings.set_boolean('hover-functions', !this._hover.enabled));
        footerBin.add_child(this._hoverToggle);
        footer.add_child(footerBin);
        this.addMenuItem(footer);

        this._scroll.vadjustment.connectObject(
            'changed', () => this._syncMoreBelow(),
            'notify::value', () => this._syncMoreBelow(),
            this);
        this._settings.connectObject(
            'changed::layout-orientation', () => this._syncOrientation(),
            'changed::hover-functions', () => this._syncHover(),
            this);
        Main.layoutManager.connectObject('monitors-changed', () => this._syncMaxHeight(), this);
        this._syncOrientation();
        this._syncHover();

        // Fetch a fresh status whenever the box opens; poll faster while it
        // is open.
        this.connect('open-state-changed', (_menu, open) => {
            if (open) {
                this._syncMaxHeight();
                this._controller.refresh();
            }
            this._controller.setInfoBoxOpen(open);
        });
    }

    // Monitor geometry is in physical pixels, CSS in logical ones.
    _syncMaxHeight() {
        const monitor = Main.layoutManager.monitors[Main.layoutManager.findIndexForActor(this.sourceActor)] ??
            Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.actor.style = `max-height: ${Math.round(monitor.height * MAX_HEIGHT_SHARE / scaleFactor)}px;`;
    }

    _syncMoreBelow() {
        const {value, upper, page_size: pageSize} = this._scroll.vadjustment;
        this._moreBelow.visible = value + pageSize < upper - 1;
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
        this._title.text = status ? status.myName || _(STATE_LABELS[state]) : _('common.connecting');
        this._title.style_class = `syncbeacon-header-title syncbeacon-state-${state}`;
        // The short state under the name; not repeated when it is the title.
        this._message.text = _(STATE_LABELS[state]);
        this._message.visible = !!status?.myName;

        this._syncPending(status?.pendingFolders ?? []);

        if (!status) {
            this._clearLists();
            this._listKey = null;
            return;
        }

        const key = JSON.stringify([status.devices.map(d => d.id), status.folders.map(f => f.id)]);
        if (key !== this._listKey) {
            this._listKey = key;
            this._buildLists(status);
        }
        this._entryCount = status.folders.length + status.devices.length;
        this._syncOrientation();

        // Pause and resume need Syncthing and something to act on.
        this._foldersHeading.set(status.foldersPaused
            ? _('infobox.folders-paused', {count: status.foldersTotal})
            : _('infobox.folders', {count: status.foldersTotal}),
        status.foldersPaused, status.reachable && status.foldersTotal > 0);
        this._devicesHeading.set(status.devicesPaused
            ? _('infobox.devices-paused', {count: status.peersTotal})
            : _('infobox.devices', {online: status.peersConnected, count: status.peersTotal}),
        status.devicesPaused, status.reachable && status.peersTotal > 0);
        status.devices.forEach((dev, i) =>
            this._deviceRows[i].set(dev.name, dev.text, dev.status, dev.detail, dev));
        status.folders.forEach((folder, i) =>
            this._folderRows[i].set(folder.label, folder.text, folder.status, folder.detail, folder));
    }

    _syncPending(requests) {
        const key = JSON.stringify(requests);
        if (key === this._pendingKey)
            return;
        this._pendingKey = key;
        this._pending.destroy_all_children();
        for (const req of requests) {
            const block = new St.BoxLayout({style_class: 'syncbeacon-pending-request'});
            block.add_child(new St.Icon({icon_name: 'folder-symbolic', style_class: 'syncbeacon-pending-icon',
                y_align: Clutter.ActorAlign.CENTER}));
            // One line, e.g. "New folder [Test] from [Zenfone]": the
            // translated sentence split at its placeholders, the names on a
            // darker background.
            const names = {folder: req.label, device: req.deviceName};
            const text = new St.BoxLayout({style_class: 'syncbeacon-pending-text',
                x_expand: true, y_align: Clutter.ActorAlign.CENTER});
            for (const part of _('infobox.pending-request').split(/(\{\w+\})/)) {
                const name = names[part.slice(1, -1)];
                if (name !== undefined) {
                    text.add_child(new St.Label({style_class: 'syncbeacon-pending-name', text: name,
                        y_align: Clutter.ActorAlign.CENTER}));
                } else if (part.trim()) {
                    text.add_child(new St.Label({text: part.trim(), y_align: Clutter.ActorAlign.CENTER}));
                }
            }
            block.add_child(text);
            const check = new St.Button({style_class: 'button syncbeacon-pending-check',
                label: _('infobox.pending-check'), can_focus: true, y_align: Clutter.ActorAlign.CENTER});
            check.connect('clicked', () => {
                this.close();
                this._controller.openWindow();
            });
            block.add_child(check);
            this._pending.add_child(block);
        }
        this._pending.visible = requests.length > 0;
    }

    _syncOrientation() {
        const mode = this._settings.get_string('layout-orientation');
        const horizontal = mode === 'horizontal' ||
            (mode === 'auto' && this._entryCount >= AUTO_HORIZONTAL_MIN);
        this._lists.orientation = horizontal
            ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;
        // Side by side, both columns get the same width.
        this._lists.layout_manager.homogeneous = horizontal;
        this._lists.style_class = horizontal ? 'syncbeacon-lists-horizontal' : '';
    }

    _syncHover() {
        const enabled = this._settings.get_boolean('hover-functions');
        this._hover.enabled = enabled;
        if (enabled)
            this._hoverToggle.remove_style_class_name('syncbeacon-hover-toggle-off');
        else
            this._hoverToggle.add_style_class_name('syncbeacon-hover-toggle-off');
        this._hoverToggle.accessible_name = enabled
            ? _('infobox.hover-disable') : _('infobox.hover-enable');
        this._hover.syncs.forEach(sync => sync());
    }

    _clearLists() {
        this._hover.syncs = [];
        this._foldersColumn.destroy_all_children();
        this._devicesColumn.destroy_all_children();
        this._entryCount = 0;
        this._syncOrientation();
    }

    _buildLists(status) {
        this._clearLists();
        const folders = this._foldersColumn;
        this._foldersHeading = headline(this._hover, 'folders', paused => this._controller.setPaused('folders', paused));
        folders.add_child(this._foldersHeading.item);
        if (status.folders.length === 0)
            this._addPlaceholder(folders, _('infobox.no-folders'));
        this._folderRows = status.folders.map(() =>
            this._addRow(folders, rowDetail, () => folderActions(this)));

        const devices = this._devicesColumn;
        this._devicesHeading = headline(this._hover, 'devices', paused => this._controller.setPaused('devices', paused));
        devices.add_child(this._devicesHeading.item);
        if (status.devices.length === 0)
            this._addPlaceholder(devices, _('infobox.no-devices'));
        this._deviceRows = status.devices.map(() =>
            this._addRow(devices, rowDetail, () => deviceActions(this)));
    }

    _addRow(column, makeDetail = null, makeActions = null) {
        const row = statusRow(this._hover, makeDetail, makeActions);
        column.add_child(row.item);
        return row;
    }

    _addPlaceholder(column, text) {
        this._addRow(column).set(text, '', 'offline');
    }

    destroy() {
        this._scroll.vadjustment.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._settings = null;
        Main.layoutManager.disconnectObject(this);
        super.destroy();
    }
}
