{
  description = "Bartender - AGS status bar";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";

    ags = {
      url = "github:aylur/ags";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    ags,
  }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};
    pname = "bartender";
    entry = "app.tsx";

    astalPackages = with ags.packages.${system}; [
      io
      astal4
      hyprland
      tray
      wireplumber
      network
      bluetooth
      notifd
    ];

    extraPackages =
      astalPackages
      ++ [
        pkgs.libadwaita
        pkgs.libsoup_3
      ];
  in {
    packages.${system} = {
      default = pkgs.stdenv.mkDerivation {
        name = pname;
        src = ./.;

        nativeBuildInputs = with pkgs; [
          wrapGAppsHook3
          gobject-introspection
          ags.packages.${system}.default
        ];

        buildInputs = extraPackages ++ [pkgs.gjs];

        installPhase = ''
          runHook preInstall

          mkdir -p $out/bin
          mkdir -p $out/share
          cp -r * $out/share
          ags bundle ${entry} $out/bin/${pname} -d "SRC='$out/share'"

          runHook postInstall
        '';
      };
    };

    devShells.${system} = {
      default = pkgs.mkShell {
        buildInputs = [
          (ags.packages.${system}.default.override {
            inherit extraPackages;
          })
          pkgs.alsa-utils
          pkgs.curl
          # Fonts
          pkgs.ibm-plex
          pkgs.fira
          pkgs.fira-code
          pkgs.jetbrains-mono
          pkgs.nerd-fonts.jetbrains-mono
          pkgs.nerd-fonts.fira-code
          pkgs.fontconfig
        ];
        # Ensure system fonts are accessible
        # Force Adwaita icons - Yaru-magenta causes GTK4 infinite recursion crash
        shellHook = ''
          export FONTCONFIG_FILE=${pkgs.fontconfig.out}/etc/fonts/fonts.conf
          export XDG_DATA_DIRS="$HOME/.local/share:$XDG_DATA_DIRS"
          export GTK_ICON_THEME=Adwaita
          # Export PATH for child processes (ags execAsync needs curl)
          export PATH="${pkgs.curl}/bin:$PATH"
        '';
      };
    };
  };
}
