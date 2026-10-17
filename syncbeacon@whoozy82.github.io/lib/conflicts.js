// Conflict detection. Syncthing has no API for conflict copies, so the folders
// are searched with `find` in a subprocess, keeping file-system work out of
// the gnome-shell process.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {isCancelled} from './client.js';
import {isConflictPath} from './state.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

const RESCAN_INTERVAL_S = 10 * 60;
const SCAN_TIMEOUT_S = 30;
const HINT_DELAY_MS = 5000;

export class ConflictScanner {
    /**
     * @param {Function} onChange - called when any count changes
     */
    constructor(onChange) {
        this._onChange = onChange;
        this._find = GLib.find_program_in_path('find');
        this._folders = new Map(); // id -> path
        this._counts = {};
        this._queue = [];
        this._running = false;
        this._cancellable = new Gio.Cancellable();
        this._intervalId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, RESCAN_INTERVAL_S, () => {
            this.scanAll();
            return GLib.SOURCE_CONTINUE;
        });
        this._hintIds = new Map(); // folder id -> timeout id
    }

    /** folder id -> number of conflict files, or null if unavailable */
    get counts() {
        return this._counts;
    }

    /**
     * Update the folder list; new or moved folders are scanned.
     *
     * @param {{id: string, path: string}[]} folders
     */
    setFolders(folders) {
        const next = new Map(folders.map(f => [f.id, f.path]));
        for (const id of [...Object.keys(this._counts)]) {
            if (!next.has(id))
                delete this._counts[id];
        }
        const changed = [...next].filter(([id, path]) => this._folders.get(id) !== path).map(([id]) => id);
        this._folders = next;
        changed.forEach(id => this._enqueue(id));
    }

    scanAll() {
        [...this._folders.keys()].forEach(id => this._enqueue(id));
    }

    /**
     * An event mentioned a conflict file in this folder; rescan it soon.
     * Debounced so a burst of events causes one scan.
     *
     * @param {string} folderId
     */
    hint(folderId) {
        if (!this._folders.has(folderId) || this._hintIds.has(folderId))
            return;
        this._hintIds.set(folderId, GLib.timeout_add(GLib.PRIORITY_LOW, HINT_DELAY_MS, () => {
            this._hintIds.delete(folderId);
            this._enqueue(folderId);
            return GLib.SOURCE_REMOVE;
        }));
    }

    destroy() {
        this._cancellable.cancel();
        GLib.source_remove(this._intervalId);
        this._hintIds.forEach(id => GLib.source_remove(id));
        this._hintIds.clear();
        this._queue = [];
        this._onChange = null;
    }

    _enqueue(id) {
        if (!this._queue.includes(id))
            this._queue.push(id);
        if (!this._running)
            this._drain().catch(e => console.error(`Syncbeacon: conflict scan failed: ${e}`));
    }

    async _drain() {
        this._running = true;
        try {
            while (this._queue.length > 0 && !this._cancellable.is_cancelled()) {
                const id = this._queue.shift();
                const path = this._folders.get(id);
                if (path === undefined)
                    continue;
                const count = await this._scan(path);
                if (count === undefined || !this._folders.has(id))
                    continue;
                if (this._counts[id] !== count) {
                    this._counts[id] = count;
                    this._onChange?.();
                }
            }
        } finally {
            this._running = false;
        }
    }

    /**
     * @param {string} path
     * @returns {Promise<number|null|undefined>} count, null if unavailable,
     *   undefined if the scan timed out or was cancelled (keep the old value)
     */
    async _scan(path) {
        if (!this._find)
            return null;
        if (!GLib.file_test(path, GLib.FileTest.IS_DIR))
            return null;

        const proc = Gio.Subprocess.new([
            this._find, path,
            '(', '-name', '.stversions', '-o', '-name', '.stfolder', ')', '-prune',
            '-o', '-type', 'f', '-name', '*.sync-conflict-*', '-print',
        ], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);

        let timedOut = false;
        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, SCAN_TIMEOUT_S, () => {
            timedOut = true;
            proc.force_exit();
            return GLib.SOURCE_REMOVE;
        });
        const cancelId = this._cancellable.connect(() => proc.force_exit());
        try {
            const [stdout] = await proc.communicate_utf8_async(null, null);
            if (timedOut || this._cancellable.is_cancelled())
                return undefined;
            const files = (stdout ?? '').split('\n').filter(line => line && isConflictPath(line));
            // find exits non-zero if some subdirectory was unreadable; the
            // files it did find still count.
            return files.length;
        } catch (e) {
            if (isCancelled(e))
                return undefined;
            return null;
        } finally {
            if (!timedOut)
                GLib.source_remove(timeoutId);
            this._cancellable.disconnect(cancelId);
        }
    }
}
