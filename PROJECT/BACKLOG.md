# Plan

## In progress

<!-- List unfinished tasks that are staged and commited -->
- Upload to extensions.gnome.org: `dist/` zip from `scripts/pack.sh` passes `scripts/ego-check.sh`; upload by hand with the own account, then add the extensions.gnome.org link to the README
  - Extension Manager's "Show details" page only works once published there (fetched from extensions.gnome.org by UUID)
  - Upload was done, waiting for response from peer review 

## Backlog

<!-- Refined features, changes, fixes -->

- Shexli at externsions.gnome.org: EGO-X-004 - warning:
  extensions should avoid synchronous file IO in shell code
  Shell code should avoid synchronous file IO APIs like `GLib.file_get_contents()` and `Gio.File.load_contents()`.
  File Operations:
    `lib/locale.js:13` > `GLib.file_get_contents(path)`

- Shexli at externsions.gnome.org: EGO-L-004 - warning:
  main loop sources should be removed in disable()
  Main loop sources assigned in `enable()` are missing matching removals in `disable()` or its helper methods.
  Remove main loop sources:
    `extension.js:256`:
      ```
      this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
          this._client.poll().catch(e => {
              if (!isCancelled(e))
                  console.debug(`Syncbeacon: status poll failed: ${e}`);
          });
          return GLib.SOURCE_CONTINUE
      ```
    `extension.js:300`:
      ```
        this._retryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, CONFIG_RETRY_S, () => {
            this._retryId = 0;
            this._reconfigure();
            return GLib.SOURCE_REMOVE;
        })
      ```
    `extension.js:380`:
      ```
        this._updateId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UPDATE_DELAY_MS, () => {
            this._updateId = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        })
      ```


- Publish as nix package to nix repo

## To refine

<!-- list of features that are not fully refined -->
- ...

*Maybe parallel to this project*
- icon overlays in nautilus w syncthing status (maybe incl hover to show more info)
- Syncthing actions in context menu in nautilus
- easy managing ignore list in nautilus (?????????)
