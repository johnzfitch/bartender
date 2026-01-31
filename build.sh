#!/bin/bash
# build.sh - Build Bartender executable
# Creates self-contained ./bartender bundle (~850KB)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for ags
if ! command -v ags &>/dev/null; then
    echo "Error: ags not found. Run ./install-deps.sh first."
    exit 1
fi

echo "Bundling app.tsx -> ./bartender"
ags bundle app.tsx ./bartender -d "SRC='$SCRIPT_DIR'"

chmod +x ./bartender
echo "Build complete: ./bartender ($(du -h ./bartender | cut -f1))"
