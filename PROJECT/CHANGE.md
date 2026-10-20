# Change: Center headline (host name and status)

## Plan
1. `ui/infobox.js`: title and message labels get `x_align: CENTER`; the message's `clutter_text.line_alignment` is set to center so wrapped lines stay centred. Header keeps `x_expand`, filling the space between Open UI and Settings (same width), so it is centred in the popup.
2. `stylesheet.css`: `.syncbeacon-header` uses symmetric horizontal padding instead of `padding-left: 32px`; comment updated.
3. Branch `feat/center-header`, patch bump, HISTORY/BACKLOG update.
