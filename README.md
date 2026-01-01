# Bartender

A GTK4 status bar built with [AGS](https://github.com/Aylur/ags) (Aylur's GTK Shell) for Hyprland. Designed to replace waybar with proper state management and transparency.

![Architecture](.github/assets/architecture.svg)

## Features

| | Feature | Description |
|---|---------|-------------|
| ![workspace](.github/assets/icons/workspace.png) | **Workspace Indicators** | 1-5 with visual states: focused, occupied, empty |
| ![network](.github/assets/icons/network.png) | **Feed Ticker** | FreshRSS integration with atomic click handling |
| ![vpn](.github/assets/icons/vpn.png) | **VPN Status** | Mullvad with rotation toggle (US/CA) |
| ![lock](.github/assets/icons/lock.png) | **ProxyForge** | Debug proxy control (mitmdump) |
| ![speaker](.github/assets/icons/speaker.png) | **Audio Toggle** | Speakers/headphones/both via ALSA |
| ![monitor](.github/assets/icons/monitor.png) | **System Tray** | With intelligent icon filtering |

Plus: transparent background, volume slider, clock with calendar popup

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

## Installation

### Development

```bash
cd ~/dev/bartender
nix develop --command ags run .
```

### Kill / Restart

```bash
# Kill bartender
pkill -9 gjs
# or
ags quit -i bartender

# Restart
cd ~/dev/bartender && nix develop --command ags run .
```

### Autostart (Hyprland)

Add to `~/.config/hypr/autostart.conf`:

```conf
# Disable waybar and use bartender instead
exec-once = sleep 1 && pkill waybar
exec-once = sleep 2 && cd ~/dev/bartender && nix develop --command ags run .
```

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
   cp .env.example .env
   ```

2. Edit `.env` with your actual values:
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

3. Source the environment file before running:
   ```bash
   export $(cat .env | xargs) && nix develop --command ags run .
   ```

**Security Note**: Never commit your `.env` file to version control. The `.env.example` file is provided as a template showing required variables without exposing real credentials.

## Security Considerations

- **API Endpoints**: The FreshRSS API URL is configured via environment variable to avoid exposing infrastructure details in code
- **URL Validation**: All URLs from external feeds are validated to only allow `http://` and `https://` schemes, preventing execution of dangerous schemes like `javascript:` or `file://`
- **Credentials**: Authentication tokens must be stored in environment variables, not hardcoded in source
- **Path Configuration**: System paths are configurable to avoid hardcoded assumptions about system layout

## Dependencies

Managed via `flake.nix`:

- AGS with Astal packages (io, astal4, hyprland, tray, wireplumber, network, bluetooth, notifd)
- `alsa-utils` - for amixer in Audio widget
- `curl` - for feed fetching

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
- Use `gtkalpha()` for inner elements
- Check compositor supports transparency

### Feed not loading
- Verify `FRESHRSS_AUTH_TOKEN` is set
- Check `curl` is available in nix shell
