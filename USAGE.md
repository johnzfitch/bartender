# Bartender Usage

## Command-line Wrapper

A `bartender` command-line wrapper is available in `~/.local/bin/bartender`.

### Basic Usage

```bash
# Start in background (headless mode)
bartender

# Show live logs (foreground)
bartender --log

# Run with debug output
bartender --debug

# Check status
bartender --status

# Stop bartender
bartender --stop

# Restart bartender
bartender --restart

# Show help
bartender --help
```

### Examples

**Start bartender headlessly:**
```bash
$ bartender
Starting bartender in background...
Bartender is running
  PID: 809000
  Working directory: /home/zack/dev/bartender
  Articles in cache: 1000

  Use 'bartender --log' to see live output
  Use 'bartender --stop' to stop
  Use 'bartender --status' to check status
```

**Watch live logs:**
```bash
$ bartender --log
Starting bartender with live logs (Ctrl+C to stop)...
bartender-Message: 17:12:56.619: [Feed] Service starting...
bartender-Message: 17:12:56.620: [Feed] Using cached articles (1000 articles, 417s old)
bartender-Message: 17:12:56.620: [Feed] 1000/1000 candidates (15000s threshold)
bartender-Message: 17:12:56.625: [Feed] Service initialized
...
```

**Check status:**
```bash
$ bartender --status
Bartender is running
  PID: 809000
  Working directory: /home/zack/dev/bartender
  Articles in cache: 1000
```

## Systemd Service

Alternatively, you can use systemd to manage bartender:

```bash
# Start
systemctl --user start bartender

# Stop
systemctl --user stop bartender

# Enable auto-start on login
systemctl --user enable bartender

# Check status
systemctl --user status bartender

# View logs
journalctl --user -u bartender -f
```

## Debug Logs

When `debug_log = true` is set in `~/.config/bartender/config.toml`, bartender writes debug logs to:

```
~/.local/state/bartender/feed-debug-YYYY-MM-DD.log
```

Logs are automatically rotated:
- **Max age**: 7 days
- **Max size**: 5MB per file

## Cache

Article cache is stored at:

```
~/.local/state/bartender/article-cache.json
```

The cache persists between restarts. If the cache is fresh (< 90 seconds old), bartender will use it immediately without fetching from the network.

## Configuration

Edit `~/.config/bartender/config.toml` to configure bartender.

The config file is watched for changes and automatically reloaded (250ms debounce).
