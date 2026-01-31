#!/bin/bash
# install-deps.sh - Install Bartender dependencies on Arch Linux
# Requires: pacman, yay/paru (for AUR packages)
# Run once: ./install-deps.sh

set -e

echo "Installing Bartender dependencies..."

# Detect AUR helper
if command -v paru &>/dev/null; then
    AUR="paru"
elif command -v yay &>/dev/null; then
    AUR="yay"
else
    echo "Error: No AUR helper found. Install yay or paru first."
    exit 1
fi

# Runtime dependencies (pacman)
PACMAN_DEPS=(
    gjs
    gtk4
    gtk4-layer-shell
    libsoup3
    libadwaita
    alsa-utils
    curl
    dart-sass
)

# Astal libraries and AGS from chaotic-aur (or AUR)
AUR_DEPS=(
    libastal-io-git
    libastal-4-git
    libastal-hyprland-git
    libastal-tray-git
    libastal-wireplumber-git
    libastal-network-git
    libastal-bluetooth-git
    libastal-notifd-git
    aylurs-gtk-shell
)

echo "Installing pacman packages..."
sudo pacman -S --needed --noconfirm "${PACMAN_DEPS[@]}"

echo "Installing AUR packages via $AUR..."
echo "Note: These are available in chaotic-aur for faster binary installs"
$AUR -S --needed --noconfirm "${AUR_DEPS[@]}"

echo ""
echo "Dependencies installed successfully!"
echo "Next steps:"
echo "  make build   # Bundle the application"
echo "  make run     # Run bartender"
