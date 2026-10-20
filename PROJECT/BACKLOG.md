# Plan

## In progress

<!-- List unfinished tasks that are staged and commited -->
- Follow up to the last change:
  The default web uri in settings window shall be braught over from the config file (~/.config/syncthing)

## Backlog

<!-- Refined features, changes, fixes -->
- New Layouts:
  - Auto:
    - dynamic arrangement (auto):
      - is the count of devices and folders together below 10 > vertical arrangement as it is now 
      - is the count of devices and folder together 10 or more > horizontal arragement:
        - folders list to the left and devices list to the right
  - Vertical:
    folders list and devices list are always stacked on top, same as current implementation
  - Horizontal:
    folders list and devices list next to each other left to right
  - Entry in settings window 'Layout' > 'Orientation' with the selected layout option as dropdown [Auto, Vertical, Horizontal]
- i18n: Multilingual UI
  - In settings window: language selection: System, English, German
- device list and folders shall hold a maximum of 9 entries. if there exist more, visualize at the bottom with a common symbol
- Extend to scope to non NixOS Gnome systems (maybe publish to extensions.gnome.org)
  - Extension Manager's "Show details" page only works once published there (fetched from extensions.gnome.org by UUID)

## To refine

<!-- list of features that are not fully refined -->
- ...

*Maybe parallel to this project*
- icon overlays in nautilus w syncthing status (maybe incl hover to show more info)
- Syncthing actions in context menu in nautilus
- easy managing ignore list in nautilus (?????????)
