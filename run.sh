#!/bin/bash
# run.sh - Run Bartender with environment setup
# Loads .env and configures GObject introspection paths

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables from .env
if [[ -f .env ]]; then
    set -a
    source .env
    set +a
fi

# Force Adwaita icons - some themes cause GTK4 crashes
export GTK_ICON_THEME=Adwaita

# GObject introspection paths for Astal libraries
# System typelibs are typically in /usr/lib/girepository-1.0
export GI_TYPELIB_PATH="/usr/lib/girepository-1.0${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"

# Ensure curl/alsa-utils are in PATH for child processes
export PATH="/usr/bin:$PATH"

# Run the bundled application
if [[ -x "$SCRIPT_DIR/bartender" ]]; then
    exec "$SCRIPT_DIR/bartender" "$@"
else
    echo "Error: ./bartender not found. Run 'make build' first."
    exit 1
fi
