# Bartender - AGS Status Bar

A GTK4 status bar built with AGS (Aylur's GTK Shell) to replace waybar.

## Running

```bash
# Development
cd ~/dev/bartender
nix develop --command ags run .

# Kill
pkill -9 gjs
# or
ags quit -i bartender
```

## Architecture

```
bartender/
├── app.tsx           # Entry point, creates bars per monitor
├── Bar.tsx           # Main bar layout with all widgets
├── services/         # Singleton services holding state
│   ├── feed.ts       # FreshRSS feed fetcher
│   ├── vpn.ts        # Mullvad VPN status + rotation
│   └── proxyforge.ts # ProxyForge proxy control
├── widgets/          # UI components
│   ├── Feed.tsx      # Feed ticker display
│   ├── Vpn.tsx       # VPN status icon
│   ├── ProxyForge.tsx# Proxy status icon
│   └── Audio.tsx     # Audio output toggle
├── styles/
│   └── style.scss    # All styling
└── flake.nix         # Nix build config
```

## Key Concepts

### Styling (style.scss)

GTK4 CSS is NOT regular CSS. Key differences:
- Use `background-color` not `background` for colors
- No `!important`
- Limited selectors (no `:has()`, limited pseudo-classes)
- Colors: use `rgba(r, g, b, a)` format directly

**Transparency**: The window background must be `transparent` and the centerbox gets the actual semi-transparent background:

```scss
window.bartender {
  background: transparent;

  centerbox {
    background: rgba(26, 27, 38, 0.8);  // semi-transparent
  }
}
```

**Stripping button chrome**:
```scss
button {
  all: unset;  // removes all default styling
  padding: 8px;
  color: $foreground;
}
```

### Reactive State (AGS patterns)

**createBinding** - reactive property binding:
```tsx
const focused = createBinding(hyprland, "focusedWorkspace")
// Use in JSX:
<label label={focused((f) => f?.name)} />
```

**createState** - local reactive state:
```tsx
const [value, setValue] = createState("initial")
// Update triggers re-render:
setValue("new value")
```

**Manual GObject subscription**:
```tsx
hyprland.connect("notify::focused-workspace", () => {
  // Called when property changes
})
```

### Layout (Bar.tsx)

Uses `<centerbox>` with three sections:
```tsx
<centerbox>
  <box $type="start">   {/* Left side */}
  <box $type="center">  {/* Center */}
  <box $type="end">     {/* Right side */}
</centerbox>
```

### Workspaces

WorkspaceButton component with manual state tracking:
- `hyprland.workspaces` - array of existing workspaces
- `hyprland.focusedWorkspace` - currently focused
- Subscribe to `notify::focused-workspace` and `notify::workspaces` for updates

CSS classes: `.ws.focused`, `.ws.occupied`, `.ws.empty`

### System Tray

Uses AstalTray. Filter items without icons:
```tsx
const hasIcon = item.gicon !== null || item.iconName
if (!hasIcon) return <box />
```

### Services Pattern

Singleton services with subscription:
```ts
class MyService {
  private static _instance: MyService
  private _listeners = new Set<() => void>()

  static get_default() {
    return this._instance ??= new MyService()
  }

  subscribe(cb: () => void) {
    this._listeners.add(cb)
    return () => this._listeners.delete(cb)
  }

  private _notify() {
    this._listeners.forEach(cb => cb())
  }
}
```

## Common Issues

### "instance has no request handler"
AGS is already running. Kill with `pkill -9 gjs`

### Styles not updating
The SCSS is compiled at build time. Restart AGS after style changes.

### Workspace states not showing
Ensure both `notify::focused-workspace` and `notify::workspaces` signals are connected.

### No transparency
- Window needs `background: transparent`
- Centerbox needs the actual background color
- Some compositors need specific settings

## Dependencies (in flake.nix)

- ags (with astal packages: io, astal4, hyprland, tray, wireplumber, network, bluetooth, notifd)
- alsa-utils (for amixer in Audio widget)
- curl (for feed fetching)

## Environment Variables

- `FRESHRSS_AUTH_TOKEN` - Auth token for FreshRSS API
