# Change: Folder actions on the folder name

## Plan
1. `ui/infobox.js`: drop the ⋯ hint and centred overlay (`actionsCell`, `syncbeacon-row-line`). The folder name sits in a hover cell together with the action box, both left aligned and always laid out (swapped by opacity, like the device detail), so the cell is as wide as the wider of the two and the row does not shift. Hovering the cell hides the name and shows the box.
2. `stylesheet.css`: button spacing 8 → 12 px; `border: 1px solid -st-accent-color` on the box; remove hint/line rules.
3. Branch `feat/folder-actions-on-name`, minor bump, HISTORY/BACKLOG/IMPLEMENTATION update.
