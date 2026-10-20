# Change: Info box layouts (Auto / Vertical / Horizontal)

Branch: `feat/infobox-layouts` · Version bump: minor (0.14.0)

## Plan

1. **Schema** — new key `layout-orientation` (choices `auto`, `vertical`, `horizontal`, default `auto`).
2. **Settings window** (`prefs.js`) — new group "Layout" with a combo row "Orientation" [Auto, Vertical, Horizontal], placed after "Top bar"; same pattern as the Position row.
3. **Info box** (`ui/infobox.js`)
   - The lists go into one box holding two columns: folders (headline + rows) and devices (headline + rows).
   - Vertical: columns stacked (looks as it does now). Horizontal: folders on the left, devices on the right.
   - Auto: horizontal when folders + devices ≥ 10, vertical otherwise; checked on every status update.
   - Switching only changes the box's orientation, so rows are not rebuilt and a hovered row stays.
   - The info box reads the setting and follows changes live (`changed::layout-orientation`).
4. **Stylesheet** — gap between the two columns in horizontal mode.
5. **Docs** — HISTORY entry, BACKLOG item removed, IMPLEMENTATION/README if they describe the info box layout.

## Notes

- Rows are no longer menu items registered with the popup. They are non-reactive anyway. The headline buttons still take clicks and keyboard focus.
- Not part of this change: the 9-entry limit (separate backlog item).
