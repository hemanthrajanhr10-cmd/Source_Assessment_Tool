import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

export type NotifKind = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: string
  kind: NotifKind
  title: string
  body?: string
  ts: number
  read: boolean
}

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  push: (kind: NotifKind, title: string, body?: string) => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const counterRef = useRef(0)

  const push = useCallback((kind: NotifKind, title: string, body?: string) => {
    const id = `notif-${Date.now()}-${++counterRef.current}`
    setNotifications(prev => [
      { id, kind, title, body, ts: Date.now(), read: false },
      ...prev,
    ].slice(0, 50))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, push, markAllRead, dismiss, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider')
  return ctx
}
