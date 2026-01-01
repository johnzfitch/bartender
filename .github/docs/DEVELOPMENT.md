# Bartender - AGS Bar Migration Plan

## Overview

Replace waybar with a native AGS (Aylur's GTK Shell) bar to fix fundamental architectural issues, particularly the feed-ticker race condition where clicks open the wrong article.

## Core Problem

Waybar's polling model creates state/event desynchronization:
```
[waybar polls script] → [script outputs JSON] → [separate click handler reads file]
                             ↓ (race)                    ↓ (stale)
                         state written              state read
```

AGS fix: Single source of truth with closure-captured state at render time.

## Architecture

```
src/
├── app.tsx                 # Entry point
├── Bar.tsx                 # Main bar layout
├── services/
│   ├── feed.ts            # FreshRSS API, article state
│   ├── vpn.ts             # Mullvad CLI wrapper
│   ├── proxy.ts           # ProxyForge + Stealth proxy
│   └── audio.ts           # ALSA audio toggle
├── widgets/
│   ├── Feed.tsx           # Feed ticker (critical path)
│   ├── Vpn.tsx            # Mullvad status + rotation
│   ├── Proxy.tsx          # Proxy status widgets
│   ├── Audio.tsx          # Audio output toggle
│   ├── Clock.tsx          # Time + calendar popup
│   └── Workspaces.tsx     # Hyprland workspaces
└── lib/
    └── utils.ts           # Shared utilities
```

## Modules to Migrate

### Custom (Complex)
| Module | Source Script | Key Fix Needed |
|--------|--------------|----------------|
| Feed Ticker | feed-ticker.sh | Race condition - atomic state/click binding |
| VPN Status | mullvad-status.sh, mullvad-rotate.sh | Background rotation daemon |
| Stealth Proxy | stealth-proxy-status.sh | Systemd service control |
| ProxyForge | proxyforge-status.sh | Process management |
| Audio Toggle | audio-output-toggle.sh | ALSA amixer control |

### Standard (Astal Built-ins)
- Workspaces → AstalHyprland
- Clock → GLib.DateTime polling
- Systray → AstalTray
- Volume → AstalWp (WirePlumber)
- Network → AstalNetwork
- Bluetooth → AstalBluetooth

## Feed Service Design (Critical Path)

```typescript
@register()
class FeedService extends GObject.Object {
  @property(Object) articles: Article[] = []
  @property(Object) current: Article | null = null
  @property(String) status: "loading" | "ready" | "error" = "loading"

  #paused = false
  #refreshTimer: number    // 5 min refresh
  #cycleTimer: number      // 8 sec cycle

  // Weighted random with exponential decay (3hr half-life)
  #selectNext(): void { ... }

  // Click handler uses this.current at call time - NO RACE
  openCurrent(): void {
    if (this.current?.url) execAsync(["xdg-open", this.current.url])
  }

  pause(): void   // On hover
  resume(): void  // On hover lost
}
```

## Feed Widget Design

```typescript
function Feed() {
  const feed = FeedService.get_default()

  return (
    <button
      onClicked={() => feed.openCurrent()}  // Closure captures current
      onHover={() => feed.pause()}
      onHoverLost={() => feed.resume()}
    >
      <label label={bind(feed, "current").as(a =>
        a ? `${a.source} | ${a.title}` : "Loading..."
      )} />
    </button>
  )
}
```

## State Management Patterns

### File-based (current waybar)
- `~/.cache/waybar-feed-current-url` → headline|||url
- `/tmp/mullvad-auto-rotate` → flag file
- `/tmp/proxy-unconcentrated` → flag file

### AGS equivalent
- GObject properties with signals
- Service singletons hold state
- No external files needed for inter-widget communication

## External Dependencies

| Dependency | Used By | AGS Approach |
|------------|---------|--------------|
| curl + jq | feed-ticker | Native fetch() API |
| hyprctl cursorpos | feed hover | Native GTK hover events |
| mullvad CLI | VPN | execAsync() wrapper |
| amixer | audio | execAsync() wrapper |
| systemctl | proxy | execAsync() wrapper |
| notify-send | notifications | AstalNotifd or GLib |
| xdg-open | URL opening | execAsync() |

## API Endpoints

### FreshRSS
```
GET https://feed.internetuniverse.org/api/greader.php/reader/api/0/stream/contents/reading-list
  ?n=100
  &ot={unix_timestamp_36hrs_ago}
  &output=json
Headers:
  Authorization: GoogleLogin auth=$FRESHRSS_AUTH_TOKEN
```

## Implementation Order

### Phase 1: Foundation (Day 1-2)
1. flake.nix with AGS + Astal deps
2. app.tsx entry point
3. Bar.tsx with basic layout
4. Test: bar appears on screen

### Phase 2: Feed Module (Day 3-4) - CRITICAL PATH
1. FeedService with fetch, parse, weighted selection
2. Feed widget with hover pause
3. Test: headlines cycle, clicks work correctly

### Phase 3: VPN Module (Day 5)
1. VpnService with status + rotation daemon
2. Vpn widget with popover controls
3. Test: rotation toggles, status updates

### Phase 4: Proxy Modules (Day 6)
1. ProxyService for both stealth + proxyforge
2. Proxy widgets with toggle controls
3. Test: services start/stop correctly

### Phase 5: Audio + Standard (Day 7)
1. Audio toggle widget (amixer)
2. Integrate Astal modules (systray, volume, network)
3. Clock with calendar popup

### Phase 6: Polish (Day 8)
1. CSS styling matching current theme
2. Multi-monitor support
3. Edge cases and error handling
4. Cutover from waybar

## Success Criteria

1. Feed ticker: Zero click/display mismatches
2. Refresh: Articles update every 5 minutes
3. Story variety: 20+ unique headlines per hour
4. Click latency: URL opens within 100ms
5. Memory: Stable under 50MB after 24 hours

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AGS learning curve | Start with feed-ticker in isolation |
| GTK4 differences | Use AGS examples as templates |
| Broken bar during migration | Run AGS on separate layer, keep waybar |
| FreshRSS API issues | Graceful degradation, retry logic |

## File References

Current scripts to port:
- `/home/zack/dev/waybarfeed/feed-ticker.sh`
- `/home/zack/dev/waybarfeed/feed-ticker-open.sh`
- `/home/zack/dev/waybarfeed/mullvad-status.sh`
- `/home/zack/dev/waybarfeed/mullvad-rotate.sh`
- `/home/zack/dev/waybarfeed/stealth-proxy-status.sh`
- `/home/zack/dev/waybarfeed/proxyforge-status.sh`
- `/home/zack/dev/waybarfeed/audio-output-toggle.sh`

AGS reference:
- `/home/zack/dev/ags/examples/gtk4/simple-bar/`
