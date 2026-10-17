// Minimal test harness for `gjs -m`.

import System from 'system';

const tests = [];

export function test(name, fn) {
    tests.push({name, fn});
}

export function assertEqual(actual, expected, what = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${what ? `${what}: ` : ''}expected ${e}, got ${a}`);
}

export function assert(cond, what = 'assertion failed') {
    if (!cond)
        throw new Error(what);
}

export function run() {
    let failed = 0;
    for (const {name, fn} of tests) {
        try {
            fn();
            print(`ok    ${name}`);
        } catch (e) {
            failed++;
            print(`FAIL  ${name}\n      ${e.message}`);
        }
    }
    print(`\n${tests.length - failed}/${tests.length} passed`);
    System.exit(failed ? 1 : 0);
}
