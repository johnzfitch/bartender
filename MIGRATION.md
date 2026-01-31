# Migrating to Bartender from Waybar/Mako

This guide helps you transition from waybar (status bar) and mako (notifications) to Bartender, which provides both in a single GTK4 application.

## Feature Comparison

| Feature | Waybar | Mako | Bartender |
|---------|--------|------|-----------|
| Status bar | Yes | - | Yes |
| Notifications | - | Yes | Yes |
| Workspace indicators | Yes | - | Yes |
| System tray | Yes | - | Yes |
| Volume control | Yes | - | Yes |
| Network status | Yes | - | Yes |
| Bluetooth | Yes | - | Yes |
| Clock/Calendar | Yes | - | Yes |
| Notification center | - | Yes | Yes |
| GTK4 native | No | No | Yes |
| Hyprland-optimized | Partial | Partial | Yes |
| Transparency | Yes | Yes | Yes (proper alpha) |

### Bartender-Specific Features

- **Feed Ticker**: FreshRSS integration for RSS headlines
- **VPN Widget**: Mullvad VPN status with server rotation
- **ProxyForge**: Debug proxy control (mitmdump)
- **Audio Toggle**: Quick switch between speakers/headphones
- **Weather Widget**: Current conditions display

## Migration Steps

### 1. Install Bartender

```bash
# From AUR
paru -S bartender-git

# Or with yay
yay -S bartender-git
```

### 2. Configure Credentials

```bash
# Create config directory
mkdir -p ~/.config/bartender

# Create environment file
cat > ~/.config/bartender/.env << 'EOF'
# FreshRSS API (optional - for feed widget)
FRESHRSS_API_URL=https://your-instance.com/api/greader.php/reader/api/0/stream/contents/reading-list
FRESHRSS_AUTH_TOKEN=your_token_here

# Audio card number
AUDIO_CARD=3
EOF

# Protect credentials
chmod 600 ~/.config/bartender/.env
```

### 3. Switch Services

The bartender systemd service is configured to automatically stop waybar and mako when started:

```bash
# Enable and start bartender (stops waybar/mako automatically)
systemctl --user enable --now bartender.service

# Verify it's running
systemctl --user status bartender.service
```

### 4. Update Hyprland Config

Remove or comment out waybar/mako autostart in `~/.config/hypr/hyprland.conf`:

```conf
# OLD: exec-once = waybar
# OLD: exec-once = mako

# Bartender is started via systemd, but you can also add:
# exec-once = systemctl --user start bartender.service
```

## Rollback Instructions

If you need to switch back to waybar/mako:

```bash
# Stop bartender
systemctl --user stop bartender.service
systemctl --user disable bartender.service

# Start waybar and mako
systemctl --user start waybar.service
systemctl --user start mako.service

# Or uninstall completely
paru -R bartender-git
```

Both waybar and mako can remain installed alongside bartender - the systemd `Conflicts=` directive handles runtime exclusivity without package-level conflicts.

## Configuration Migration

### Waybar Modules to Bartender Widgets

| Waybar Module | Bartender Widget | Notes |
|---------------|------------------|-------|
| `hyprland/workspaces` | Built-in | Automatic, shows 1-5 |
| `tray` | Built-in | With icon filtering |
| `pulseaudio` | Built-in | Volume slider |
| `clock` | Built-in | With calendar popup |
| `network` | Built-in | WiFi status |
| `bluetooth` | Built-in | Connection status |
| `custom/*` | Services | See services/ directory |

### Mako Settings to Bartender

| Mako Setting | Bartender Equivalent |
|--------------|---------------------|
| `default-timeout` | Configured in NotificationPanel.tsx |
| `max-visible` | Configured in NotificationPanel.tsx |
| `anchor` | Position set in Bar.tsx |
| `layer` | GTK4 layer shell integration |

## Troubleshooting

### Bartender won't start

1. Check logs: `journalctl --user -u bartender.service -f`
2. Verify AGS is installed: `which ags`
3. Try running directly: `/usr/bin/bartender-wrapper`

### No transparency

1. Ensure your compositor supports transparency
2. Check `GTK_ICON_THEME=Adwaita` is set (some themes cause crashes)

### Waybar/mako still running

```bash
# Force stop via pkill
pkill waybar
pkill mako

# Or disable their services
systemctl --user disable waybar.service mako.service
```

### Feed widget not working

1. Verify FRESHRSS_API_URL is set in `~/.config/bartender/.env`
2. Test the API: `curl -H "Authorization: GoogleLogin auth=YOUR_TOKEN" "$FRESHRSS_API_URL"`

### Service starts but no bar visible

1. Check Hyprland is running
2. Verify GTK4 layer shell: `pacman -Q gtk4-layer-shell`
3. Check for errors: `journalctl --user -u bartender.service`
