# Change: Coloured Syncthing icon in the info box

Backlog: *Color Syncthing icon like this: PROJECT/resourses/syncthing-icon.png*

Reference: blue disc with a vertical gradient (top `#24B2DA` → bottom `#0A85C9`), white ring, lines and nodes.

## Plan

1. **`scripts/make-icons.py`** — additionally write the full-colour logo `icons/syncbeacon-syncthing.svg`
   (gradient disc, white mark). The symbolic icons stay unchanged.
2. **`ui/infobox.js`** — the Open UI button in the info box uses the coloured logo.
   The panel icon stays symbolic and coloured by state as before.
3. Regenerate icons, run tests, check in the Mutter devkit.
4. Version bump: minor.
