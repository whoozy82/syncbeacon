# Change: test without systemd unit

Branch: `feat/no-systemd-test`

(shexli check postponed, stays in the backlog)

## Implementation

- `tests/harness.js`: `run()` awaits each test, so tests can be async (existing tests unchanged)
- New `tests/test_systemd.js`: `SyncthingUnit` with no systemd on either bus
  - `init()` finishes, calls `onChange` once; `found` false, `active` null, name/scope/states null
  - `start()` / `stop()` reject with `systemd.no-unit`; `refresh()` is a no-op
  - `destroy()` during detection: no `onChange`, nothing found
- New `tests/run-systemd.sh`: `dbus-run-session` with a minimal bus config (no service directories, so nothing is activated) that also serves as system bus via `DBUS_SYSTEM_BUS_ADDRESS`; `GIO_USE_VFS=local`
- `flake.nix` checks: `pkgs.dbus`, runs `tests/run-systemd.sh`

## Test

- `nix flake check` passes (incl. 3/3 new tests)
- Cross-check: on the host buses (unit present) the test fails as expected

## User test (devkit)

- Stop the unit, enable the extension → red state, no JS errors in the journal; prefs show "no unit", Start/Stop disabled
