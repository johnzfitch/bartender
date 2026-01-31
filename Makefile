# Bartender - AGS status bar for Hyprland
# Native Arch Linux build (no Nix required)

.PHONY: install-deps build run dev clean help

help:
	@echo "Bartender build targets:"
	@echo "  make install-deps  Install system dependencies (run once)"
	@echo "  make build         Bundle app.tsx -> ./bartender"
	@echo "  make run           Execute bartender"
	@echo "  make dev           Build and run"
	@echo "  make clean         Remove build artifacts"

install-deps:
	./install-deps.sh

build:
	./build.sh

run:
	./run.sh

dev: build run

clean:
	rm -f ./bartender
	@echo "Cleaned build artifacts"
