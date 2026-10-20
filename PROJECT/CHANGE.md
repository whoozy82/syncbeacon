# Change: wand in the bottom right corner

Backlog: "fix position of magic button > shall be at the bottom right corner"

## Cause

The wand sits in the middle of the footer, not on the right. The footer is a `Clutter.BinLayout`, and in Mutter 50 that layout only applies a child's `x_align` when the child also has `x_expand`. The button has `x_align: END` but no `x_expand`, so it stays centred. A probe in a headless shell confirmed this: with `x_expand: true` the button moves from x=1309 (centre) to x=1563 (right edge).

## Plan

1. **Branch** `fix/wand-position` from an up-to-date `main`.
2. **ui/infobox.js**: add `x_expand: true` to `this._hoverToggle`. The button keeps its 18px width, and BinLayout puts it on the right edge of the footer.
3. **Test**: the test suite, then a headless screenshot with the box in vertical and horizontal layout, then the devkit for your check.
4. **Version bump** `patch`, then update HISTORY.md and BACKLOG.md, commit, push, merge and tag.
