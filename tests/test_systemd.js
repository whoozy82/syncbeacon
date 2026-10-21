// Syncthing unit detection when systemd is not available.
// Run: tests/run-systemd.sh (a private D-Bus as session and system bus, so
// neither bus has systemd)

import {assert, assertEqual, run, test} from './harness.js';
import {SyncthingUnit} from '../syncbeacon@whoozy82.github.io/lib/systemd.js';

async function rejects(promise) {
    try {
        await promise;
    } catch (e) {
        return e.message;
    }
    throw new Error('expected a rejection');
}

test('no unit found without systemd', async () => {
    let changes = 0;
    const unit = new SyncthingUnit(() => changes++);
    await unit.init();
    assertEqual(changes, 1, 'onChange calls');
    assert(!unit.found, 'found');
    assertEqual(unit.active, null, 'active');
    assertEqual([unit.name, unit.scope, unit.activeState, unit.unitFileState], [null, null, null, null]);
    unit.destroy();
});

test('start and stop fail without a unit', async () => {
    const unit = new SyncthingUnit();
    await unit.init();
    assertEqual(await rejects(unit.start()), 'systemd.no-unit', 'start');
    assertEqual(await rejects(unit.stop()), 'systemd.no-unit', 'stop');
    await unit.refresh();
    unit.destroy();
});

test('destroy during detection', async () => {
    let changes = 0;
    const unit = new SyncthingUnit(() => changes++);
    const pending = unit.init();
    unit.destroy();
    await pending;
    assertEqual(changes, 0, 'onChange calls');
    assert(!unit.found, 'found');
});

await run();
