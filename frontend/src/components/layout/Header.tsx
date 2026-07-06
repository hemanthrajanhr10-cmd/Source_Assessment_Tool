import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Menu, PlusCircle, Bell, Activity,
  CheckCircle2, AlertCircle, Info, AlertTriangle,
  X, Trash2, CheckCheck,
} from 'lucide-react'
import Button from '../ui/Button'
import { useNotifications, type Notification, type NotifKind } from '../../context/NotificationContext'

const ROUTE_META: Record<string, { label: string; section: string }> = {
  '/':                  { label: 'New Assessment',      section: 'SQL Server' },
  '/sessions':          { label: 'Assessment Sessions', section: 'SQL Server' },
  '/jobs':              { label: 'Assessment Jobs',     section: 'SQL Server' },
  '/gateway':           { label: 'Gateway Manager',     section: 'SQL Server' },
  '/hybrid-connection': { label: 'Hybrid Connection',   section: 'SQL Server' },
  '/fabric/new':        { label: 'New Fabric',          section: 'Fabric' },
  '/fabric/sessions':   { label: 'Fabric Assessments',  section: 'Fabric' },
}

function getBreadcrumb(pathname: string): { label: string; section: string } {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname]
  if (pathname.startsWith('/sessions/'))       return { label: 'Session Detail',  section: 'SQL Server' }
  if (pathname.startsWith('/jobs/'))           return { label: 'Job Detail',      section: 'SQL Server' }
  if (pathname.startsWith('/fabric/sessions/')) return { label: 'Fabric Session', section: 'Fabric' }
  return { label: 'Source Assessment Tool', section: '' }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000)  return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const KIND_META: Record<NotifKind, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  success: { icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  error:   { icon: AlertCircle,   color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20'     },
  warning: { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
  info:    { icon: Info,          color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20'     },
}

function NotificationItem({ n, onDismiss }: { n: Notification; onDismiss: (id: string) => void }) {
  const { icon: Icon, color, bg, border } = KIND_META[n.kind]
  return (
    <div
      className={`group relative flex gap-3 px-4 py-3 transition-colors duration-150 ${
        n.read ? 'opacity-60' : ''
      } hover:bg-white/[0.03]`}
    >
      {/* Unread dot */}
      {!n.read && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-amber-400" />
      )}

      {/* Kind icon */}
      <div className={`mt-0.5 h-7 w-7 rounded-lg ${bg} border ${border} flex items-center justify-center shrink-0`}>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-zinc-100 leading-snug">{n.title}</p>
        {n.body && (
          <p className="mt-0.5 text-[12px] text-zinc-400 leading-relaxed line-clamp-2">{n.body}</p>
        )}
        <p className="mt-1 text-[11px] text-zinc-600 tabular-nums">{relativeTime(n.ts)}</p>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(n.id)}
        className="shrink-0 mt-0.5 p-1 rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-300 hover:bg-white/[0.08] transition-all"
        aria-label="Dismiss notification"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { label: pageTitle, section } = getBreadcrumb(location.pathname)
  const { notifications, unreadCount, markAllRead, dismiss, clearAll } = useNotifications()

  const [scrolled, setScrolled]   = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const bellRef   = useRef<HTMLButtonElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)

  // Scroll shadow
  useEffect(() => {
    const mainEl = document.querySelector('main') ?? window
    let ticking = false
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = mainEl instanceof Window ? mainEl.scrollY : (mainEl as Element).scrollTop
          setScrolled(scrollY > 60)
          ticking = false
        })
        ticking = true
      }
    }
    mainEl.addEventListener('scroll', onScroll, { passive: true })
    return () => mainEl.removeEventListener('scroll', onScroll)
  }, [])

  // Click-outside to close panel
  useEffect(() => {
    if (!panelOpen) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panelOpen])

  function togglePanel() {
    if (!panelOpen && unreadCount > 0) markAllRead()
    setPanelOpen(v => !v)
  }

  return (
    <header
      className={`
        sticky top-0 z-20 flex items-center h-14 px-4 sm:px-6 lg:px-8
        border-b border-slate-200/60
        transition-all duration-300
        ${scrolled ? 'glass-nav' : 'bg-white/95'}
      `}
      style={!scrolled ? {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,253,252,0.95) 100%)',
      } : undefined}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-xl text-slate-500 transition-colors mr-3 focus-visible:ring-2"
        onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'rgba(108,189,181,0.12)'; el.style.color = '#358F87' }}
        onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = ''; el.style.color = '' }}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Breadcrumb / Page title */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        {section && (
          <>
            <span className="hidden sm:block text-xs text-slate-400 font-medium">{section}</span>
            <span className="hidden sm:block text-slate-300 text-xs">/</span>
          </>
        )}
        <h2
          className="text-sm font-bold text-slate-900 truncate font-display tracking-tight leading-tight"
          style={{ color: '#0D1117' }}
        >
          {pageTitle}
        </h2>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">

        {/* System status pill */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
          style={{
            background: 'rgba(240, 250, 249, 0.85)',
            borderColor: 'rgba(108,189,181,0.45)',
            boxShadow: '0 0 8px rgba(108,189,181,0.12)',
          }}
        >
          <Activity className="h-3 w-3 text-grove-500" aria-hidden="true" />
          <span className="text-[10px] font-semibold text-grove-600 tracking-wide">Operational</span>
        </div>

        {/* Notification bell */}
        <div className="relative">
          <button
            ref={bellRef}
            onClick={togglePanel}
            className={`relative p-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-amber-400/50 ${
              panelOpen ? 'bg-slate-100 text-slate-700' : 'text-slate-400'
            }`}
            onMouseEnter={(e) => { if (!panelOpen) { e.currentTarget.style.backgroundColor = 'rgba(108,189,181,0.12)'; e.currentTarget.style.color = '#358F87' } }}
            onMouseLeave={(e) => { if (!panelOpen) { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = '' } }}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            aria-expanded={panelOpen}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.55)' }}
                aria-hidden="true"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification panel */}
          {panelOpen && (
            <div
              ref={panelRef}
              className="absolute right-0 top-full mt-2 w-[360px] rounded-2xl overflow-hidden z-50"
              style={{
                background: '#18181b',
                border: '1px solid rgba(63,63,70,0.8)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
              }}
            >
              {/* Panel header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
                <Bell className="h-3.5 w-3.5 text-zinc-500" />
                <span className="flex-1 text-[13px] font-semibold text-zinc-200">Notifications</span>
                {notifications.length > 0 && (
                  <>
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.06]"
                      title="Mark all read"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Mark read
                    </button>
                    <button
                      onClick={clearAll}
                      className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                      title="Clear all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>

              {/* Items */}
              <div className="max-h-[420px] overflow-y-auto divide-y divide-zinc-800/60">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell className="h-6 w-6 text-zinc-700 mx-auto mb-2" />
                    <p className="text-[13px] text-zinc-500">No notifications yet.</p>
                    <p className="text-[11px] text-zinc-600 mt-1">Assessment completions and errors will appear here.</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <NotificationItem key={n.id} n={n} onDismiss={dismiss} />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* New Assessment CTA */}
        <Button
          size="sm"
          leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
          onClick={() => navigate('/')}
          className="hidden sm:flex btn-shimmer"
        >
          New Assessment
        </Button>
      </div>
    </header>
  )
}
