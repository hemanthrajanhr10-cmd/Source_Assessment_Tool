import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, PlusCircle, Bell, Activity } from 'lucide-react'
import Button from '../ui/Button'

const ROUTE_META: Record<string, { label: string; section: string }> = {
  '/':                { label: 'New Assessment',      section: 'SQL Server' },
  '/sessions':        { label: 'Assessment Sessions', section: 'SQL Server' },
  '/jobs':            { label: 'Assessment Jobs',     section: 'SQL Server' },
  '/gateway':         { label: 'Gateway Manager',     section: 'SQL Server' },
  '/hybrid-connection': { label: 'Hybrid Connection', section: 'SQL Server' },
  '/fabric/new':      { label: 'New Fabric',          section: 'Fabric' },
  '/fabric/sessions': { label: 'Fabric Assessments',  section: 'Fabric' },
}

function getBreadcrumb(pathname: string): { label: string; section: string } {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname]
  if (pathname.startsWith('/sessions/')) return { label: 'Session Detail',       section: 'SQL Server' }
  if (pathname.startsWith('/jobs/'))     return { label: 'Job Detail',           section: 'SQL Server' }
  if (pathname.startsWith('/fabric/sessions/')) return { label: 'Fabric Session', section: 'Fabric' }
  return { label: 'Source Assessment Tool', section: '' }
}

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { label: pageTitle, section } = getBreadcrumb(location.pathname)

  const [scrolled, setScrolled] = useState(false)
  const [notifPulse] = useState(false)

  useEffect(() => {
    const mainEl = document.querySelector('main') ?? window
    let ticking = false

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY =
            mainEl instanceof Window
              ? mainEl.scrollY
              : (mainEl as Element).scrollTop
          setScrolled(scrollY > 60)
          ticking = false
        })
        ticking = true
      }
    }

    mainEl.addEventListener('scroll', onScroll, { passive: true })
    return () => mainEl.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`
        sticky top-0 z-20 flex items-center h-14 px-4 sm:px-6 lg:px-8
        border-b border-slate-200/60
        transition-all duration-300
        ${scrolled ? 'glass-nav' : 'bg-white/95'}
      `}
      style={!scrolled ? {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,254,248,0.95) 100%)',
      } : undefined}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-xl text-slate-500 transition-colors mr-3 focus-visible:ring-2"
        onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'rgba(240,253,244,0.8)'; el.style.color = '#16A34A' }}
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
            background: 'rgba(240, 253, 250, 0.8)',
            borderColor: 'rgba(45, 212, 191, 0.5)',
            boxShadow: '0 0 8px rgba(13,148,136,0.08)',
          }}
        >
          <Activity className="h-3 w-3 text-grove-500" aria-hidden="true" />
          <span className="text-[10px] font-semibold text-grove-600 tracking-wide">
            Operational
          </span>
        </div>

        {/* Notification bell */}
        <button
          className="relative p-2 rounded-xl text-slate-400 transition-colors focus-visible:ring-2"
        onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'rgba(240,253,244,0.8)'; el.style.color = '#16A34A' }}
        onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = ''; el.style.color = '' }}
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {notifPulse && (
            <span
              className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: '#16A34A', boxShadow: '0 0 6px rgba(22,163,74,0.55)' }}
              aria-hidden="true"
            />
          )}
        </button>

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
