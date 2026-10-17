// State derivation: every rule and the priority order.
// Run: gjs -m tests/test_state.js

import {assert, assertEqual, run, test} from './harness.js';
import {Row, State, countsText, deriveStatus, emptySnapshot, isConflictPath} from
    '../syncbeacon@whoozy82.github.io/lib/state.js';

// Shaped like this machine: 5 remote devices, 5 folders, 2 devices online.
function snapshot(overrides = {}) {
    const snap = emptySnapshot();
    snap.reachable = true;
    snap.unitActive = true;
    snap.myID = 'SELF';
    snap.devices = ['HomeNAS', 'nauti', 'Sony', 'trixy', 'Zenfone']
        .map(name => ({id: name.toUpperCase(), name, paused: false}));
    snap.connections = {
        HOMENAS: {connected: true, paused: false},
        ZENFONE: {connected: true, paused: false},
        NAUTI: {connected: false, paused: false},
        SONY: {connected: false, paused: false},
        TRIXY: {connected: false, paused: false},
    };
    snap.completion = {HOMENAS: 100, ZENFONE: 100};
    snap.folders = ['Bilder', 'Dokumente', 'Musik', 'Tech', 'Videos']
        .map(label => ({id: label.toLowerCase(), label, path: `/home/u/${label}`, paused: false}));
    for (const f of snap.folders) {
        snap.folderStatus[f.id] = {state: 'idle', error: '', pullErrors: 0, needTotalItems: 0,
            globalBytes: 100, inSyncBytes: 100};
        snap.conflicts[f.id] = 0;
    }
    return Object.assign(snap, overrides);
}

function pauseAll(snap) {
    snap.devices.forEach(d => (d.paused = true));
    for (const id of Object.keys(snap.connections))
        snap.connections[id] = {connected: false, paused: true};
    snap.completion = {};
    return snap;
}

test('in sync: all online devices at 100 %, offline devices ignored', () => {
    const s = deriveStatus(snapshot());
    assertEqual(s.state, State.IN_SYNC);
    assertEqual([s.peersConnected, s.peersTotal, s.foldersTotal], [2, 5, 5]);
    assertEqual(countsText(s), '2/5 · 5');
});

test('in sync with no device online', () => {
    const snap = snapshot();
    for (const id of Object.keys(snap.connections))
        snap.connections[id].connected = false;
    const s = deriveStatus(snap);
    assertEqual(s.state, State.IN_SYNC);
    assertEqual(s.message, 'No devices online');
});

test('syncing: an online device below 100 %', () => {
    const snap = snapshot();
    snap.completion.HOMENAS = 95.2;
    const s = deriveStatus(snap);
    assertEqual(s.state, State.SYNCING);
    assertEqual(s.devices.find(d => d.name === 'HomeNAS').text, 'Syncing 95 %');
});

test('syncing: a folder downloading', () => {
    const snap = snapshot();
    snap.folderStatus.musik.state = 'syncing';
    snap.folderStatus.musik.inSyncBytes = 40;
    const s = deriveStatus(snap);
    assertEqual(s.state, State.SYNCING);
    assertEqual(s.folders.find(f => f.label === 'Musik').text, 'Syncing 40 %');
});

test('local scanning alone is not syncing', () => {
    const snap = snapshot();
    snap.folderStatus.tech.state = 'scanning';
    snap.folderStatus.bilder.state = 'sync-waiting';
    const s = deriveStatus(snap);
    assertEqual(s.state, State.IN_SYNC);
    assertEqual(s.folders.find(f => f.label === 'Tech').text, 'Scanning');
});

test('offline device below 100 % does not count as syncing', () => {
    const snap = snapshot();
    snap.completion.NAUTI = 64.9;
    assertEqual(deriveStatus(snap).state, State.IN_SYNC);
});

test('paused: all devices paused (Pause All)', () => {
    const s = deriveStatus(pauseAll(snapshot()));
    assertEqual(s.state, State.PAUSED);
    assert(s.devices.every(d => d.text === 'Paused'), 'all rows paused');
    assertEqual(s.peersConnected, 0);
});

test('paused wins over a folder still finishing a download', () => {
    const snap = pauseAll(snapshot());
    snap.folderStatus.videos.state = 'syncing';
    assertEqual(deriveStatus(snap).state, State.PAUSED);
});

test('not paused while an unpaused device is online', () => {
    const snap = snapshot();
    snap.devices.find(d => d.id === 'HOMENAS').paused = true;
    snap.connections.HOMENAS = {connected: false, paused: true};
    assertEqual(deriveStatus(snap).state, State.IN_SYNC);
});

test('paused folders alone do not mean paused', () => {
    const snap = snapshot();
    snap.folders.forEach(f => (f.paused = true));
    assertEqual(deriveStatus(snap).state, State.IN_SYNC);
});

test('folder issue: conflicts', () => {
    const snap = snapshot();
    snap.conflicts.tech = 2;
    const s = deriveStatus(snap);
    assertEqual(s.state, State.FOLDER_ISSUE);
    assertEqual(s.message, 'Tech: 2 conflicts');
    const row = s.folders.find(f => f.label === 'Tech');
    assertEqual([row.status, row.text], [Row.WARNING, 'Up to date · 2 conflicts']);
});

test('folder issue: failed items', () => {
    const snap = snapshot();
    snap.folderStatus.musik.pullErrors = 3;
    const s = deriveStatus(snap);
    assertEqual(s.state, State.FOLDER_ISSUE);
    assertEqual(s.message, 'Musik: 3 failed items');
});

test('folder issue: folder in error state', () => {
    const snap = snapshot();
    snap.folderStatus.videos = {state: 'error', error: 'folder marker missing'};
    const s = deriveStatus(snap);
    assertEqual(s.state, State.FOLDER_ISSUE);
    assertEqual(s.folders.find(f => f.label === 'Videos').status, Row.ERROR);
});

test('folder issue wins over paused and syncing', () => {
    const snap = pauseAll(snapshot());
    snap.conflicts.bilder = 1;
    assertEqual(deriveStatus(snap).state, State.FOLDER_ISSUE);
});

test('conflict check unavailable does not raise an issue', () => {
    const snap = snapshot();
    snap.conflicts.tech = null;
    const s = deriveStatus(snap);
    assertEqual(s.state, State.IN_SYNC);
    assert(s.folders.find(f => f.label === 'Tech').text.endsWith('conflict check unavailable'));
});

test('error: GUI unreachable', () => {
    const snap = snapshot({reachable: false, connError: 'Could not connect: Connection refused'});
    const s = deriveStatus(snap);
    assertEqual([s.state, s.message], [State.ERROR, 'Could not connect: Connection refused']);
});

test('error: API key rejected', () => {
    const s = deriveStatus(snapshot({reachable: false, authFailed: true}));
    assertEqual([s.state, s.message], [State.ERROR, 'API key rejected']);
});

test('error: service stopped wins over everything', () => {
    const snap = snapshot({reachable: false, unitActive: false});
    snap.conflicts.tech = 4;
    const s = deriveStatus(snap);
    assertEqual([s.state, s.message], [State.ERROR, 'Syncthing service stopped']);
});

test('error: system error reported by Syncthing', () => {
    const s = deriveStatus(snapshot({systemErrors: ['Failed to start listener']}));
    assertEqual([s.state, s.message], [State.ERROR, 'Failed to start listener']);
});

test('unknown unit state does not cause an error', () => {
    assertEqual(deriveStatus(snapshot({unitActive: null})).state, State.IN_SYNC);
});

test('rows are sorted by name', () => {
    const s = deriveStatus(snapshot());
    assertEqual(s.devices.map(d => d.name), ['HomeNAS', 'nauti', 'Sony', 'trixy', 'Zenfone']);
    assertEqual(s.devices.find(d => d.name === 'nauti').text, 'Disconnected');
});

test('conflict file names', () => {
    assert(isConflictPath('x.sync-conflict-20261017-000000-ABCDEFG.txt'));
    assert(isConflictPath('dir/photo.sync-conflict-20250101-120000-Z7ABCDE.jpg'));
    assert(!isConflictPath('notes.sync-conflict.txt'));
    assert(!isConflictPath('plain.txt'));
});

run();
