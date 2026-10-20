# Plan

## In progress

<!-- List unfinished tasks that are staged and commited -->
- ...

## Backlog

<!-- Refined features, changes, fixes -->
- Syncthing Window settings:
  Additional setting: 'Epiphany Web App', which internally uses the command to start 
  the Web App of `http://localhost:8384`.
  In case of Epiphany is available, but the webapp is not, the extension will create the web app automatically (as already implemented)
  The field below will then display the web app identifier (read-only).
  Note, that the current config points to a non existant web app with https. I replaced it with a web app with http.
  The other two options remain as is with the exception, that the command setting is not pre-filled.
- dynamic arrangement:
  - is the count of devices and folders together below 10 > vertical arrangement as it is now 
  - is the count of devices and folder together 10 or more > horizontal arragement:
    - folders list to the left and devices list to the right 
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
