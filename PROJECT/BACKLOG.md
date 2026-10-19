# Plan

## Currently working on

- Remove VERSION.md and adapt @scripts/bump-version.sh so it updates README.md (Badge), HISTORY.md and @syncbeacon@whoozy82.github.io/metadata.json
  Also a git tag with the new version shall be set

## Backlog

<!-- Planced features, changes, fixes -->
- Versioning and Abount correction (extensions in extensions app)  maybe drop VERISON.md and move info somewhere else
- Reference to original Syncthing project (Readme)
- In infobox > device list > when hovering over status of device:
  - For connected devices > displays the download and upload rate. Text is aligned to the right and has background 10% darker than infobox's bg
  - For disconnected deviced > displays the last online date and time, aligned to the right and with background 10% darker than infobox's bg
  - For the time of hovering the underlaying text is hidden for each one
- In infobox > folders list > when hovering over status of a folder it reveals 3 buttons with appripriate icons:
  - Open Folder
  - Edit Ignore List
- device list and folder hold a maximum of 8 entries: if there are more, (....tbd...)
- horizontal orientation of infobox
- i18n: Multilingual UI
  - In settings window: language selection: System, English, German
- Extend to scope to non NixOS Gnome systems (maybe publish to extensions.gnome.org)

*Maybe parallel to this project*
- icon overlays in nautilus w syncthing status (maybe incl hover to show more info)
- Syncthing actions in context menu in nautilus
- easy managing ignore list in nautilus (?????????)
