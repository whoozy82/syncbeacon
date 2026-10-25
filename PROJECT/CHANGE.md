# Change: Ignore conflict files in the trash bin

Backlog: "The program looks for sync conflict files, even in trash bin. Exclude `.Trash-1000` from the parser"

Branch: `fix/conflicts-skip-trash`

## Plan

1. **Scanner** (`lib/conflicts.js`, `_scan`): add the freedesktop trash directories to the `find` prune list next to `.stversions` / `.stfolder`: `-name '.Trash-*'` (per-user trash on other volumes, e.g. `.Trash-1000`, any UID) and `-name '.Trash'` (shared top-level trash). Conflict copies inside them are no longer counted.
2. **Event hints** (`lib/state.js`, `isConflictPath`): also return false for paths with a `.Trash` / `.Trash-<uid>` segment, so deleting a conflict file into the trash doesn't trigger a needless rescan.
3. **Test** (`tests/test_state.js`): extend "conflict file names" with trash paths (`.Trash-1000/files/x.sync-conflict-…`, `.Trash/1000/files/…`) → false; run all tests under `tests/`.
4. **User test** in devkit: a folder with a conflict copy in `.Trash-1000/files/` shows no conflict.
5. **Version**: `bump-version.sh patch`, HISTORY.md, BACKLOG.md.
