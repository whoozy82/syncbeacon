// Panel button: state icon and counts. Left click toggles the info box, left
// double click opens the Syncthing window.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {InfoBox} from './infobox.js';
import {State, countsText} from '../lib/state.js';

function doubleClickTimeMs() {
    return Clutter.Settings.get_default().double_click_time;
}

export const Indicator = GObject.registerClass(
class SyncbeaconIndicator extends PanelMenu.Button {
    /**
     * @param {object} controller - the extension; provides path, openWindow(),
     *   setPaused(area, bool), refresh(), setInfoBoxOpen(bool) and openPreferences()
     */
    _init(controller) {
        // No menu of its own: the info box is the only popup.
        super._init(0.5, 'Syncbeacon', true);
        this._controller = controller;
        this._lastPrimaryPress = 0;

        const gesture = new Clutter.ClickGesture({recognize_on_press: true});
        gesture.connect('recognize', () => this._onPress(gesture.get_button()));
        this.add_action(gesture);

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({style_class: 'system-status-icon'});
        this._label = new St.Label({text: '', style_class: 'syncbeacon-counts',
            y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        // Info box, with its own manager rather than the panel's.
        this._infoBox = new InfoBox(this, controller);
        Main.uiGroup.add_child(this._infoBox.actor);
        this._infoBox.actor.hide();
        // Connected before the manager's handler so it runs first.
        this._infoBox.actor.connect('captured-event', this._onInfoBoxEvent.bind(this));
        this._infoBox.connect('open-state-changed', (_menu, open) => {
            if (open)
                this.add_style_pseudo_class('active');
            else
                this.remove_style_pseudo_class('active');
        });
        this._infoManager = new PopupMenu.PopupMenuManager(this);
        this._infoManager.addMenu(this._infoBox);

        this.setStatus(null);
    }

    /**
     * @param {object|null} status - from deriveStatus(), or null before the first update
     */
    setStatus(status) {
        const state = status?.state ?? State.ERROR;
        const file = Gio.File.new_for_path(
            GLib.build_filenamev([this._controller.path, 'icons', `syncbeacon-${state}-symbolic.svg`]));
        this._icon.gicon = new Gio.FileIcon({file});
        this._icon.style_class = `system-status-icon syncbeacon-icon syncbeacon-state-${state}`;
        this._label.text = status ? countsText(status) : '';
        this._infoBox.update(status);
    }

    _onPress(button) {
        if (button !== Clutter.BUTTON_PRIMARY)
            return;
        const now = GLib.get_monotonic_time() / 1000;
        const isDouble = now - this._lastPrimaryPress <= doubleClickTimeMs();
        this._lastPrimaryPress = isDouble ? 0 : now;
        if (isDouble) {
            this._infoBox.close();
            this._controller.openWindow();
        } else {
            this._infoBox.toggle();
        }
    }

    // While the info box is open it holds a grab, so presses on the button
    // arrive here instead of at the click gesture. This is what makes the
    // second click of a double click work.
    _onInfoBoxEvent(_actor, event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS)
            return Clutter.EVENT_PROPAGATE;
        const target = global.stage.get_event_actor(event);
        if (!target || !this.contains(target))
            return Clutter.EVENT_PROPAGATE;
        this._onPress(event.get_button());
        return Clutter.EVENT_STOP;
    }

    _onDestroy() {
        this._infoManager.removeMenu(this._infoBox);
        this._infoBox.destroy();
        this._infoBox = null;
        super._onDestroy();
    }
});
