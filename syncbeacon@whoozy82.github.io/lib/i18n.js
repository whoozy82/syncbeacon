// Translations: our own lookup instead of gettext, because gettext follows
// the language of the whole Shell process and an extension cannot pick its
// own. The texts come from gettext .po files in locale/, read at runtime.
// No gi:// imports, so this module can be unit-tested outside the shell.

// msgid -> [msgstr, msgstr[1], …]; empty while the language is English.
let messages = new Map();

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

/**
 * The translation of an English text, the text itself if there is none.
 *
 * @param {string} msgid - may contain {name} placeholders
 * @param {object} [values] - values for the placeholders
 * @returns {string}
 */
export function _(msgid, values) {
    return fill(messages.get(msgid)?.[0] || msgid, values);
}

/**
 * The singular or plural translation for count. Only languages with one
 * singular and one plural form (n == 1) are supported. The count is
 * available as {n}.
 *
 * @param {string} msgid
 * @param {string} msgidPlural
 * @param {number} n
 * @param {object} [values]
 * @returns {string}
 */
export function _n(msgid, msgidPlural, n, values) {
    const forms = messages.get(msgid);
    const index = n === 1 ? 0 : 1;
    const text = forms?.[index] || (index === 0 ? msgid : msgidPlural);
    return fill(text, {n, ...values});
}

/**
 * Marks a text for translation without translating it, for constants that
 * are translated where they are shown.
 *
 * @param {string} msgid
 * @returns {string}
 */
export function N_(msgid) {
    return msgid;
}

/**
 * @param {Map<string, string[]>|null} table - from parsePo(); null for English
 */
export function setMessages(table) {
    messages = table ?? new Map();
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
 * The language to use: a code from available, or null for English (the
 * texts in the code). 'system' takes the first of the system's languages
 * that is available; English among them wins over the ones after it.
 *
 * @param {string} setting - 'system', 'en' or a language code
 * @param {string[]} available - codes with a .po file, e.g. ['de']
 * @param {string[]} systemNames - e.g. GLib.get_language_names()
 * @returns {string|null}
 */
export function pickLanguage(setting, available, systemNames) {
    if (setting !== 'system')
        return available.includes(setting) ? setting : null;
    for (const name of systemNames) {
        // de_DE.UTF-8@euro -> de_DE, de
        const full = name.replace(/[.@].*$/, '');
        const lang = full.split('_')[0];
        if (lang === 'en')
            return null;
        if (available.includes(full))
            return full;
        if (available.includes(lang))
            return lang;
    }
    return null;
}
