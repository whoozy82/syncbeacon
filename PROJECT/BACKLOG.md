# Plan

## In progress

<!-- List unfinished tasks that are staged and commited -->
- ...

## Backlog

<!-- Refined features, changes, fixes -->
- Replace the Pause-Run-Button by the following solution: Two separate Links for folders-list and device-list
  - While hovering over the headline 'Folders (x)' it makes a underline and appends the test '[Click to pause]'
  - Click on the headline pauses all folders and changes the text to 'Folders (x,Paused)'
  - While hovering over the headline 'Devices (x/y online)' it makes a underline and appends the test '[Click to pause]'
  - Click on the headline pauses all devices changes the text to 'Devices (y, Paused)'
  - The element in the tray bar follows this status and shows a paused symbol for the applicable area.
- The refresh of the status in folders list and devices list shall be changes:
  - when box is closed: update the statuses with frequency of 10 seconds
  - in the event of opening the box: updates all statuses
  - with a frequency of 1 second it refreshes the statuses as long as the box is shown
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
