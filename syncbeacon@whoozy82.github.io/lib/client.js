// Syncthing REST client: initial snapshot plus /rest/events long-poll.
// Uses only Soup/Gio/GLib so that prefs.js can share the request helper.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {expandHome} from './config.js';
import {_} from './i18n.js';
import {emptySnapshot, isConflictPath} from './state.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

const EVENTS = [
    'StateChanged', 'FolderSummary', 'FolderCompletion', 'FolderErrors',
    'FolderPaused', 'FolderResumed',
    'DeviceConnected', 'DeviceDisconnected', 'DevicePaused', 'DeviceResumed',
    'ConfigSaved', 'ItemFinished', 'LocalIndexUpdated',
].join(',');

const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];
const LONG_POLL_S = 60;
const FULL_REFRESH_MS = 5 * 60 * 1000;
// poll() fetches the folder statuses no more often than this.
const FOLDER_POLL_MS = 15 * 1000;
// A rate sample older than this is not used as the base for a new rate.
const RATE_MAX_AGE_S = 10;

export class AuthError extends Error {
    constructor() {
        super('API key rejected');
        this.name = 'AuthError';
    }
}

export class HttpError extends Error {
    constructor(status, reason) {
        super(`HTTP ${status} ${reason ?? ''}`.trim());
        this.name = 'HttpError';
        this.status = status;
    }
}

class ResetSignal extends Error {}

/**
 * @param {Error} e
 * @returns {boolean}
 */
export function isCancelled(e) {
    return e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) ?? false;
}

// A request whose failure is not fatal: it yields fallback instead. Cancelling
// and a rejected API key still throw.
function orElse(promise, fallback) {
    return promise.catch(e => {
        if (isCancelled(e) || e instanceof AuthError)
            throw e;
        return fallback;
    });
}

function sleep(ms, cancellable) {
    return new Promise((resolve, reject) => {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
        cancellable.connect(() => {
            GLib.source_remove(id);
            reject(new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Cancelled'));
        });
    });
}

/**
 * Load the GUI certificate for pinning, or null if there is none.
 *
 * @param {string} certPath
 * @param {Gio.Cancellable} [cancellable]
 * @returns {Promise<Gio.TlsCertificate|null>}
 */
export async function loadPinnedCert(certPath, cancellable = null) {
    if (!certPath)
        return null;
    try {
        const [contents] = await Gio.File.new_for_path(certPath).load_contents_async(cancellable);
        return Gio.TlsCertificate.new_from_pem(new TextDecoder().decode(contents), -1);
    } catch (e) {
        if (isCancelled(e))
            throw e;
        return null;
    }
}

/**
 * Small authenticated JSON-over-HTTP helper.
 */
export class Api {
    constructor({uri, apiKey, cert, timeout = LONG_POLL_S + 30}) {
        this.uri = uri;
        this._apiKey = apiKey;
        this._cert = cert;
        this._session = new Soup.Session({timeout, user_agent: 'Syncbeacon'});
    }

    async request(method, path, cancellable = null, body = null) {
        const msg = Soup.Message.new(method, `${this.uri}${path}`);
        if (!msg)
            throw new Error(_('Invalid URL: {url}', {url: this.uri}));
        if (body !== null) {
            msg.set_request_body_from_bytes('application/json',
                new GLib.Bytes(new TextEncoder().encode(JSON.stringify(body))));
        }
        if (this._apiKey)
            msg.request_headers.append('X-API-Key', this._apiKey);
        // Trust exactly the Syncthing GUI certificate, nothing else.
        msg.connect('accept-certificate', (_msg, peerCert) =>
            this._cert?.is_same(peerCert) ?? false);

        const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable);
        const status = msg.get_status();
        if (status === Soup.Status.UNAUTHORIZED || status === Soup.Status.FORBIDDEN)
            throw new AuthError();
        if (status !== Soup.Status.OK)
            throw new HttpError(status, msg.get_reason_phrase());
        const text = new TextDecoder().decode(bytes.get_data() ?? new Uint8Array());
        return text ? JSON.parse(text) : null;
    }

    get(path, cancellable = null) {
        return this.request('GET', path, cancellable);
    }

    post(path, cancellable = null) {
        return this.request('POST', path, cancellable);
    }

    patch(path, body, cancellable = null) {
        return this.request('PATCH', path, cancellable, body);
    }

    abort() {
        this._session.abort();
    }
}

/**
 * Check that a GUI answers and accepts the API key.
 *
 * @param {{uri: string, apiKey: string, certPath: string}} conn
 * @returns {Promise<string>} Syncthing version
 */
export async function testConnection(conn) {
    const cert = await loadPinnedCert(conn.certPath);
    const api = new Api({uri: conn.uri, apiKey: '', cert, timeout: 10});
    const health = await api.get('/rest/noauth/health');
    if (health?.status !== 'OK')
        throw new Error(_('Health check failed'));
    const authed = new Api({uri: conn.uri, apiKey: conn.apiKey, cert, timeout: 10});
    const version = await authed.get('/rest/system/version');
    return version.version;
}

/**
 * Keeps a live snapshot of a Syncthing instance.
 *
 * Callbacks:
 * - onUpdate(): the snapshot changed
 * - onAuthError(): the API key was rejected (config.xml may have changed)
 * - onConflictHint(folderId): a conflict file may have appeared or vanished
 */
export class SyncthingClient {
    constructor({onUpdate, onAuthError, onConflictHint}) {
        this._onUpdate = onUpdate;
        this._onAuthError = onAuthError;
        this._onConflictHint = onConflictHint;
        this._gen = 0;
        this._cancellable = null;
        this._api = null;
        this._wakeup = null;
        this._cycle = null;
        this._inflight = new Set();
        this._pending = new Set();
        this._rateSample = null;
        this._polling = false;
        this._lastFolderPoll = 0;
        this.data = emptySnapshot();
    }

    /**
     * (Re)connect with new settings. Pass null to disconnect and report an error.
     *
     * @param {{uri: string, apiKey: string, certPath: string}|null} conn
     * @param {string} [error] - message to show when conn is null
     */
    configure(conn, error = '') {
        this.stop();
        this.data = emptySnapshot();
        this._rateSample = null;
        if (!conn) {
            this.data.connError = error;
            this._emit();
            return;
        }
        const gen = ++this._gen;
        this._cancellable = new Gio.Cancellable();
        this._run(gen, conn, this._cancellable).catch(e => {
            if (!isCancelled(e))
                console.error(`Syncbeacon: client loop failed: ${e}`);
        });
    }

    stop() {
        this._gen++;
        this._cancellable?.cancel();
        this._cancellable = null;
        this._api?.abort();
        this._api = null;
        this._inflight.clear();
        this._pending.clear();
    }

    /** Skip the current reconnect backoff. */
    retryNow() {
        this._wakeup?.cancel();
    }

    /** Fetch a fresh snapshot now: skip the backoff or restart the event loop. */
    refresh() {
        this._wakeup?.cancel();
        this._cycle?.cancel();
    }

    /**
     * Re-fetch the changing data into the current snapshot: connections and
     * rates, device completion, last seen and last scan, and at most every
     * FOLDER_POLL_MS the folder statuses (an expensive call in Syncthing).
     * The event loop keeps running. Skipped while unreachable or while the
     * previous poll still runs.
     */
    async poll() {
        if (!this._api || !this.data.reachable || this._polling)
            return;
        this._polling = true;
        const gen = this._gen;
        const api = this._api;
        const data = this.data;
        const cancellable = this._cancellable;
        try {
            const now = GLib.get_monotonic_time();
            const withFolders = (now - this._lastFolderPoll) / 1000 >= FOLDER_POLL_MS;
            const [connections, deviceStats, folderStats] = await Promise.all([
                api.get('/rest/system/connections', cancellable),
                orElse(api.get('/rest/stats/device', cancellable), {}),
                orElse(api.get('/rest/stats/folder', cancellable), {}),
            ]);
            const conns = connections.connections ?? {};
            const online = data.devices.filter(d => conns[d.id]?.connected);
            const [completions, folderResults] = await Promise.all([
                Promise.all(online.map(d => orElse(api.get(
                    `/rest/db/completion?device=${encodeURIComponent(d.id)}`, cancellable), null))),
                withFolders ? Promise.all(data.folders.map(f => orElse(api.get(
                    `/rest/db/status?folder=${encodeURIComponent(f.id)}`, cancellable), null))) : [],
            ]);
            // A reset in the meantime replaced the snapshot; drop the results.
            if (gen !== this._gen || data !== this.data)
                return;

            data.connections = conns;
            for (const id of Object.keys(data.completion)) {
                if (!conns[id]?.connected)
                    delete data.completion[id];
            }
            online.forEach((d, i) => {
                if (completions[i])
                    data.completion[d.id] = completions[i].completion;
            });
            if (withFolders) {
                this._lastFolderPoll = now;
                data.folders.forEach((f, i) => {
                    if (folderResults[i])
                        data.folderStatus[f.id] = folderResults[i];
                });
            }
            for (const [id, st] of Object.entries(deviceStats ?? {}))
                data.lastSeen[id] = st.lastSeen;
            for (const [id, st] of Object.entries(folderStats ?? {}))
                data.lastScan[id] = st.lastScan;
            this._applyRates(data, conns);
            this._emit();
        } finally {
            this._polling = false;
        }
    }

    /**
     * Rates from the byte totals against the previous sample. Syncthing
     * reports only totals, so the first sample yields no rates.
     */
    _applyRates(data, connections) {
        const now = GLib.get_monotonic_time();
        const prev = this._rateSample;
        const dt = prev ? (now - prev.time) / 1e6 : 0;
        if (dt > 0 && dt <= RATE_MAX_AGE_S) {
            for (const [id, c] of Object.entries(connections)) {
                const p = prev.totals[id];
                if (p && c.connected) {
                    data.rates[id] = {
                        down: Math.max(0, ((c.inBytesTotal ?? 0) - p.in) / dt),
                        up: Math.max(0, ((c.outBytesTotal ?? 0) - p.out) / dt),
                    };
                } else {
                    delete data.rates[id];
                }
            }
        }
        const totals = {};
        for (const [id, c] of Object.entries(connections))
            totals[id] = {in: c.inBytesTotal ?? 0, out: c.outBytesTotal ?? 0};
        this._rateSample = {time: now, totals};
    }

    /** Pause or resume every device, also those paused one by one. */
    async setDevicesPaused(paused) {
        await this._requireApi().post(paused ? '/rest/system/pause' : '/rest/system/resume');
    }

    /** Pause or resume every folder, also those paused one by one. */
    async setFoldersPaused(paused) {
        const api = this._requireApi();
        await Promise.all(this.data.folders.filter(f => f.paused !== paused).map(f =>
            api.patch(`/rest/config/folders/${encodeURIComponent(f.id)}`, {paused})));
    }

    async rescan(folderId) {
        await this._requireApi().post(`/rest/db/scan?folder=${encodeURIComponent(folderId)}`);
    }

    _requireApi() {
        if (!this._api || !this.data.reachable)
            throw new Error(_('Syncthing is not reachable'));
        return this._api;
    }

    _emit() {
        this._onUpdate?.();
    }

    async _run(gen, conn, cancellable) {
        const cert = await loadPinnedCert(conn.certPath, cancellable);
        if (gen !== this._gen)
            return;
        this._api = new Api({uri: conn.uri, apiKey: conn.apiKey, cert});

        let attempt = 0;
        while (gen === this._gen) {
            // One snapshot + event loop; refresh() cancels it to start over.
            const cycle = new Gio.Cancellable();
            const link = cancellable.connect(() => cycle.cancel());
            this._cycle = cycle;
            try {
                const since = await this._lastEventId(cycle);
                await this._snapshot(gen, cycle);
                attempt = 0;
                await this._eventLoop(gen, since, cycle);
            } catch (e) {
                if (cancellable.is_cancelled() || gen !== this._gen)
                    return;
                if (e instanceof ResetSignal || isCancelled(e))
                    continue;
                this.data.reachable = false;
                this.data.authFailed = e instanceof AuthError;
                this.data.connError = e instanceof AuthError ? '' : e.message;
                this._emit();
                if (e instanceof AuthError)
                    this._onAuthError?.();

                this._wakeup = new Gio.Cancellable();
                const parent = cancellable.connect(() => this._wakeup?.cancel());
                try {
                    await sleep(BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)], this._wakeup);
                } catch {
                    // Woken early by retryNow() or cancelled; the loop condition decides.
                } finally {
                    cancellable.disconnect(parent);
                    this._wakeup = null;
                }
            } finally {
                cancellable.disconnect(link);
                if (this._cycle === cycle)
                    this._cycle = null;
            }
        }
    }

    async _lastEventId(cancellable) {
        const events = await this._api.get('/rest/events?limit=1&timeout=1', cancellable);
        return events?.length ? events[events.length - 1].id : 0;
    }

    async _snapshot(gen, cancellable) {
        const api = this._api;
        const optional = path => api.get(path, cancellable).catch(e => {
            if (isCancelled(e) || e instanceof AuthError)
                throw e;
            return {};
        });
        const [status, config, connections, sysErrors, deviceStats, folderStats] = await Promise.all([
            api.get('/rest/system/status', cancellable),
            api.get('/rest/config', cancellable),
            api.get('/rest/system/connections', cancellable),
            api.get('/rest/system/error', cancellable),
            optional('/rest/stats/device'),
            optional('/rest/stats/folder'),
        ]);

        const data = emptySnapshot();
        data.myID = status.myID;
        data.myName = (config.devices ?? []).find(d => d.deviceID === status.myID)?.name ?? '';
        data.devices = (config.devices ?? [])
            .filter(d => d.deviceID !== status.myID)
            .map(d => ({id: d.deviceID, name: d.name, paused: !!d.paused}));
        data.folders = (config.folders ?? []).map(f => ({
            id: f.id, label: f.label, path: expandHome(f.path), paused: !!f.paused,
        }));
        data.connections = connections.connections ?? {};
        for (const [id, st] of Object.entries(deviceStats ?? {}))
            data.lastSeen[id] = st.lastSeen;
        for (const [id, st] of Object.entries(folderStats ?? {}))
            data.lastScan[id] = st.lastScan;
        data.systemErrors = (sysErrors.errors ?? []).map(e => e.message ?? String(e));

        const folderResults = await Promise.all(data.folders.map(f =>
            api.get(`/rest/db/status?folder=${encodeURIComponent(f.id)}`, cancellable)
                .catch(e => {
                    if (isCancelled(e) || e instanceof AuthError)
                        throw e;
                    return {state: f.paused ? 'paused' : 'unknown'};
                })));
        data.folders.forEach((f, i) => (data.folderStatus[f.id] = folderResults[i]));

        const online = data.devices.filter(d => data.connections[d.id]?.connected);
        const completions = await Promise.all(online.map(d =>
            api.get(`/rest/db/completion?device=${encodeURIComponent(d.id)}`, cancellable)
                .catch(e => {
                    if (isCancelled(e) || e instanceof AuthError)
                        throw e;
                    return {completion: 100};
                })));
        online.forEach((d, i) => (data.completion[d.id] = completions[i].completion));

        if (gen !== this._gen)
            return;
        this._applyRates(data, data.connections);
        this._lastFolderPoll = GLib.get_monotonic_time();
        data.reachable = true;
        this.data = data;
        this._emit();
    }

    async _eventLoop(gen, since, cancellable) {
        const started = GLib.get_monotonic_time();
        let last = since;
        while (gen === this._gen) {
            if ((GLib.get_monotonic_time() - started) / 1000 > FULL_REFRESH_MS)
                throw new ResetSignal();
            const events = await this._api.get(
                `/rest/events?since=${last}&timeout=${LONG_POLL_S}&events=${EVENTS}`, cancellable);
            if (gen !== this._gen)
                return;
            let changed = false;
            for (const ev of events ?? []) {
                // IDs going backwards mean Syncthing restarted.
                if (ev.id <= last)
                    throw new ResetSignal();
                last = ev.id;
                changed = this._handleEvent(gen, ev) || changed;
            }
            if (changed)
                this._emit();
        }
    }

    /**
     * Apply one event to the snapshot.
     *
     * @returns {boolean} whether the snapshot changed synchronously
     */
    _handleEvent(gen, ev) {
        const d = ev.data ?? {};
        const data = this.data;
        switch (ev.type) {
        case 'ConfigSaved':
            throw new ResetSignal();
        case 'StateChanged':
            data.folderStatus[d.folder] = {...data.folderStatus[d.folder], state: d.to, error: d.error ?? ''};
            if (d.from === 'scanning')
                data.lastScan[d.folder] = new Date().toISOString();
            if (d.to === 'idle' || d.to === 'error')
                this._queue(gen, `folder:${d.folder}`, () => this._refetchFolder(d.folder));
            return true;
        case 'FolderSummary':
            data.folderStatus[d.folder] = d.summary;
            return true;
        case 'FolderErrors': {
            const st = data.folderStatus[d.folder] ?? {};
            data.folderStatus[d.folder] = {...st, pullErrors: d.errors?.length ?? 0};
            return true;
        }
        case 'FolderPaused':
        case 'FolderResumed': {
            const folder = data.folders.find(f => f.id === d.id);
            if (folder)
                folder.paused = ev.type === 'FolderPaused';
            this._queue(gen, `folder:${d.id}`, () => this._refetchFolder(d.id));
            return true;
        }
        case 'FolderCompletion':
            if (data.connections[d.device]?.connected)
                this._queue(gen, `device:${d.device}`, () => this._refetchCompletion(d.device));
            return false;
        case 'DeviceConnected':
            data.connections[d.id] = {...data.connections[d.id], connected: true};
            this._queue(gen, `device:${d.id}`, () => this._refetchCompletion(d.id));
            return true;
        case 'DeviceDisconnected':
            data.connections[d.id] = {...data.connections[d.id], connected: false};
            delete data.completion[d.id];
            delete data.rates[d.id];
            data.lastSeen[d.id] = new Date().toISOString();
            return true;
        case 'DevicePaused':
        case 'DeviceResumed': {
            const paused = ev.type === 'DevicePaused';
            const dev = data.devices.find(x => x.id === d.device);
            if (dev)
                dev.paused = paused;
            data.connections[d.device] = {...data.connections[d.device], paused};
            return true;
        }
        case 'ItemFinished':
            if (isConflictPath(d.item ?? ''))
                this._onConflictHint?.(d.folder);
            return false;
        case 'LocalIndexUpdated':
            if ((d.filenames ?? []).some(isConflictPath))
                this._onConflictHint?.(d.folder);
            return false;
        default:
            return false;
        }
    }

    // Both refetches write into the snapshot object that was current when they
    // started, so a result arriving after a reset cannot leak into the new one.
    async _refetchFolder(folderId) {
        const data = this.data;
        const st = await this._api.get(`/rest/db/status?folder=${encodeURIComponent(folderId)}`,
            this._cancellable);
        data.folderStatus[folderId] = st;
    }

    async _refetchCompletion(deviceId) {
        const data = this.data;
        const res = await this._api.get(`/rest/db/completion?device=${encodeURIComponent(deviceId)}`,
            this._cancellable);
        if (data.connections[deviceId]?.connected)
            data.completion[deviceId] = res.completion;
    }

    /**
     * Run fn once per key at a time; a request arriving while one is in flight
     * is coalesced into a single follow-up run.
     */
    _queue(gen, key, fn) {
        if (this._inflight.has(key)) {
            this._pending.add(key);
            return;
        }
        this._inflight.add(key);
        fn().then(() => {
            if (gen === this._gen)
                this._emit();
        }).catch(e => {
            if (!isCancelled(e))
                console.debug(`Syncbeacon: refetch ${key} failed: ${e}`);
        }).finally(() => {
            if (gen !== this._gen)
                return;
            this._inflight.delete(key);
            if (this._pending.delete(key))
                this._queue(gen, key, fn);
        });
    }
}
