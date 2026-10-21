# Plan

## In progress

<!-- List unfinished tasks that are staged and commited -->
- Upload to extensions.gnome.org: `dist/` zip from `scripts/pack.sh` passes `scripts/ego-check.sh`; upload by hand with the own account, then add the extensions.gnome.org link to the README
  - Extension Manager's "Show details" page only works once published there (fetched from extensions.gnome.org by UUID)
  - Upload was done, waiting for response from peer review 

## Backlog

<!-- Refined features, changes, fixes -->
- Add to tests if not already there:
  - shexli path_to_zip_or_folder (possibly via `nix shell -p`)
  - Enable + Test extension in case systemd service is not available


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
