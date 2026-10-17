// Config parsing and URI helpers.
// Run: gjs -m tests/test_config.js

import {assert, assertEqual, run, test} from './harness.js';
import {guiUriFromConfig, normalizeUri, parseConfigXml, sameGui} from
    '../syncbeacon@whoozy82.github.io/lib/config.js';

const CONFIG = `<configuration version="51">
    <folder id="kay-tech" label="Tech" path="~/Tech"></folder>
    <gui enabled="true" tls="false" sendBasicAuthPrompt="false">
        <address>127.0.0.1:8384</address>
        <apikey>abc123XYZ</apikey>
        <theme>default</theme>
    </gui>
</configuration>`;

test('parse gui section', () => {
    assertEqual(parseConfigXml(CONFIG), {tls: false, address: '127.0.0.1:8384', apiKey: 'abc123XYZ'});
});

test('parse tls flag', () => {
    assertEqual(parseConfigXml(CONFIG.replace('tls="false"', 'tls="true"')).tls, true);
});

test('no gui section', () => {
    assertEqual(parseConfigXml('<configuration></configuration>'), null);
});

test('gui URI from config', () => {
    assertEqual(guiUriFromConfig({tls: false, address: '127.0.0.1:8384'}), 'http://127.0.0.1:8384');
    assertEqual(guiUriFromConfig({tls: true, address: '0.0.0.0:8384'}), 'https://127.0.0.1:8384');
    assertEqual(guiUriFromConfig({tls: false, address: '[::]:8384'}), 'http://[::1]:8384');
    assertEqual(guiUriFromConfig({tls: false, address: ':8384'}), 'http://127.0.0.1:8384');
    assertEqual(guiUriFromConfig({tls: false, address: 'unix:///run/st.sock'}), null);
});

test('normalise user input', () => {
    assertEqual(normalizeUri('localhost:8384'), 'http://localhost:8384');
    assertEqual(normalizeUri(' https://localhost:8384/#/settings '), 'https://localhost:8384');
    assertEqual(normalizeUri('http://[::1]:8384/'), 'http://[::1]:8384');
    assertEqual(normalizeUri('ftp://host'), null);
    assertEqual(normalizeUri(''), null);
});

test('same GUI ignores scheme and loopback spelling', () => {
    assert(sameGui('https://localhost:8384/#', 'http://127.0.0.1:8384'));
    assert(sameGui('http://[::1]:8384', 'http://localhost:8384'));
    assert(!sameGui('http://127.0.0.1:8385', 'http://127.0.0.1:8384'));
    assert(!sameGui('http://nas.local:8384', 'http://127.0.0.1:8384'));
});

run();
