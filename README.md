# Bartender

A GTK4 status bar built with [AGS](https://github.com/Aylur/ags) (Aylur's GTK Shell) for Hyprland. Designed to replace waybar with proper state management and transparency.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  1  2  3  4  5  │  HN: Front Page | Article Title Here...  │ ● ● 🔊 📡 🔒 Thu Jan 01 │
│  ▲        ▲     │              ▲                           │     ▲              ▲    │
│  │        │     │              │                           │     │              │    │
│  │        │     │         Feed Ticker                      │   Status        Clock   │
│  │        │     │        (click to open)                   │   Icons                 │
│  │        │                                                                          │
│  │     Occupied                                                                      │
│  │     (dimmed)                                                                      │
│  │                                                                                   │
│  Focused                                                                             │
│  (bright)                                                                            │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

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

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                           app.tsx                                │
│                    (Entry point, per-monitor)                    │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                           Bar.tsx                                │
│                     (Main layout component)                      │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │    START    │  │     CENTER      │  │        END          │  │
│  │ ┌─────────┐ │  │  ┌───────────┐  │  │ ┌────┐ ┌────────┐  │  │
│  │ │Workspace│ │  │  │   Feed    │  │  │ │Tray│ │ Audio  │  │  │
│  │ │ Buttons │ │  │  │  Ticker   │  │  │ └────┘ └────────┘  │  │
│  │ └─────────┘ │  │  └───────────┘  │  │ ┌────┐ ┌────────┐  │  │
│  │             │  │                 │  │ │Vol │ │Proxyfrg│  │  │
│  │             │  │                 │  │ └────┘ └────────┘  │  │
│  │             │  │                 │  │ ┌────┐ ┌────────┐  │  │
│  │             │  │                 │  │ │VPN │ │ Clock  │  │  │
│  │             │  │                 │  │ └────┘ └────────┘  │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
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

## State Flow

```
┌─────────────────┐     subscribe()      ┌─────────────────┐
│                 │ ◄─────────────────── │                 │
│    Service      │                      │     Widget      │
│   (Singleton)   │ ───────────────────► │   (Component)   │
│                 │      _notify()       │                 │
└────────┬────────┘                      └─────────────────┘
         │
         │  Holds state:
         │  - articles[]
         │  - current
         │  - status
         │
         ▼
┌─────────────────┐
│   Click Event   │
│                 │
│ openCurrent() ──┼──► Reads this.current at call time
│                 │    (No race condition!)
└─────────────────┘
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

| Variable | Description |
|----------|-------------|
| `FRESHRSS_AUTH_TOKEN` | Auth token for FreshRSS API |

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
