# Change: Local device name in the info box header

Branch: `feat/local-device-name` · Version bump: minor (`v0.4.3` → `v0.5.0`)

## Data
- `lib/client.js`: when taking the snapshot, read the name of the local device
  (the `config.devices` entry whose `deviceID` equals `status.myID`) into
  `data.myName`. `ConfigSaved` already triggers a fresh snapshot, so a rename
  shows up without extra work
- `lib/state.js`: `emptySnapshot()` gets `myName: ''`; `deriveStatus()` passes
  it on as `status.myName`

## Header (`ui/infobox.js`)
- The bold title shows the local device name instead of the state label
  ("In Sync", …). It keeps the state colour (`syncbeacon-state-<state>`)
- The state label is dropped from the header; the colour and the message line
  show the state
- Fallbacks: before the first update the title stays `Connecting…`; if the name
  is unknown (Syncthing unreachable, empty name) the title shows the state label
  as today

## Tests
- `tests/test_state.js`: `myName` is passed through by `deriveStatus()`

## Risk
- A long device name could widen the popup; St.Label ellipsizes at the end by default
