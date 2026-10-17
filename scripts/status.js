// Print the derived status of the local Syncthing, outside gnome-shell.
// Uses the same client, systemd and conflict code as the extension; read-only.
//
//   gjs -m scripts/status.js            print every status change (Ctrl+C to stop)
//   gjs -m scripts/status.js --once     print the first full status and exit

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import {SyncthingClient} from '../syncbeacon@whoozy82.github.io/lib/client.js';
import {detectConfigDir, loadConfig} from '../syncbeacon@whoozy82.github.io/lib/config.js';
import {ConflictScanner} from '../syncbeacon@whoozy82.github.io/lib/conflicts.js';
import {STATE_LABELS, countsText, deriveStatus} from '../syncbeacon@whoozy82.github.io/lib/state.js';
import {SyncthingUnit} from '../syncbeacon@whoozy82.github.io/lib/systemd.js';
import {findWebApp} from '../syncbeacon@whoozy82.github.io/lib/webapp.js';

const once = ARGV.includes('--once');
const loop = new GLib.MainLoop(null, false);
let last = '';
let firstScanDone = false;

const unit = new SyncthingUnit(() => print_());
const conflicts = new ConflictScanner(() => {
    firstScanDone = true;
    print_();
});
const client = new SyncthingClient({
    onUpdate: () => {
        conflicts.setFolders(client.data.folders);
        print_();
    },
    onConflictHint: id => conflicts.hint(id),
});

function print_() {
    const status = deriveStatus({...client.data, unitActive: unit.active, conflicts: conflicts.counts});
    const lines = [
        `${STATE_LABELS[status.state]}  [${countsText(status)}]  ${status.message}`,
        ...status.devices.map(d => `  device  ${d.name.padEnd(12)} ${d.status.padEnd(8)} ${d.text}`),
        ...status.folders.map(f => `  folder  ${f.label.padEnd(12)} ${f.status.padEnd(8)} ${f.text}`),
    ];
    const text = lines.join('\n');
    if (text !== last) {
        last = text;
        print(`${new Date().toLocaleTimeString()}  unit=${unit.name ?? '?'} (${unit.activeState ?? '?'}, ` +
            `enabled: ${unit.unitFileState ?? '?'})\n${text}\n`);
    }
    if (once && client.data.reachable && firstScanDone)
        loop.quit();
}

const dir = detectConfigDir();
const config = await loadConfig(dir);
print(`config: ${dir}  gui: ${config.uri}`);
const webApp = findWebApp(config.uri);
print(`web app: ${webApp ? `${webApp.name} ${webApp.url}` : 'none'}\n`);

await unit.init();
client.configure({uri: config.uri, apiKey: config.apiKey, certPath: config.certPath});
if (once) {
    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
        print('timed out');
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
}
await loop.runAsync();
client.stop();
conflicts.destroy();
unit.destroy();
Gio.Application.get_default()?.quit();
System.exit(0);
