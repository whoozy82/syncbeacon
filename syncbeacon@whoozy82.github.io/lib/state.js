// Pure state derivation: snapshot -> Status.
// No gi:// imports, so this module can be unit-tested outside the shell.

export const State = Object.freeze({
    IN_SYNC: 'in-sync',
    SYNCING: 'syncing',
    FOLDER_ISSUE: 'folder-issue',
    PAUSED: 'paused',
    ERROR: 'error',
});

export const STATE_LABELS = Object.freeze({
    [State.IN_SYNC]: 'In Sync',
    [State.SYNCING]: 'Synchronising…',
    [State.FOLDER_ISSUE]: 'Folder sync error or conflicts',
    [State.PAUSED]: 'Paused',
    [State.ERROR]: 'Error with Syncthing',
});

// Row status kinds, used by the info box for the coloured dot.
export const Row = Object.freeze({
    OK: 'ok',
    SYNCING: 'syncing',
    PAUSED: 'paused',
    OFFLINE: 'offline',
    WARNING: 'warning',
    ERROR: 'error',
});

const DOWNLOADING_STATES = new Set(['sync-preparing', 'syncing']);

const FOLDER_STATE_TEXT = {
    'scanning': 'Scanning',
    'scan-waiting': 'Waiting to scan',
    'sync-waiting': 'Waiting to sync',
    'sync-preparing': 'Preparing to sync',
    'cleaning': 'Cleaning up',
    'clean-waiting': 'Waiting to clean up',
};

/**
 * An empty snapshot, as produced before the first successful request.
 *
 * @returns {object}
 */
export function emptySnapshot() {
    return {
        reachable: false,
        authFailed: false,
        connError: '',
        unitActive: null, // null: unknown or no unit found
        myID: '',
        myName: '', // name of the local device
        devices: [], // [{id, name, paused}] without the local device
        folders: [], // [{id, label, path, paused}]
        connections: {}, // id -> {connected, paused}
        completion: {}, // device id -> overall completion in %
        rates: {}, // device id -> {down, up} in bytes/s, while the info box samples them
        lastSeen: {}, // device id -> ISO time of the last connection
        lastScan: {}, // folder id -> ISO time of the last completed scan
        folderStatus: {}, // folder id -> /rest/db/status object
        systemErrors: [], // [string]
        conflicts: {}, // folder id -> count, or null if the check is unavailable
    };
}

function percent(value) {
    return `${Math.floor(value)} %`;
}

/**
 * A transfer rate, e.g. "340 B/s", "1.2 MB/s", "56 kB/s".
 *
 * @param {number} bytesPerSec
 * @returns {string}
 */
export function formatRate(bytesPerSec) {
    if (bytesPerSec < 999.5)
        return `${Math.round(bytesPerSec)} B/s`;
    const units = ['kB/s', 'MB/s', 'GB/s'];
    let value = bytesPerSec / 1000;
    let i = 0;
    while (value >= 999.5 && i < units.length - 1) {
        value /= 1000;
        i++;
    }
    return `${value < 9.95 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/**
 * A time in local time without the year, e.g. "18.10. 14:32". Syncthing
 * reports the Unix epoch for a device it has never seen or a folder it has
 * never scanned, which yields the fallback.
 *
 * @param {string|undefined} iso
 * @param {string} fallback
 * @returns {string}
 */
export function formatTime(iso, fallback) {
    const t = Date.parse(iso ?? '');
    if (!Number.isFinite(t) || t < 24 * 3600 * 1000)
        return fallback;
    const d = new Date(t);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rateDetail(rate) {
    return {
        kind: 'rates',
        down: formatRate(rate?.down ?? 0),
        up: formatRate(rate?.up ?? 0),
    };
}

function folderPercent(st) {
    if (!st?.globalBytes)
        return 0;
    return Math.min(100, 100 * (st.inSyncBytes ?? 0) / st.globalBytes);
}

function deviceRow(dev, snap) {
    const conn = snap.connections[dev.id] ?? {};
    const completion = snap.completion[dev.id] ?? 100;
    const paused = dev.paused || conn.paused;
    let status, text;
    if (paused) {
        status = Row.PAUSED;
        text = 'Paused';
    } else if (!conn.connected) {
        status = Row.OFFLINE;
        text = 'Disconnected';
    } else if (completion < 100) {
        status = Row.SYNCING;
        text = `Syncing ${percent(completion)}`;
    } else {
        status = Row.OK;
        text = 'Connected';
    }
    const online = !paused && !!conn.connected;
    // Shown on hover: the rates while connected, otherwise when it was last seen.
    const detail = online
        ? rateDetail(snap.rates?.[dev.id])
        : {kind: 'last-seen', text: formatTime(snap.lastSeen?.[dev.id], 'Never seen')};
    return {id: dev.id, name: dev.name || dev.id.slice(0, 7), status, text, detail,
        online, paused: !!paused, completion};
}

function folderRow(folder, snap) {
    const st = snap.folderStatus[folder.id] ?? {};
    const conflicts = snap.conflicts[folder.id];
    const pullErrors = st.pullErrors ?? 0;
    const issues = [];
    let status = Row.OK;
    let text;

    if (folder.paused || st.state === 'paused') {
        status = Row.PAUSED;
        text = 'Paused';
    } else if (st.state === 'error' || st.error) {
        status = Row.ERROR;
        text = st.error ? `Error: ${st.error}` : 'Error';
    } else if (DOWNLOADING_STATES.has(st.state)) {
        status = Row.SYNCING;
        text = st.state === 'syncing'
            ? `Syncing ${percent(folderPercent(st))}` : FOLDER_STATE_TEXT[st.state];
    } else if (FOLDER_STATE_TEXT[st.state]) {
        status = Row.SYNCING;
        text = FOLDER_STATE_TEXT[st.state];
    } else if (st.state === 'idle' && (st.needTotalItems ?? 0) > 0) {
        status = Row.WARNING;
        text = `Out of sync (${st.needTotalItems} items)`;
    } else {
        text = st.state ? 'Up to date' : 'Unknown';
    }

    if (pullErrors > 0)
        issues.push(`${pullErrors} failed ${pullErrors === 1 ? 'item' : 'items'}`);
    if (conflicts > 0)
        issues.push(`${conflicts} ${conflicts === 1 ? 'conflict' : 'conflicts'}`);
    if (issues.length > 0) {
        if (status !== Row.ERROR)
            status = Row.WARNING;
        text = [text, ...issues].join(' · ');
    }
    if (conflicts === null)
        text += ' · conflict check unavailable';

    const hasIssue = st.state === 'error' || !!st.error || pullErrors > 0 || conflicts > 0;
    // Shown on hover: when the folder was last scanned.
    const detail = {kind: 'last-scan', text: formatTime(snap.lastScan?.[folder.id], 'Never scanned')};
    return {id: folder.id, label: folder.label || folder.id, path: folder.path,
        paused: folder.paused, status, text, detail, hasIssue, downloading: !folder.paused && DOWNLOADING_STATES.has(st.state),
        issueSummary: issues.length ? `${folder.label || folder.id}: ${issues.join(', ')}` : null};
}

function errorMessage(snap) {
    if (snap.unitActive === false)
        return 'Syncthing service stopped';
    if (!snap.reachable) {
        if (snap.authFailed)
            return 'API key rejected';
        return snap.connError || 'Connecting to Syncthing…';
    }
    if (snap.systemErrors.length > 0)
        return snap.systemErrors[0];
    return null;
}

/**
 * Derive the panel status from a snapshot.
 * Rules, highest priority first: error, folder-issue, paused, syncing, in-sync.
 *
 * @param {object} snap - see emptySnapshot()
 * @returns {object} status
 */
export function deriveStatus(snap) {
    const devices = snap.devices.map(d => deviceRow(d, snap))
        .sort((a, b) => a.name.localeCompare(b.name));
    const folders = snap.folders.map(f => folderRow(f, snap))
        .sort((a, b) => a.label.localeCompare(b.label));

    const peersConnected = devices.filter(d => d.online).length;
    const base = {
        reachable: snap.reachable,
        myName: snap.myName,
        peersConnected,
        peersTotal: devices.length,
        foldersTotal: folders.length,
        devices,
        folders,
    };

    const error = errorMessage(snap);
    if (error !== null)
        return {...base, state: State.ERROR, message: error};

    const issueFolders = folders.filter(f => f.hasIssue);
    if (issueFolders.length > 0) {
        const message = issueFolders.map(f => f.issueSummary ?? `${f.label}: error`).join('\n');
        return {...base, state: State.FOLDER_ISSUE, message};
    }

    // A paused device is disconnected by Syncthing, so "all online devices
    // paused" means: some device is paused and no unpaused device is connected.
    if (devices.some(d => d.paused) && peersConnected === 0)
        return {...base, state: State.PAUSED, message: 'All devices paused'};

    const syncingDevices = devices.filter(d => d.online && d.completion < 100);
    const downloading = folders.filter(f => f.downloading);
    if (syncingDevices.length > 0 || downloading.length > 0) {
        const names = [...syncingDevices.map(d => d.name), ...downloading.map(f => f.label)];
        return {...base, state: State.SYNCING, message: `Syncing: ${names.join(', ')}`};
    }

    return {
        ...base,
        state: State.IN_SYNC,
        message: peersConnected === 0 ? 'No devices online' : 'All online devices up to date',
    };
}

/**
 * Text shown next to the panel icon, e.g. "3/5 · 5".
 *
 * @param {object} status
 * @returns {string}
 */
export function countsText(status) {
    return `${status.peersConnected}/${status.peersTotal} · ${status.foldersTotal}`;
}

/**
 * Whether a path names a Syncthing conflict copy.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isConflictPath(path) {
    return /\.sync-conflict-\d{8}-\d{6}-[A-Z0-9]{7}/.test(path);
}
