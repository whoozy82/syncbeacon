{
  description = "Syncbeacon: Syncthing status in the GNOME top bar";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      uuid = "syncbeacon@whoozy82.github.io";
      inherit (nixpkgs) lib;
      # scripts/bump-version.sh keeps metadata.json current.
      version = (lib.importJSON (./. + "/${uuid}/metadata.json")).version-name;
    in
    {
      packages = forAll (pkgs: rec {
        syncbeacon = pkgs.stdenvNoCC.mkDerivation {
          pname = "gnome-shell-extension-syncbeacon";
          inherit version;
          # Store paths may not contain "@", so the source gets its own name.
          src = builtins.path { path = ./. + "/${uuid}"; name = "syncbeacon-src"; };
          nativeBuildInputs = [ pkgs.glib ];
          buildPhase = ''
            runHook preBuild
            glib-compile-schemas schemas
            runHook postBuild
          '';
          installPhase = ''
            runHook preInstall
            dest=$out/share/gnome-shell/extensions/${uuid}
            mkdir -p $dest
            cp -r metadata.json extension.js prefs.js stylesheet.css lib ui icons schemas $dest/
            runHook postInstall
          '';
          passthru.extensionUuid = uuid;
          meta = {
            description = "Syncthing status in the GNOME top bar";
            homepage = "https://github.com/whoozy82/syncbeacon";
            platforms = pkgs.lib.platforms.linux;
          };
        };
        default = syncbeacon;
      });

      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          # gobject-introspection's setup hook sets GI_TYPELIB_PATH from these
          # packages, replacing the session's own value: typelibs from another
          # glib build make gjs abort on `import Gio`.
          nativeBuildInputs = [ pkgs.gobject-introspection ];
          packages = with pkgs; [ gjs glib libsoup_3 gtk4 libadwaita ];
        };
      });

      checks = forAll (pkgs: {
        unit-tests = pkgs.runCommand "syncbeacon-tests" { nativeBuildInputs = [ pkgs.gjs ]; } ''
          cp -r ${./.}/. src && cd src
          gjs -m tests/test_state.js
          gjs -m tests/test_config.js
          gjs -m tests/test_webapp.js
          touch $out
        '';
      });
    };
}
