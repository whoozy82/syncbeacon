// Web app command helpers.
// Run: gjs -m tests/test_webapp.js

import {assert, assertEqual, run, test} from './harness.js';
import {commandArgv, isWebAppCommand} from '../syncbeacon@whoozy82.github.io/lib/webapp.js';

const WEBAPP = 'epiphany --application-mode ' +
    '"--profile=/home/u/.local/share/org.gnome.Epiphany.WebApp_abc" http://localhost:8384/';

test('command arguments without field codes', () => {
    assertEqual(commandArgv('firefox --new-window %U'), ['firefox', '--new-window']);
    assertEqual(commandArgv('  '), null);
    assertEqual(commandArgv('"unclosed'), null);
});

test('web app command recognised', () => {
    assert(isWebAppCommand(WEBAPP));
    assert(isWebAppCommand(`/run/current-system/sw/bin/${WEBAPP}`));
    assert(!isWebAppCommand('epiphany http://localhost:8384/'));
    assert(!isWebAppCommand('firefox --new-window http://localhost:8384/'));
    assert(!isWebAppCommand(''));
});

run();
