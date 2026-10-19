# Change: Header in the top band

Backlog item: move the head (hostname and status text) into the first line, centered between the buttons.

## Plan

1. Branch `feat/header-in-band`.
2. `ui/infobox.js`
   - Drop the separate header menu item; the title (device name / state label, coloured by state) and the message go into a vertical box inside the action band, between Open UI (left) and Run/Pause + Settings (right).
   - Left and right buttons sit in two side boxes; the left box takes the right box's width as its minimum width, so the header is centred on the band, not just in the gap.
   - The header box expands and its labels are centred; the message keeps wrapping, so a long error text grows the band in height instead of pushing the buttons out.
   - Buttons stay vertically centred in the band.
   - Update comments.
3. `stylesheet.css`: centre the header text (`text-align: center`); keep the title/message styles.
4. Docs: README (info box description), IMPLEMENTATION.md top bar part, HISTORY, BACKLOG.
5. Tests via `scripts/`, then devkit for user test, version bump **minor** (0.7.0), commit, push, merge, tag.

## Outcome (after user test)

- Header left-aligned after Open UI with a 40 px gap (8 px band spacing + 32 px padding), not centred; the side-box width matching was dropped (it also crashed the devkit: natural width below minimum).
- The second line shows the short state label (`STATE_LABELS`) instead of the long message; hidden while the name is unknown (the title shows the label then).
