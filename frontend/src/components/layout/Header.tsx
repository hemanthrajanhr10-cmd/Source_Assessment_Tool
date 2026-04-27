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
  // Exact match
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  // Detail pages
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

  return (
    <header
      className="sticky top-0 z-20 flex items-center h-14 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200"
      style={{ boxShadow: '0 1px 0 0 #e2e8f0' }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors mr-3"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-slate-900 truncate">{pageTitle}</h2>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Notification placeholder — visual weight only */}
        <button
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors relative"
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
