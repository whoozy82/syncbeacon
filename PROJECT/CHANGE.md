# Change: device detail layout (right-aligned fields, last-seen icon)

Follow-up to the device status hover (v0.2.0). Branch: `fix/device-detail-layout`, version 0.2.1.

- `lib/state.js`: `detail` becomes structured, so the UI can lay out its parts:
  - `{kind: 'rates', down, up}` (formatted values, `0 B/s` before the first sample)
  - `{kind: 'last-seen', text}` (`18.10. 14:32` or `Never seen`)
- `ui/infobox.js`: the detail box holds two layouts and shows the one that matches `kind`:
  - rates: `↓value  ↑value`, arrow directly before the number, box sized to its text (no fixed-width fields)
  - last seen: a `document-open-recent-symbolic` icon (Adwaita clock), then the date
- The status label and detail box both align to the right edge of the status cell, without stretching, so the detail box ends exactly where the status text ends.
- `stylesheet.css`: spacing and the icon size.
- Tests: update the `detail` expectations in `tests/test_state.js`.
