import { NavLink, useNavigate } from 'react-router-dom'
import { Database, PlusCircle, List } from 'lucide-react'
import Button from '../ui/Button'

export default function Header() {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand */}
          <NavLink
            to="/"
            className="flex items-center gap-2.5 shrink-0 group"
            aria-label="Source Assessment Tool home"
          >
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-brand-600 text-white shadow-sm group-hover:bg-brand-700 transition-colors">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-slate-900 leading-tight">Source Assessment</p>
              <p className="text-xs text-slate-400 leading-tight">SQL Server Analyzer</p>
            </div>
          </NavLink>

          {/* Nav */}
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <NavLink
              to="/jobs"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <List className="h-4 w-4" aria-hidden="true" />
              <span>All Jobs</span>
            </NavLink>
          </nav>

          {/* CTA */}
          <Button
            size="sm"
            leftIcon={<PlusCircle className="h-4 w-4" />}
            onClick={() => navigate('/')}
            className="shrink-0"
          >
            New Assessment
          </Button>
        </div>
      </div>
    </header>
  )
}
