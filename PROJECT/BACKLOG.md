# Plan

## In progress

<!-- List unfinished tasks that are staged and commited -->
- Upload to extensions.gnome.org: `dist/` zip from `scripts/pack.sh` passes `scripts/ego-check.sh`; upload by hand with the own account, then add the extensions.gnome.org link to the README
  - Extension Manager's "Show details" page only works once published there (fetched from extensions.gnome.org by UUID)
  - Upload was done, waiting for response from peer review 

## Backlog

<!-- Refined features, changes, fixes -->
- Fix: `GLib-CRITICAL: Source ID … was not found when attempting to remove it` on disable / shell shutdown (seen in the devkit log, also before v1.2.2)
  - Likely `sleep()` in `lib/client.js`: after the timeout fired, the `_wakeup` cancellable handler stays connected, and a later cancel removes the dead source; disconnect the handler once the timeout fires
  - Also check the `GLib-GObject-CRITICAL: instance … has no handler with id …` lines logged right after it

- Shexli at externsions.gnome.org (not flagged yet): `lib/webapp.js` writes files synchronously with `GLib.file_set_contents` (lines 150, 178)

- Add to tests if not already there:
  - Enable / Run extension while systemd service not available


## To refine

<!-- list of features that are not fully refined -->
- Publish as nix package to nix repo ...
- Make use of Prometheus-Style Metrics at /metrics endpoint
  Left bottom > small button to open metrics site
  ...


*Maybe parallel to this project*
- icon overlays in nautilus w syncthing status (maybe incl hover to show more info)
- Syncthing actions in context menu in nautilus
- easy managing ignore list in nautilus (?????????)
