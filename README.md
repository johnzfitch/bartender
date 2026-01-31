# Bartender

A GTK4 status bar for Hyprland that replaces waybar + mako with proper state management, true transparency, and integrated notifications.

Built with [AGS](https://github.com/Aylur/ags) (Aylur's GTK Shell).

## Quickstart (Arch Linux)

```bash
paru -S bartender-git                              # Install from AUR
mkdir -p ~/.config/bartender && chmod 700 $_       # Create config dir
systemctl --user enable --now bartender.service    # Start (stops waybar/mako)
```

> [!NOTE]
> Bartender's systemd service uses `Conflicts=waybar.service mako.service` for graceful replacement. Both can remain installed; only one runs at a time.

## Features

| | Feature | Description |
|---|---------|-------------|
| ![workspace](.github/assets/icons/workspace.png) | **Workspace Indicators** | 1-5 with visual states: focused, occupied, empty |
| ![network](.github/assets/icons/network.png) | **Feed Ticker** | FreshRSS integration with atomic click handling |
| ![vpn](.github/assets/icons/vpn.png) | **VPN Status** | Mullvad with rotation toggle (US/CA) |
| ![lock](.github/assets/icons/lock.png) | **ProxyForge** | Debug proxy control (mitmdump) |
| ![speaker](.github/assets/icons/speaker.png) | **Audio Toggle** | Speakers/headphones/both via ALSA |
| ![monitor](.github/assets/icons/monitor.png) | **System Tray** | With intelligent icon filtering |

Plus: transparent background, volume slider, clock with calendar popup, WiFi, Bluetooth, weather, and integrated notifications.

![Architecture](.github/assets/architecture.svg)

## Installation

### From AUR (Recommended)

```bash
# Using paru
paru -S bartender-git

# Or using yay
yay -S bartender-git
```

After installation, set up your configuration:

```bash
# Create config directory
mkdir -p ~/.config/bartender

# Create your environment file (see Environment Variables below)
nano ~/.config/bartender/.env

# Protect credentials
chmod 600 ~/.config/bartender/.env

# Enable and start the service
systemctl --user enable --now bartender.service
```

The bartender service will automatically stop waybar and mako when started. See [MIGRATION.md](MIGRATION.md) for detailed migration instructions.

### Development

**Native Arch Linux (recommended for development)**:
```bash
git clone https://github.com/johnzfitch/bartender.git
cd bartender
make install-deps  # One-time: installs pacman/AUR dependencies
make dev           # Build and run
```

**Using Nix**:
```bash
git clone https://github.com/johnzfitch/bartender.git
cd bartender
nix develop --command ags run .
```

### Kill / Restart

```bash
# If using systemd
systemctl --user restart bartender.service

# Manual kill
pkill -9 gjs
# or
ags quit -i bartender
```

### Uninstallation

```bash
# Stop and disable the service
systemctl --user disable --now bartender.service

# Remove the package
paru -R bartender-git

# Optionally remove config (your credentials)
rm -rf ~/.config/bartender

# Restart waybar/mako if desired
systemctl --user start waybar.service mako.service
```

## File Structure

```
bartender/
├── flake.nix                 # Nix build configuration
│
├── app.tsx                   # Entry point - creates bars per monitor
│                             # Sets up instanceName, requestHandler
│
├── Bar.tsx                   # Main bar layout
│   ├── WorkspaceButton()     # Individual workspace with state
│   ├── Workspaces()          # Container for 1-5 buttons
│   ├── Tray()                # System tray with icon filtering
│   ├── Volume()              # WirePlumber volume control
│   └── Clock()               # Time + calendar popup
│
├── services/                 # Singleton state managers
│   ├── feed.ts               # FreshRSS API, weighted random selection
│   │                         # 5-min refresh, 8-sec cycle, pause on hover
│   │
│   ├── vpn.ts                # Mullvad status + rotation daemon
│   │                         # 20-sec interval between US/CA servers
│   │
│   └── proxyforge.ts         # mitmdump process control
│                             # Start/stop proxy, open viewer
│
├── widgets/                  # UI components using services
│   ├── Feed.tsx              # Displays feed.current, click → openCurrent()
│   ├── Vpn.tsx               # VPN icon + rotation toggle
│   ├── ProxyForge.tsx        # Proxy status + controls
│   └── Audio.tsx             # ALSA toggle (amixer card 3)
│
├── styles/
│   └── style.scss            # GTK4 CSS with SCSS preprocessing
│                             # Uses gtkalpha() for transparency
│
└── README.md                 # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FRESHRSS_API_URL` | FreshRSS API endpoint URL | *(required)* |
| `FRESHRSS_AUTH_TOKEN` | Auth token for FreshRSS API | *(required)* |
| `AUDIO_CARD` | ALSA audio card number | `3` |
| `PROXYFORGE_BIN_PATH` | Path to proxyforge binary | `~/.local/bin/proxyforge` |
| `MULLVAD_VPN_PATH` | Path to Mullvad VPN application | `/opt/Mullvad VPN/mullvad-vpn` |

### Setting Up Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example ~/.config/bartender/.env
   ```

2. Edit with your actual values:
   ```bash
   # FreshRSS API Configuration
   FRESHRSS_API_URL=https://your-freshrss-instance.com/api/greader.php/reader/api/0/stream/contents/reading-list
   FRESHRSS_AUTH_TOKEN=your_auth_token_here

   # Audio Configuration (optional - defaults to 3)
   AUDIO_CARD=3

   # ProxyForge Configuration (optional)
   PROXYFORGE_BIN_PATH=~/.local/bin/proxyforge

   # VPN Configuration (optional)
   MULLVAD_VPN_PATH=/opt/Mullvad VPN/mullvad-vpn
   ```

3. Protect your credentials:
   ```bash
   chmod 600 ~/.config/bartender/.env
   ```

> [!WARNING]
> Never commit your `.env` file to version control. The `.env.example` file is provided as a template showing required variables without exposing real credentials.

## Styling

GTK4 CSS is NOT regular CSS. Key differences:

### Transparency

```scss
// SCSS wrapper for GTK alpha function
@function gtkalpha($c, $a) {
  @return string.unquote("alpha(#{$c},#{$a})");
}

window.bartender {
  background: transparent;  // Window itself is transparent

  > box {
    background: gtkalpha(#1a1b26, 0.85);  // Inner box has alpha
  }
}
```

### Stripping Button Chrome

```scss
button {
  all: unset;  // Remove ALL default GTK styling
  padding: 8px;
  // Set colors per-widget, not globally
}
```

### Workspace States

```scss
.workspaces .ws {
  color: rgba($foreground, 0.2);  // Empty (default)

  &.occupied { color: rgba($foreground, 0.7); }
  &.focused { color: $foreground; font-weight: bold; }
}
```

## Security Considerations

- **API Endpoints**: The FreshRSS API URL is configured via environment variable to avoid exposing infrastructure details in code
- **URL Validation**: All URLs from external feeds are validated to only allow `http://` and `https://` schemes, preventing execution of dangerous schemes like `javascript:` or `file://`
- **Credentials**: Authentication tokens must be stored in environment variables, not hardcoded in source
- **Path Configuration**: System paths are configurable to avoid hardcoded assumptions about system layout

## Dependencies

Managed via `flake.nix` or `install-deps.sh`:

**Pacman:**
- gjs, gtk4, gtk4-layer-shell, libsoup3, libadwaita
- alsa-utils (for amixer in Audio widget)
- curl (for feed fetching)
- dart-sass

**AUR:**
- AGS with Astal packages: libastal-{io,4,hyprland,tray,wireplumber,network,bluetooth,notifd}-git
- aylurs-gtk-shell

## Troubleshooting

### "instance has no request handler"
AGS is already running. Kill with `pkill -9 gjs`

### Workspace states not updating
Ensure signals are connected:
```tsx
hyprland.connect("notify::focused-workspace", update)
hyprland.connect("notify::workspaces", update)
```

### No transparency
- Window needs `background: transparent`
- Use `gtkalpha()` for inner elements (not `rgba()`)
- Check compositor supports transparency

### Feed not loading
- Verify `FRESHRSS_API_URL` and `FRESHRSS_AUTH_TOKEN` are set in `~/.config/bartender/.env`
- Check `curl` is available: `which curl`
- Test the API manually: `curl -H "Authorization: GoogleLogin auth=YOUR_TOKEN" "$FRESHRSS_API_URL"`

### GTK4 crash on startup
Some icon themes cause infinite recursion in GTK4. Set a safe theme:
```bash
export GTK_ICON_THEME=Adwaita
```
The systemd service and wrapper script set this automatically.

### Service starts but no bar visible
1. Check Hyprland is running
2. Verify GTK4 layer shell: `pacman -Q gtk4-layer-shell`
3. Check for errors: `journalctl --user -u bartender.service -f`

## Migration from Waybar/Mako

See **[MIGRATION.md](MIGRATION.md)** for:
- Feature comparison table
- Step-by-step migration procedure
- Configuration migration guide
- Rollback instructions

**Quick rollback:**
```bash
systemctl --user stop bartender.service
systemctl --user start waybar.service mako.service
```

## License

MIT
