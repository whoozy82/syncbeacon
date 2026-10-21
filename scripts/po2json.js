// Convert every locale/<code>.po in a directory into <code>.json and remove
// the .po files. scripts/pack.sh runs this on its copy of the extension,
// because extensions.gnome.org does not accept .po files in the zip.
//
// Run: gjs -m scripts/po2json.js <locale dir>

import GLib from 'gi://GLib';
import System from 'system';

import {catalogToJson, parsePo} from '../syncbeacon@whoozy82.github.io/lib/i18n.js';

const [dir] = ARGV;
if (!dir) {
    printerr('Usage: gjs -m scripts/po2json.js <locale dir>');
    System.exit(1);
}

const decoder = new TextDecoder();
const d = GLib.Dir.open(dir, 0);
let name;
while ((name = d.read_name()) !== null) {
    if (!name.endsWith('.po'))
        continue;
    const po = GLib.build_filenamev([dir, name]);
    const json = GLib.build_filenamev([dir, `${name.slice(0, -3)}.json`]);
    const catalog = parsePo(decoder.decode(GLib.file_get_contents(po)[1]));
    GLib.file_set_contents(json, `${catalogToJson(catalog)}\n`);
    GLib.unlink(po);
    print(`${name} -> ${GLib.path_get_basename(json)} (${catalog.messages.size} texts)`);
}
d.close();
