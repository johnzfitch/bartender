import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Gtk from "gi://Gtk?version=4.0"
import Astal from "gi://Astal?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import AstalNotifd from "gi://AstalNotifd"
import { createBinding, createState, For, onCleanup } from "ags"

interface NotificationGroup {
  appName: string
  appIcon: string
  notifications: AstalNotifd.Notification[]
}

// Panel visibility state - shared across instances
let panelVisible = false
const panelListeners: Set<(visible: boolean) => void> = new Set()

export function togglePanel() {
  panelVisible = !panelVisible
  panelListeners.forEach((cb) => cb(panelVisible))
}

export function isPanelVisible() {
  return panelVisible
}

function NotificationItem({ notification }: { notification: AstalNotifd.Notification }) {
  const timeAgo = (timestamp: number): string => {
    const now = GLib.DateTime.new_now_local().to_unix()
    const diff = now - timestamp
    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const getUrgencyClass = (urgency: AstalNotifd.Urgency): string => {
    switch (urgency) {
      case AstalNotifd.Urgency.CRITICAL:
        return "critical"
      case AstalNotifd.Urgency.NORMAL:
        return "normal"
      default:
        return "low"
    }
  }

  return (
    <box cssClasses={["notification", getUrgencyClass(notification.urgency)]} orientation={1}>
      <box cssClasses={["notification-header"]}>
        {notification.appIcon && (
          <image iconName={notification.appIcon} cssClasses={["notification-icon"]} />
        )}
        <label label={notification.appName || "Unknown"} cssClasses={["notification-app"]} />
        <label label={timeAgo(notification.time)} cssClasses={["notification-time"]} hexpand halign={2} />
        <button cssClasses={["notification-close"]} onClicked={() => notification.dismiss()}>
          <image iconName="window-close-symbolic" />
        </button>
      </box>
      <box cssClasses={["notification-content"]} orientation={1}>
        {notification.summary && (
          <label label={notification.summary} cssClasses={["notification-title"]} halign={1} />
        )}
        {notification.body && (
          <label
            label={notification.body}
            cssClasses={["notification-body"]}
            halign={1}
            wrap
            maxWidthChars={40}
          />
        )}
      </box>
      {notification.actions.length > 0 && (
        <box cssClasses={["notification-actions"]}>
          {notification.actions.map((action) => (
            <button cssClasses={["notification-action"]} onClicked={() => notification.invoke(action.id)}>
              <label label={action.label} />
            </button>
          ))}
        </box>
      )}
    </box>
  )
}

function NotificationGroupView({ group }: { group: NotificationGroup }) {
  const [expanded, setExpanded] = createState(true)
  const count = group.notifications.length

  if (count === 0) return <box />

  // Show collapsed view if 5+ notifications from same app
  if (count >= 5 && !expanded()) {
    return (
      <box cssClasses={["notification-group", "collapsed"]} orientation={1}>
        <button cssClasses={["group-header"]} onClicked={() => setExpanded(true)}>
          <box>
            {group.appIcon && <image iconName={group.appIcon} />}
            <label label={group.appName} hexpand halign={1} />
            <label label={`${count} notifications`} cssClasses={["group-count"]} />
            <image iconName="pan-down-symbolic" />
          </box>
        </button>
      </box>
    )
  }

  return (
    <box cssClasses={["notification-group"]} orientation={1}>
      {count >= 5 && (
        <button cssClasses={["group-header"]} onClicked={() => setExpanded(false)}>
          <box>
            {group.appIcon && <image iconName={group.appIcon} />}
            <label label={group.appName} hexpand halign={1} />
            <image iconName="pan-up-symbolic" />
          </box>
        </button>
      )}
      {group.notifications.map((n) => (
        <NotificationItem notification={n} />
      ))}
    </box>
  )
}

export default function NotificationPanel({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  const notifd = AstalNotifd.get_default()
  const notifications = createBinding(notifd, "notifications")
  const [visible, setVisible] = createState(panelVisible)

  // Subscribe to visibility changes
  const updateVisible = (v: boolean) => setVisible(v)
  panelListeners.add(updateVisible)
  onCleanup(() => panelListeners.delete(updateVisible))

  // Group notifications by app
  const groupNotifications = (notifs: AstalNotifd.Notification[]): NotificationGroup[] => {
    const groups: Map<string, NotificationGroup> = new Map()

    for (const n of notifs) {
      const appName = n.appName || "Unknown"
      if (!groups.has(appName)) {
        groups.set(appName, {
          appName,
          appIcon: n.appIcon || "dialog-information-symbolic",
          notifications: [],
        })
      }
      groups.get(appName)!.notifications.push(n)
    }

    return Array.from(groups.values())
  }

  const clearAll = () => {
    for (const n of notifd.notifications) {
      n.dismiss()
    }
  }

  let win: Astal.Window
  const { TOP, RIGHT, BOTTOM } = Astal.WindowAnchor

  onCleanup(() => {
    win?.destroy()
  })

  return (
    <window
      $={(self) => {
        win = self
        self.set_decorated(false)
      }}
      visible={visible}
      cssClasses={["notification-panel"]}
      namespace="bartender-notifications"
      name={`notifications-${gdkmonitor.connector}`}
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      anchor={TOP | RIGHT | BOTTOM}
      marginTop={40}
      marginRight={8}
      marginBottom={8}
      application={app}
    >
      <box orientation={1} cssClasses={["panel-content"]}>
        <box cssClasses={["panel-header"]}>
          <label label="Notifications" cssClasses={["panel-title"]} hexpand halign={1} />
          <button cssClasses={["clear-all"]} onClicked={clearAll}>
            <label label="Clear All" />
          </button>
        </box>
        <Gtk.ScrolledWindow cssClasses={["panel-scroll"]} vexpand>
          <box orientation={1} cssClasses={["notification-list"]}>
            {notifications.as((notifs) => {
              if (notifs.length === 0) {
                return (
                  <box cssClasses={["empty-state"]} hexpand vexpand>
                    <label label="No notifications" />
                  </box>
                )
              }
              const groups = groupNotifications(notifs)
              return groups.map((group) => <NotificationGroupView group={group} />)
            })}
          </box>
        </Gtk.ScrolledWindow>
      </box>
    </window>
  )
}

// Get unread count for clock badge
export function getUnreadCount(): number {
  const notifd = AstalNotifd.get_default()
  return notifd?.notifications?.length || 0
}
