// Translations: our own lookup instead of gettext, because gettext follows
// the language of the whole Shell process and an extension cannot pick its
// own. The code uses symbolic keys (e.g. 'notify.rescan-failed'); the texts,
// English included, come from gettext .po files in locale/, read at runtime.
// No gi:// imports, so this module can be unit-tested outside the shell.

// key -> [msgstr, msgstr[1], …]: the chosen language, and English (en.po)
// for the keys it lacks.
let messages = new Map();
let fallback = new Map();

/**
 * Replace {name} placeholders with values.
 *
 * @param {string} text
 * @param {object} [values]
 * @returns {string}
 */
function fill(text, values) {
    if (!values)
        return text;
    return text.replace(/\{(\w+)\}/g, (match, name) =>
        name in values ? String(values[name]) : match);
}

/** The text forms of key: the chosen language, then English. */
function forms(key) {
    return messages.get(key) ?? fallback.get(key);
}

/**
 * The text for a key in the chosen language, the English text if it has
 * none, the key itself if English has none either.
 *
 * @param {string} key - its text may contain {name} placeholders
 * @param {object} [values] - values for the placeholders
 * @returns {string}
 */
export function _(key, values) {
    return fill(forms(key)?.[0] || key, values);
}

/**
 * The singular or plural text of key for count. Only languages with one
 * singular and one plural form (n == 1) are supported. The count is
 * available as {n}.
 *
 * @param {string} key
 * @param {number} n
 * @param {object} [values]
 * @returns {string}
 */
export function _n(key, n, values) {
    const text = forms(key)?.[n === 1 ? 0 : 1] || key;
    return fill(text, {n, ...values});
}

/**
 * Marks a key for translation without translating it, for constants that
 * are translated where they are shown.
 *
 * @param {string} key
 * @returns {string}
 */
export function N_(key) {
    return key;
}

/**
 * @param {Map<string, string[]>|null} table - the chosen language, from parsePo()
 * @param {Map<string, string[]>|null} [base] - English, for keys table lacks
 */
export function setMessages(table, base = null) {
    messages = table ?? new Map();
    fallback = base ?? new Map();
}

function unquote(s) {
    return s.slice(1, -1).replace(/\\(.)/g, (_m, c) =>
        ({n: '\n', t: '\t', r: '\r'})[c] ?? c);
}

/**
 * Parse a gettext .po file. Fuzzy and untranslated entries are left out.
 *
 * @param {string} text
 * @returns {{headers: object, messages: Map<string, string[]>}}
 */
export function parsePo(text) {
    const headers = {};
    const table = new Map();
    // The strings of the current entry by keyword: msgid, msgid_plural, and
    // the msgstr forms as 0, 1, …
    let entry = null;
    let field = null;

    const finish = () => {
        if (entry) {
            const forms = Object.keys(entry.strings).filter(k => /^\d+$/.test(k))
                .sort((a, b) => a - b).map(k => entry.strings[k]);
            const msgid = entry.strings.msgid;
            if (msgid === '') {
                for (const line of (forms[0] ?? '').split('\n')) {
                    const colon = line.indexOf(':');
                    if (colon > 0)
                        headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
                }
            } else if (msgid !== undefined && !entry.fuzzy && forms.some(f => f)) {
                table.set(msgid, forms);
            }
        }
        entry = null;
        field = null;
    };

    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line === '') {
            finish();
        } else if (line.startsWith('#')) {
            // A comment after the strings starts the next entry.
            if (field)
                finish();
            entry ??= {strings: {}};
            if (line.startsWith('#,') && line.includes('fuzzy'))
                entry.fuzzy = true;
        } else if (line.startsWith('"')) {
            if (field)
                entry.strings[field] += unquote(line);
        } else {
            const m = line.match(/^(msgid|msgid_plural|msgstr)(?:\[(\d+)\])?\s+(".*")$/);
            if (!m)
                continue;
            if (m[1] === 'msgid' && field)
                finish();
            entry ??= {strings: {}};
            field = m[1] === 'msgstr' ? m[2] ?? '0' : m[1];
            entry.strings[field] = unquote(m[3]);
        }
    }
    finish();
    return {headers, messages: table};
}

/**
 * A parsed .po file as JSON, the form the release zip ships it in
 * (extensions.gnome.org does not accept .po files).
 *
 * @param {{headers: object, messages: Map<string, string[]>}} catalog
 * @returns {string}
 */
export function catalogToJson({headers, messages}) {
    return JSON.stringify({headers, messages: Object.fromEntries(messages)}, null, 1);
}

/**
 * Read a catalog written by catalogToJson().
 *
 * @param {string} text
 * @returns {{headers: object, messages: Map<string, string[]>}}
 */
export function parseCatalogJson(text) {
    const {headers = {}, messages = {}} = JSON.parse(text);
    return {headers, messages: new Map(Object.entries(messages))};
}

/**
 * The language to use: a code from available, 'en' if none fits. 'system'
 * takes the first of the system's languages that is available; English
 * among them wins over the ones after it.
 *
 * @param {string} setting - 'system' or a language code
 * @param {string[]} available - codes with a .po file, e.g. ['de', 'en']
 * @param {string[]} systemNames - e.g. GLib.get_language_names()
 * @returns {string}
 */
export function pickLanguage(setting, available, systemNames) {
    if (setting !== 'system')
        return available.includes(setting) ? setting : 'en';
    for (const name of systemNames) {
        // de_DE.UTF-8@euro -> de_DE, de
        const full = name.replace(/[.@].*$/, '');
        const lang = full.split('_')[0];
        if (available.includes(full))
            return full;
        if (available.includes(lang) || lang === 'en')
            return lang;
    }
    return 'en';
}
