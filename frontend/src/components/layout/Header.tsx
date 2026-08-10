import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Menu, PlusCircle, Bell, Activity,
  CheckCircle2, AlertCircle, Info, AlertTriangle,
  X, Trash2, CheckCheck,
} from 'lucide-react'
import Button from '../ui/Button'
import { useNotifications, type Notification, type NotifKind } from '../../context/NotificationContext'
import AccountExpiryBadge from './AccountExpiryBadge'

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
  success: { icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
  error:   { icon: AlertCircle,   color: 'text-red-500',     bg: 'bg-red-50',      border: 'border-red-200'     },
  warning: { icon: AlertTriangle, color: 'text-amber-500',   bg: 'bg-amber-50',    border: 'border-amber-200'   },
  info:    { icon: Info,          color: 'text-teal-600',    bg: 'bg-teal-50',     border: 'border-teal-200'    },
}

function NotificationItem({ n, onDismiss }: { n: Notification; onDismiss: (id: string) => void }) {
  const { icon: Icon, color, bg, border } = KIND_META[n.kind]
  return (
    <div
      className={`group relative flex gap-3 px-4 py-3 transition-colors duration-150 ${
        n.read ? 'opacity-50' : ''
      } hover:bg-teal-50/60`}
    >
      {/* Unread dot */}
      {!n.read && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: '#6CBDB5' }} />
      )}

      {/* Kind icon */}
      <div className={`mt-0.5 h-7 w-7 rounded-lg ${bg} border ${border} flex items-center justify-center shrink-0`}>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-snug" style={{ color: '#1E293B' }}>{n.title}</p>
        {n.body && (
          <p className="mt-0.5 text-[12px] leading-relaxed line-clamp-2" style={{ color: '#64748B' }}>{n.body}</p>
        )}
        <p className="mt-1 text-[11px] tabular-nums" style={{ color: '#94A3B8' }}>{relativeTime(n.ts)}</p>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(n.id)}
        className="shrink-0 mt-0.5 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all"
        style={{ color: '#94A3B8' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#0F766E'; e.currentTarget.style.backgroundColor = 'rgba(108,189,181,0.12)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '' }}
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

        {/* Account expiry badge */}
        <AccountExpiryBadge />

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
                background: '#FFFFFF',
                border: '1px solid rgba(108,189,181,0.35)',
                boxShadow: '0 8px 32px rgba(108,189,181,0.18), 0 2px 12px rgba(0,0,0,0.08)',
              }}
            >
              {/* Panel header */}
              <div
                className="flex items-center gap-2 px-4 py-3 border-b"
                style={{
                  borderColor: 'rgba(108,189,181,0.25)',
                  background: 'linear-gradient(135deg, rgba(147,204,198,0.12) 0%, rgba(108,189,181,0.06) 100%)',
                }}
              >
                <Bell className="h-3.5 w-3.5" style={{ color: '#6CBDB5' }} />
                <span className="flex-1 text-[13px] font-semibold" style={{ color: '#0F766E' }}>Notifications</span>
                {notifications.length > 0 && (
                  <>
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
                      style={{ color: '#64748B' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#0F766E'; e.currentTarget.style.backgroundColor = 'rgba(108,189,181,0.12)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#64748B'; e.currentTarget.style.backgroundColor = '' }}
                      title="Mark all read"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Mark read
                    </button>
                    <button
                      onClick={clearAll}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
                      style={{ color: '#94A3B8' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.07)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '' }}
                      title="Clear all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>

              {/* Items */}
              <div className="max-h-[420px] overflow-y-auto divide-y divide-teal-100">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell className="h-6 w-6 mx-auto mb-2" style={{ color: '#93CCC6', opacity: 0.6 }} />
                    <p className="text-[13px]" style={{ color: '#64748B' }}>No notifications yet.</p>
                    <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>Assessment completions and errors will appear here.</p>
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
