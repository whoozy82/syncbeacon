# Plan

## In progress

<!-- List unfinished tasks that are staged and commited -->

## Backlog

<!-- Refined features, changes, fixes -->
- Add shexli check (`shexli [--format json] <zip|dir>`)
  - Not in nixpkgs: `pip install "git+https://gitlab.gnome.org/Infrastructure/extensions-web.git#subdirectory=shexli"`, needs Python ≥ 3.14 (`nix shell nixpkgs#python314`)
  - Exits 0 even on errors → wrapper must parse the JSON output
  - shexli 0.2.1 segfaulted here on the dist zip (Python 3.14.7, tree-sitter 0.26) → investigate first
- Add extensions.gnome.org link to README after approval of the peer review

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
