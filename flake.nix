{
  description = "Syncbeacon: Syncthing status in the GNOME top bar";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      uuid = "syncbeacon@whoozy82.github.io";
      inherit (nixpkgs) lib;
      version = lib.trim (builtins.readFile ./VERSION.md);
      # Same integer as scripts/sync-version.sh: MAJOR*10000 + MINOR*100 + PATCH.
      versionCode = lib.foldl (acc: n: acc * 100 + lib.toInt n) 0 (lib.splitString "." version);
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
            sed -i -E \
              -e 's/("version-name"[[:space:]]*:[[:space:]]*)"[^"]*"/\1"${version}"/' \
              -e 's/("version"[[:space:]]*:[[:space:]]*)[0-9]+/\1${toString versionCode}/' \
              metadata.json
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
          packages = with pkgs; [ gjs glib libsoup_3 gtk4 libadwaita ];
        };
      });

      checks = forAll (pkgs: {
        unit-tests = pkgs.runCommand "syncbeacon-tests" { nativeBuildInputs = [ pkgs.gjs ]; } ''
          cp -r ${./.}/. src && cd src
          gjs -m tests/test_state.js
          gjs -m tests/test_config.js
          touch $out
        '';
      });
    };
}
