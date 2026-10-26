# Plan

## In progress

<!-- List unfinished tasks that are staged and commited -->

## Backlog

<!-- Refined features, changes, fixes -->

- Add extensions.gnome.org link to README after approval of the peer review

## Unrefined

<!-- list of features that are not fully refined -->

- If the connection to systemd or the api fails, or the syncthing config was not found, the main info
  window shall display a quick 'how to' in a black text window ... tbd
  @syncbeacon/PROJECT/resourses/no-connection-how-to-handle.png
- The main info window shall have new feature to display the sync history ... tbd
  GET /rest/events/disk?since=<lastEventId>&limit=<n>&timeout=<seconds>  ??
  OR  /rest/events?events=ItemFinished reports each file as it finishes syncing, including errors. It's more detailed but noisier.  ??
  OR  /rest/stats/folder only gives the last synced file per folder (lastFile.filename, at, deleted). It's cheap and survives restarts, but holds just one entry per folder.  ??
  @syncbeacon/PROJECT/resourses/sync-history.png
- Make use of Prometheus-Style Metrics at /metrics endpoint  ... tbd
  Left bottom > small button to open metrics site
- Publish as nix package to nix repo ...
  ...


*Maybe parallel to this project*
- icon overlays in nautilus w syncthing status (maybe incl hover to show more info)
- Syncthing actions in context menu in nautilus
- easy managing ignore list in nautilus (?????????)
