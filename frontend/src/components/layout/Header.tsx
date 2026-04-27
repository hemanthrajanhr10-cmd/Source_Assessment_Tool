import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, PlusCircle, Bell } from 'lucide-react'
import Button from '../ui/Button'

const ROUTE_LABELS: Record<string, string> = {
  '/':                'New Assessment',
  '/sessions':        'Assessment Sessions',
  '/jobs':            'Assessment Jobs',
  '/gateway':         'Gateway Manager',
  '/fabric/new':      'New Fabric Assessment',
  '/fabric/sessions': 'Fabric Assessments',
}

function getBreadcrumb(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  if (pathname.startsWith('/sessions/')) return 'Session Detail'
  if (pathname.startsWith('/jobs/'))     return 'Job Detail'
  if (pathname.startsWith('/fabric/sessions/')) return 'Fabric Session Detail'
  return 'Source Assessment Tool'
}

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const pageTitle = getBreadcrumb(location.pathname)

  /* Glass morphism activates after 60px scroll */
  const [scrolled, setScrolled] = useState(false)

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
        bg-white border-b border-slate-200/80
        transition-[background,backdrop-filter,box-shadow,border-color]
        duration-300
        ${scrolled ? 'glass-nav' : ''}
      `}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700
                   transition-colors mr-3 focus-visible:ring-2 focus-visible:ring-amber-500/40"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-bold text-slate-900 truncate font-display tracking-tight leading-tight">
          {pageTitle}
        </h2>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600
                     transition-colors relative focus-visible:ring-2 focus-visible:ring-amber-500/40"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        <Button
          size="sm"
          leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
          onClick={() => navigate('/')}
          className="hidden sm:flex"
        >
          New Assessment
        </Button>
      </div>
    </header>
  )
}
