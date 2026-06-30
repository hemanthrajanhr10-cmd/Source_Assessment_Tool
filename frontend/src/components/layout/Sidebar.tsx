import { NavLink, useNavigate } from 'react-router-dom'
import {
  Layers, List, Network,
  LogOut, Shield, ChevronDown,
  X, BarChart3, Sparkles, LayoutDashboard, Combine, PlusCircle,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  UnifiedLogo, SqlServerLogo, FabricLogo, SapLogo,
  SageIntacctLogo, TableauLogo, SnowflakeIconLogo, DataverseIconLogo,
  SalesforceIconLogo, IbmDb2Logo, InforPNGLogo, DatabricksLogo,
} from '../ui/SourceLogos'
import type { LucideIcon } from 'lucide-react'

type LogoComponent = React.ComponentType<{ size?: number; className?: string }>

interface NavGroup {
  label: string
  element: string
  LogoComponent: LogoComponent
  dotGradient: string
  activeBg: string
  activeText: string
  activeBorder: string
  activeIconColor: string
  activeDotGlow: string
  hoverBg: string
  hoverText: string
  hoverIconColor: string
  items: { to: string; label: string; icon: LucideIcon; exact?: boolean }[]
}

/* ── Unified teal theme applied to every source ─────────────────────────────── */
const TEAL_THEME = {
  dotGradient:     'linear-gradient(135deg, #6CBDB5, #93CCC6)',
  activeBg:        'rgba(108,189,181,0.10)',
  activeText:      '#25706A',
  activeBorder:    'rgba(108,189,181,0.40)',
  activeIconColor: '#4DA8A0',
  activeDotGlow:   'rgba(108,189,181,0.50)',
  hoverBg:         'rgba(108,189,181,0.08)',
  hoverText:       '#25706A',
  hoverIconColor:  '#4DA8A0',
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Unified Assessment',
    element: 'ocean',
    LogoComponent: UnifiedLogo,
    ...TEAL_THEME,
    items: [
      { to: '/unified/new',      label: 'New Assessment', icon: Combine,         exact: true },
      { to: '/unified/sessions', label: 'All Reports',    icon: LayoutDashboard },
    ],
  },
  {
    label: 'DB Assessment',
    element: 'tide',
    LogoComponent: SqlServerLogo,
    ...TEAL_THEME,
    items: [
      { to: '/',                   label: 'Source Only',       icon: PlusCircle, exact: true },
      { to: '/sessions',           label: 'Sessions',          icon: Layers  },
      { to: '/jobs',               label: 'Jobs',              icon: List    },
      { to: '/hybrid-connection',  label: 'Hybrid Connection', icon: Network },
    ],
  },
  {
    label: 'Microsoft Fabric',
    element: 'grove',
    LogoComponent: FabricLogo,
    ...TEAL_THEME,
    items: [
      { to: '/fabric/new',      label: 'Fabric Only',  icon: PlusCircle },
      { to: '/fabric/sessions', label: 'Assessments',  icon: BarChart3  },
    ],
  },
  {
    label: 'SAP Systems',
    element: 'sand',
    LogoComponent: SapLogo,
    ...TEAL_THEME,
    items: [
      { to: '/sap/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/sap/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
  {
    label: 'Sage Intacct',
    element: 'sage',
    LogoComponent: SageIntacctLogo,
    ...TEAL_THEME,
    items: [
      { to: '/sage-intacct/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/sage-intacct/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
  {
    label: 'Tableau',
    element: 'tableau',
    LogoComponent: TableauLogo,
    ...TEAL_THEME,
    items: [
      { to: '/tableau/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/tableau/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
  {
    label: 'Snowflake',
    element: 'snowflake',
    LogoComponent: SnowflakeIconLogo,
    ...TEAL_THEME,
    items: [
      { to: '/snowflake/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/snowflake/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
  {
    label: 'Dataverse',
    element: 'dataverse',
    LogoComponent: DataverseIconLogo,
    ...TEAL_THEME,
    items: [
      { to: '/dataverse/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/dataverse/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
  {
    label: 'Salesforce',
    element: 'salesforce',
    LogoComponent: SalesforceIconLogo,
    ...TEAL_THEME,
    items: [
      { to: '/salesforce/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/salesforce/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
  {
    label: 'IBM Db2',
    element: 'db2',
    LogoComponent: IbmDb2Logo,
    ...TEAL_THEME,
    items: [
      { to: '/db2/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/db2/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
  {
    label: 'Infor CloudSuite',
    element: 'infor',
    LogoComponent: InforPNGLogo,
    ...TEAL_THEME,
    items: [
      { to: '/infor/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/infor/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
  {
    label: 'Databricks',
    element: 'databricks',
    LogoComponent: DatabricksLogo,
    ...TEAL_THEME,
    items: [
      { to: '/databricks/new',      label: 'New Assessment', icon: PlusCircle },
      { to: '/databricks/sessions', label: 'Assessments',    icon: BarChart3  },
    ],
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email.slice(0, 2).toUpperCase() ?? '?'

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/25 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          onKeyDown={(e) => (e.key === 'Escape' || e.key === 'Enter') && onClose()}
          role="button"
          tabIndex={-1}
          aria-label="Close navigation"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col w-60
          bg-white border-r border-slate-200/60
          transition-transform duration-300 ease-out
          lg:translate-x-0 lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #F4FAFA 100%)',
          boxShadow: open
            ? '6px 0 40px rgba(108,189,181,0.10), 2px 0 8px rgba(0,0,0,0.04)'
            : '1px 0 0 0 rgba(178,221,217,0.7)',
        }}
        aria-label="Sidebar navigation"
      >
        {/* ── Logo ────────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between h-16 px-4 border-b border-slate-200/60 shrink-0"
          style={{ background: 'linear-gradient(180deg, rgba(240,250,249,0.8) 0%, rgba(255,255,255,0) 100%)' }}
        >
          <NavLink
            to="/"
            end
            className="flex items-center gap-3 group"
            aria-label="Source Assessment Tool home"
          >
            <div className="relative shrink-0">
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100"
                style={{
                  background: 'rgba(108,189,181,0.16)',
                  animation: 'pulseRing 2.4s ease-out infinite',
                  borderRadius: '12px',
                }}
                aria-hidden="true"
              />
              <div
                className="relative flex items-center justify-center h-9 w-9 rounded-xl overflow-hidden"
                style={{
                  transition: 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 220ms ease',
                  boxShadow: '0 4px 12px rgba(108,189,181,0.30)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'scale(1.08) rotate(-3deg)'
                  el.style.boxShadow = '0 6px 20px rgba(108,189,181,0.48)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'scale(1) rotate(0deg)'
                  el.style.boxShadow = '0 4px 12px rgba(108,189,181,0.30)'
                }}
              >
                <UnifiedLogo size={36} />
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight font-display tracking-tight">
                Source<span className="font-extrabold" style={{ color: '#358F87' }}>SAT</span>
              </p>
              <p className="text-[9px] text-slate-400 leading-tight tracking-widest uppercase mt-0.5">
                Assessment Tool
              </p>
            </div>
          </NavLink>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 transition-colors focus-visible:ring-2"
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'rgba(108,189,181,0.12)'; el.style.color = '#25706A' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = ''; el.style.color = '' }}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Navigation ──────────────────────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto py-5 px-3 space-y-7"
          aria-label="Main navigation"
        >
          {NAV_GROUPS.map((group) => {
            const Logo = group.LogoComponent
            return (
              <div key={group.label}>
                {/* Section label with inline brand logo */}
                <div className="flex items-center gap-2 px-2 mb-2.5">
                  <div className="flex items-center justify-center h-8 w-8 rounded-md shrink-0"
                    style={{ background: 'rgba(108,189,181,0.10)', border: '1px solid rgba(108,189,181,0.20)' }}>
                    <Logo size={24} />
                  </div>
                  <p className="section-title">{group.label}</p>
                </div>

                <ul className="space-y-0.5" role="list">
                  {group.items.map(({ to, label, icon: Icon, exact }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={exact}
                        onClick={() => onClose()}
                        className={({ isActive }) =>
                          `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                           focus-visible:ring-2 focus-visible:outline-none
                           transition-all duration-150
                           ${isActive
                             ? 'font-semibold border'
                             : 'font-medium text-slate-600 hover:text-slate-900 border border-transparent'
                           }`
                        }
                        style={({ isActive }) => ({
                          ...(isActive ? {
                            background: group.activeBg,
                            color: group.activeText,
                            borderColor: group.activeBorder,
                          } : {}),
                          boxShadow: isActive ? 'var(--elevation-1)' : undefined,
                          transform: 'translateX(0)',
                          transition: 'transform 120ms cubic-bezier(0.4,0,0.2,1), background-color 120ms, color 120ms',
                        })}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLAnchorElement
                          if (!el.classList.contains('font-semibold')) {
                            el.style.transform = 'translateX(2px)'
                            el.style.backgroundColor = group.hoverBg
                            el.style.color = group.hoverText
                            el.style.borderColor = group.activeBorder
                            const icon = el.querySelector('svg') as SVGElement | null
                            if (icon) icon.style.color = group.hoverIconColor
                          }
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLAnchorElement
                          if (!el.classList.contains('font-semibold')) {
                            el.style.transform = ''
                            el.style.backgroundColor = ''
                            el.style.color = ''
                            el.style.borderColor = 'transparent'
                            const icon = el.querySelector('svg') as SVGElement | null
                            if (icon) icon.style.color = ''
                          }
                        }}
                        aria-current={undefined}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              className="h-4 w-4 shrink-0 transition-colors duration-120 text-slate-400"
                              style={isActive ? { color: group.activeIconColor } : {}}
                              aria-hidden="true"
                            />
                            <span className="flex-1">{label}</span>
                            {isActive && (
                              <span
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{
                                  background: group.dotGradient,
                                  boxShadow: `0 0 6px ${group.activeDotGlow}`,
                                }}
                                aria-hidden="true"
                              />
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </nav>

        {/* ── User footer ─────────────────────────────────────────────────── */}
        <div
          className="border-t border-slate-200/60 p-3 shrink-0"
          style={{ background: 'linear-gradient(0deg, rgba(240,250,249,0.6) 0%, rgba(255,255,255,0) 100%)' }}
        >
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                         transition-all duration-150 group
                         focus-visible:ring-2 focus-visible:outline-none"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(108,189,181,0.08)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '' }}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <div className="relative shrink-0">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg, #4DA8A0 0%, #93CCC6 100%)',
                    boxShadow: '0 2px 8px rgba(108,189,181,0.40)',
                  }}
                >
                  {initials}
                </div>
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-400 border-2 border-white"
                  style={{ boxShadow: '0 0 6px rgba(108,189,181,0.60)' }}
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">
                  {user?.full_name || user?.email}
                </p>
                {user?.full_name && (
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                )}
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  menuOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-slate-200/80 bg-white py-1.5 z-50 overflow-hidden"
                style={{
                  boxShadow: '0 -8px 32px rgba(108,189,181,0.10), 0 -2px 8px rgba(0,0,0,0.06)',
                  animation: 'scaleIn 0.20s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transformOrigin: 'bottom center',
                }}
                role="menu"
              >
                <div
                  className="h-0.5 mx-3 mb-2 rounded-full"
                  style={{ background: 'linear-gradient(90deg, #358F87, #6CBDB5, #93CCC6)' }}
                  aria-hidden="true"
                />

                {user?.mfa_enabled ? (
                  <div className="px-4 py-2 mx-1.5 mb-1 rounded-xl bg-grove-50 border border-grove-100">
                    <span className="inline-flex items-center gap-1.5 text-xs text-grove-700 font-medium">
                      <Shield className="h-3 w-3" aria-hidden="true" />
                      MFA enabled
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/setup-mfa') }}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600
                               transition-colors rounded-xl"
                    style={{ width: 'calc(100% - 12px)', marginLeft: '6px' }}
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = '#25706A'; el.style.backgroundColor = 'rgba(108,189,181,0.10)' }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = ''; el.style.backgroundColor = '' }}
                    role="menuitem"
                  >
                    <Shield className="h-4 w-4" style={{ color: '#4DA8A0' }} aria-hidden="true" />
                    Enable MFA
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600
                             hover:text-red-600 hover:bg-red-50 transition-colors rounded-xl mx-1.5"
                  style={{ width: 'calc(100% - 12px)', marginLeft: '6px' }}
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100">
            <Sparkles className="h-2.5 w-2.5" style={{ color: '#6CBDB5' }} aria-hidden="true" />
            <span className="text-[9px] text-slate-300 tracking-widest uppercase font-medium">
              UBTI Intelligence
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
