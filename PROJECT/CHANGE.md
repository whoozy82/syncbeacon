# Change: Right alignment of the status overlays

Branch: `fix/detail-right-align` · Version bump: patch (`v0.4.2` → `v0.4.3`)

## Cause
The hover detail box (device rates / last seen, folder last scan) is flush with
the status label at its **box** edge. Its text sits 8px further left because of
the box's `padding: 2px 8px`, so it looks shifted against the status column.

## Fix (both lists, shared `statusRow` code)
- The hover cell is drawn shifted right by the detail's right padding
  (`translation_x`, read from the theme node), and the status label is shifted back
  by the same amount. The detail text now ends where the status text ends, and
  the hover zone moves with the box
- Translation affects only drawing, not layout

## Attempt 1 (dropped)
Negative CSS margins (`margin-right: -8px`) broke the popup's size calculation
(width −2147483648), so the info box did not open at all.

## Test
`nix flake check`, user test in the devkit
