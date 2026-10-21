# Change: explicit main loop source removal in disable() (EGO-L-004)

Branch: `fix/disable-sources`

## Problem

Shexli (extensions.gnome.org) warns EGO-L-004: the sources in `this._pollId`,
`this._retryId` and `this._updateId` (`extension.js`) have no matching removal
in `disable()`. They are removed already, but through a loop over an array
(`for (const id of [this._updateId, …]) GLib.source_remove(id)`), which the
static check cannot match to the fields.

## Plan

1. `extension.js` `disable()`: replace the loop with one explicit block per field:
   `if (this._pollId) { GLib.source_remove(this._pollId); this._pollId = 0; }`, the same for `_retryId` and `_updateId`. Same order, same behaviour.
2. No other files. `lib/conflicts.js` and `lib/client.js` were not flagged; they remove their sources in their own `destroy()`/`stop()`.

## Test

- `gjs -m tests/test_*.js`, `scripts/pack.sh` + `scripts/ego-check.sh`.
- User test in the Mutter devkit: disable/enable a few times, with the info box open and closed; no errors in the log.
