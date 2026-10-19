# Change: Folder action click feedback

Branch: `fix/folder-action-press` · Version bump: patch (`v0.4.1` → `v0.4.2`)

## Accent circle while pressed
- `.syncbeacon-folder-action:active`: background `-st-accent-color` (GNOME accent
  color, St ≥ 47), icon `-st-accent-fg-color`. St.Button sets `:active` only
  while the button is held down
- To make it a circle, the buttons become square: `padding: 2px` (18×18 with
  the 14px icon), `border-radius: 999px`. The hover background is round as well
- Buttons get 2px narrower on each side, so `spacing` goes from 4px to 8px and the
  distance between icons stays at 12px

## Risk
- The buttons are now 18px tall instead of 14px. That should fit in the text line
  (about 19–20px), so the row height shouldn't change. Visual check needed
