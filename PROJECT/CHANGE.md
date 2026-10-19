# Change: Drop VERSION.md, bump-version.sh does the bump

Branch: `chore/bump-version`

## Plan

1. **Source of truth:** `metadata.json` (`version-name`) replaces `VERSION.md`. Delete `VERSION.md`.
2. **`scripts/bump-version.sh <major|minor|patch|X.Y.Z>`**
   - reads the current version from `metadata.json`, computes the new one
   - writes `version-name` and the integer `version` (MAJOR*10000 + MINOR*100 + PATCH) into `metadata.json`
   - README badge: `badge/version/vX.Y.Z/green`
   - HISTORY.md "Current version": `` `vX.Y.Z` created at _DD.MM.YYYY_ `` (today)
   - creates the git tag `vX.Y.Z` (see "Tag" below); refuses if the tag already exists
   - verifies every replacement, exits non-zero if one failed
3. **`flake.nix`:** read the version from `metadata.json` via `builtins.fromJSON` instead of `VERSION.md`.
4. **`dev-install.sh` / `pack.sh`:** drop the `bump-version.sh` call (it would now raise the version on every install/pack; `metadata.json` is already current).
5. **`AGENT.md`:** workflow step 9 names the new usage; tag handling at merge.
6. **Test:** run the script on a scratch copy (patch, minor, explicit version, invalid input, existing tag); `nix flake check`; unit tests.
7. **Version bump** of this change: `0.1.1` → `0.1.2`.
8. **Docs:** HISTORY changelog entry, BACKLOG item removed (also the related "Versioning … drop VERSION.md" backlog line).

## Tag

Bumping happens on the feature branch before the commit, so tagging HEAD then would tag the wrong commit.
Script mode `bump-version.sh --tag` tags the current HEAD with the version in `metadata.json` and pushes the tag; run on `main` after the merge (workflow step 13).
