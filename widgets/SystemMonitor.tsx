import { createState, onCleanup } from "ags"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"

interface SystemStats {
  cpuPercent: number
  memPercent: number
  memUsedGB: number
  memTotalGB: number
  cpuTemp?: number
}

// Track previous CPU values for calculating usage
let prevIdle = 0
let prevTotal = 0

async function getStats(): Promise<SystemStats> {
  // CPU usage from /proc/stat
  const statContent = await execAsync(["cat", "/proc/stat"])
  const cpuLine = statContent.split("\n")[0]
  const cpuValues = cpuLine.split(/\s+/).slice(1).map(Number)
  const idle = cpuValues[3] + (cpuValues[4] || 0) // idle + iowait
  const total = cpuValues.reduce((a, b) => a + b, 0)

  const idleDelta = idle - prevIdle
  const totalDelta = total - prevTotal
  const cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0

  prevIdle = idle
  prevTotal = total

  // Memory from /proc/meminfo
  const memContent = await execAsync(["cat", "/proc/meminfo"])
  const memLines = memContent.split("\n")
  const getValue = (key: string): number => {
    const line = memLines.find((l) => l.startsWith(key))
    if (!line) return 0
    const match = line.match(/(\d+)/)
    return match ? parseInt(match[1], 10) : 0
  }

  const memTotalKB = getValue("MemTotal:")
  const memAvailKB = getValue("MemAvailable:")
  const memUsedKB = memTotalKB - memAvailKB
  const memPercent = Math.round((memUsedKB / memTotalKB) * 100)
  const memUsedGB = memUsedKB / 1024 / 1024
  const memTotalGB = memTotalKB / 1024 / 1024

  // CPU temperature (optional, try thermal zones)
  let cpuTemp: number | undefined
  try {
    const tempContent = await execAsync(["cat", "/sys/class/thermal/thermal_zone0/temp"])
    cpuTemp = Math.round(parseInt(tempContent.trim(), 10) / 1000)
  } catch {
    // Temperature not available
  }

  return { cpuPercent, memPercent, memUsedGB, memTotalGB, cpuTemp }
}

export default function SystemMonitor() {
  const [stats, setStats] = createState<SystemStats>({
    cpuPercent: 0,
    memPercent: 0,
    memUsedGB: 0,
    memTotalGB: 0,
  })

  async function refresh(): Promise<void> {
    try {
      const newStats = await getStats()
      setStats(newStats)
    } catch (e) {
      console.error("SystemMonitor refresh error:", e)
    }
  }

  // Initial fetch
  refresh()

  // Poll every 2 seconds
  const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
    refresh()
    return GLib.SOURCE_CONTINUE
  })

  onCleanup(() => GLib.source_remove(timer))

  const getCpuClass = (s: SystemStats): string[] => {
    const cpu = s.cpuPercent
    if (cpu >= 90) return ["sysmon-stat", "critical"]
    if (cpu >= 70) return ["sysmon-stat", "high"]
    if (cpu >= 50) return ["sysmon-stat", "medium"]
    return ["sysmon-stat", "normal"]
  }

  const getMemClass = (s: SystemStats): string[] => {
    const mem = s.memPercent
    if (mem >= 90) return ["sysmon-stat", "critical"]
    if (mem >= 70) return ["sysmon-stat", "high"]
    if (mem >= 50) return ["sysmon-stat", "medium"]
    return ["sysmon-stat", "normal"]
  }

  const openMonitor = () => {
    execAsync(["foot", "-e", "btop"]).catch(() => {
      execAsync(["foot", "-e", "htop"]).catch(console.error)
    })
  }

  return (
    <menubutton cssClasses={["sysmon"]}>
      <box spacing={8}>
        <box cssClasses={stats((s) => getCpuClass(s))} spacing={4}>
          <image iconName="utilities-system-monitor-symbolic" />
          <label label={stats((s) => `${s.cpuPercent}%`)} />
        </box>
        <box cssClasses={stats((s) => getMemClass(s))} spacing={4}>
          <image iconName="drive-harddisk-symbolic" />
          <label label={stats((s) => `${s.memPercent}%`)} />
        </box>
      </box>
      <popover>
        <box cssClasses={["sysmon-popover"]} orientation={1} spacing={8}>
          <box cssClasses={["sysmon-header"]}>
            <label label="System Monitor" />
          </box>

          <box cssClasses={["sysmon-detail"]} spacing={8}>
            <image iconName="utilities-system-monitor-symbolic" />
            <box orientation={1}>
              <label label="CPU" xalign={0} cssClasses={["sysmon-label"]} />
              <label label={stats((s) => `${s.cpuPercent}%`)} xalign={0} cssClasses={["sysmon-value"]} />
            </box>
          </box>

          <box cssClasses={["sysmon-detail"]} spacing={8}>
            <image iconName="drive-harddisk-symbolic" />
            <box orientation={1}>
              <label label="Memory" xalign={0} cssClasses={["sysmon-label"]} />
              <label
                label={stats((s) => `${s.memUsedGB.toFixed(1)} / ${s.memTotalGB.toFixed(1)} GB (${s.memPercent}%)`)}
                xalign={0}
                cssClasses={["sysmon-value"]}
              />
            </box>
          </box>

          <box cssClasses={["sysmon-detail"]} spacing={8}>
            <image iconName="sensors-temperature-symbolic" />
            <box orientation={1}>
              <label label="Temperature" xalign={0} cssClasses={["sysmon-label"]} />
              <label
                label={stats((s) => s.cpuTemp !== undefined ? `${s.cpuTemp}°C` : "N/A")}
                xalign={0}
                cssClasses={["sysmon-value"]}
              />
            </box>
          </box>

          <box cssClasses={["sysmon-divider"]} />

          <button cssClasses={["sysmon-open"]} onClicked={openMonitor}>
            <label label="Open btop" />
          </button>
        </box>
      </popover>
    </menubutton>
  )
}
