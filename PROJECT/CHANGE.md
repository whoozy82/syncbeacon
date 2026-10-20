# Change: info box limited to 60 % of the screen height

Backlog: "Info Box shall have a maximum height of 60% of desktop height. If the content needs more, cut at the bottom and visualize with applicable symbol"

## Plan

1. **Branch** `feat/infobox-max-height` from an up-to-date `main`.
2. **ui/infobox.js**
   - Put the folder/device lists (`this._lists`) in an `St.ScrollView` with no visible scrollbar.
   - The top bar (Open UI / header / Settings) and the footer (wand) stay outside it, so they are always visible.
   - Each time the box opens, and when the monitors change, set `max-height` on the box to 60 % of the height of the monitor the panel button is on.
     Only the lists shrink to fit, and the content is cut at the bottom.
   - **Overflow symbol:** a dim `pan-down-symbolic` chevron centred in the footer, beside the wand.
     It shows while there is more content below the cut and hides otherwise.
     The scroll view's `vfade` fades the cut edge.
   - **Scrolling:** with the mouse wheel, so the cut-off entries stay reachable (see the question below).
3. **stylesheet.css**: style for the chevron (dim, 16px).
4. **Test**
   - Unit tests and the i18n check.
   - Devkit with a small screen (`MUTTER_DEBUG_DUMMY_MODE_SPECS=1024x500`), so the lists overflow.
   - Check both orientations, the chevron appearing and disappearing, and that hover functions still work.
5. **Version bump**: `minor`. Then docs, commit, push, merge and tag.

## Open question

- Should the box scroll with the mouse wheel (recommended), or only be cut with no way to reach the hidden entries?
- "Desktop height" is read as the full monitor height, top bar included.
