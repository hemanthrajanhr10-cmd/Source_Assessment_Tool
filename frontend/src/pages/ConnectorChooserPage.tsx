import { useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ArrowRight, Zap, Database as DatabaseIcon, BarChart3, Cloud, Server } from 'lucide-react'
import {
  SqlServerLogo, FabricLogo, SapLogo, SageIntacctLogo,
  TableauLogo, SnowflakeLogo, DataverseLogo, SalesforceLogo,
  IbmDb2Logo, DatabricksLogo, InforPNGLogo,
  PostgreSQLIconLogo, MySQLFullLogo, OracleFullLogo,
} from '../components/ui/SourceLogos'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:         '#F6FFFE',
  canvas:     '#F0FAFA',
  surface:    '#FFFFFF',
  border:     '#B2DDD9',
  borderFaint:'#D4EFEC',
  teal:       '#6CBDB5',
  tealDark:   '#4DA8A0',
  tealMid:    '#93CCC6',
  tealGlow:   'rgba(108,189,181,0.22)',
  tealFaint:  'rgba(108,189,181,0.08)',
  ink:        '#0D1117',
  inkMid:     '#404555',
  inkMute:    '#767A8C',
  inkFaint:   '#B0BAC4',
  shadow1:    '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08)',
  shadow2:    '0 4px 12px rgba(77,168,160,0.12), 0 16px 40px rgba(77,168,160,0.14)',
  shadow3:    '0 8px 24px rgba(77,168,160,0.16), 0 32px 64px rgba(77,168,160,0.18)',
  spring:     'cubic-bezier(0.34,1.56,0.64,1)',
  ease:       'cubic-bezier(0.4,0,0.2,1)',
}

// ── Connector catalogue ───────────────────────────────────────────────────────

type Category = 'Database' | 'Analytics' | 'Cloud ERP' | 'CRM' | 'Platform'

interface Connector {
  id: string
  name: string
  tagline: string
  route: string
  Logo: React.ComponentType<{ size?: number }>
  category: Category
  tags: string[]
  accent: string
  checks: number
}

// Wrappers so MySQL/Oracle accept the same size prop as other connectors
function MySQLLogo({ size = 36 }: { size?: number }) {
  return <MySQLFullLogo height={Math.round(size * 0.7)} />
}
function OracleLogo({ size = 36 }: { size?: number }) {
  return <OracleFullLogo height={Math.round(size * 0.55)} />
}

const CONNECTORS: Connector[] = [
  {
    id: 'sql-server',
    name: 'SQL Server',
    tagline: 'On-prem & Azure SQL — schema, performance, security',
    route: '/?engine=mssql',
    Logo: SqlServerLogo,
    category: 'Database',
    tags: ['Microsoft', 'MSSQL', 'Azure', 'On-Prem'],
    accent: '#CC2927',
    checks: 180,
  },
  {
    id: 'fabric',
    name: 'Microsoft Fabric',
    tagline: 'Unified analytics — Lakehouse, Warehouse, Pipelines',
    route: '/fabric/new',
    Logo: FabricLogo,
    category: 'Analytics',
    tags: ['Microsoft', 'Lakehouse', 'Power BI', 'OneLake'],
    accent: '#0078D4',
    checks: 220,
  },
  {
    id: 'sap',
    name: 'SAP Systems',
    tagline: 'ECC, S/4HANA, BW, HANA, SuccessFactors & more',
    route: '/sap/new',
    Logo: SapLogo,
    category: 'Cloud ERP',
    tags: ['ECC', 'S/4HANA', 'BW', 'HANA', 'RFC'],
    accent: '#0070D2',
    checks: 340,
  },
  {
    id: 'sage-intacct',
    name: 'Sage Intacct',
    tagline: 'Cloud financials — GL, AP, AR, reporting complexity',
    route: '/sage-intacct/new',
    Logo: SageIntacctLogo,
    category: 'Cloud ERP',
    tags: ['Finance', 'Cloud', 'GL', 'AP', 'AR'],
    accent: '#00855A',
    checks: 120,
  },
  {
    id: 'tableau',
    name: 'Tableau',
    tagline: 'Workbooks, data sources, permissions, embed usage',
    route: '/tableau/new',
    Logo: TableauLogo,
    category: 'Analytics',
    tags: ['Viz', 'Workbooks', 'Data Sources', 'Embed'],
    accent: '#E97627',
    checks: 140,
  },
  {
    id: 'snowflake',
    name: 'Snowflake',
    tagline: 'Multi-cloud data cloud — compute, storage, governance',
    route: '/snowflake/new',
    Logo: SnowflakeLogo,
    category: 'Analytics',
    tags: ['Cloud', 'Data Warehouse', 'Governance', 'Multi-Cloud'],
    accent: '#29B5E8',
    checks: 160,
  },
  {
    id: 'dataverse',
    name: 'Microsoft Dataverse',
    tagline: 'Power Platform — tables, relationships, security roles',
    route: '/dataverse/new',
    Logo: DataverseLogo,
    category: 'Platform',
    tags: ['Power Platform', 'Low Code', 'CDS', 'D365'],
    accent: '#742774',
    checks: 230,
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    tagline: 'CRM objects, flows, Apex classes, integration points',
    route: '/salesforce/new',
    Logo: SalesforceLogo,
    category: 'CRM',
    tags: ['CRM', 'Apex', 'Flows', 'SOQL', 'Platform'],
    accent: '#00A1E0',
    checks: 190,
  },
  {
    id: 'db2',
    name: 'IBM Db2',
    tagline: 'Enterprise RDBMS — schema, procedures, buffer pools',
    route: '/db2/new',
    Logo: IbmDb2Logo,
    category: 'Database',
    tags: ['IBM', 'Enterprise', 'z/OS', 'LUW'],
    accent: '#054ADA',
    checks: 150,
  },
  {
    id: 'infor',
    name: 'Infor CloudSuite',
    tagline: 'M3, LN, CSI — tables, BODs, integration schemas',
    route: '/infor/new',
    Logo: InforPNGLogo,
    category: 'Cloud ERP',
    tags: ['M3', 'LN', 'CSI', 'BOD', 'ION'],
    accent: '#0083BE',
    checks: 110,
  },
  {
    id: 'databricks',
    name: 'Databricks',
    tagline: 'Lakehouse platform — clusters, Unity Catalog, MLflow',
    route: '/databricks/new',
    Logo: DatabricksLogo,
    category: 'Analytics',
    tags: ['Lakehouse', 'Spark', 'Unity Catalog', 'ML', 'Delta'],
    accent: '#FF3621',
    checks: 200,
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    tagline: 'Open-source RDBMS — extensions, vacuums, replication',
    route: '/?engine=postgres',
    Logo: PostgreSQLIconLogo,
    category: 'Database',
    tags: ['Open Source', 'Extensions', 'AWS RDS', 'Azure', 'GCP'],
    accent: '#336791',
    checks: 130,
  },
  {
    id: 'mysql',
    name: 'MySQL',
    tagline: 'World\'s most popular open-source RDBMS — schema, indexes, replication',
    route: '/?engine=mysql',
    Logo: MySQLLogo,
    category: 'Database',
    tags: ['Open Source', 'InnoDB', 'AWS RDS', 'Azure', 'GCP'],
    accent: '#F29111',
    checks: 120,
  },
  {
    id: 'oracle',
    name: 'Oracle Database',
    tagline: 'Enterprise RDBMS — schemas, packages, tablespaces, partitioning',
    route: '/?engine=oracle',
    Logo: OracleLogo,
    category: 'Database',
    tags: ['Enterprise', 'PL/SQL', 'RAC', 'Exadata', 'OCI'],
    accent: '#FF0000',
    checks: 160,
  },
]

const CATEGORIES: Category[] = ['Database', 'Analytics', 'Cloud ERP', 'CRM', 'Platform']

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  Database:   <DatabaseIcon style={{ width: 13, height: 13 }} />,
  Analytics:  <BarChart3 style={{ width: 13, height: 13 }} />,
  'Cloud ERP':<Cloud style={{ width: 13, height: 13 }} />,
  CRM:        <Zap style={{ width: 13, height: 13 }} />,
  Platform:   <Server style={{ width: 13, height: 13 }} />,
}

// ── Card component ────────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  index,
  onClick,
}: {
  connector: Connector
  index: number
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 50 })
  const cardRef = useRef<HTMLButtonElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = cardRef.current
    if (!el) return
    const { left, top, width, height } = el.getBoundingClientRect()
    const x = (e.clientX - left) / width
    const y = (e.clientY - top) / height
    setTilt({
      x: (y - 0.5) * -10,
      y: (x - 0.5) * 10,
      gx: x * 100,
      gy: y * 100,
    })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHovered(false)
    setTilt({ x: 0, y: 0, gx: 50, gy: 50 })
  }, [])

  const scale = pressed ? 0.97 : hovered ? 1.02 : 1
  const elevation = pressed
    ? D.shadow1
    : hovered
    ? D.shadow3
    : D.shadow1

  return (
    <button
      ref={cardRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        position: 'relative',
        width: '100%',
        textAlign: 'left',
        background: D.surface,
        borderRadius: 20,
        border: `1.5px solid ${hovered ? D.teal : D.border}`,
        padding: '22px 22px 20px',
        boxShadow: elevation,
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${scale}) translateZ(${hovered ? '8px' : '0'})`,
        transition: hovered
          ? 'transform 80ms linear, box-shadow 200ms ease, border-color 200ms ease'
          : `transform 350ms ${D.spring}, box-shadow 300ms ease, border-color 200ms ease`,
        cursor: 'pointer',
        animationDelay: `${index * 60}ms`,
        animationFillMode: 'both',
        animationName: 'cardEnter',
        animationDuration: '500ms',
        animationTimingFunction: D.spring,
        overflow: 'hidden',
        willChange: 'transform',
      }}
    >
      {/* Specular glow overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 20,
          background: hovered
            ? `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.28) 0%, transparent 65%)`
            : 'none',
          pointerEvents: 'none',
          transition: 'background 80ms linear',
        }}
      />

      {/* Top accent stripe */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          borderRadius: '20px 20px 0 0',
          background: hovered
            ? `linear-gradient(90deg, ${connector.accent}, ${D.teal})`
            : 'transparent',
          transition: `background 250ms ${D.ease}`,
        }}
      />

      {/* Card body */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Logo slot */}
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: D.canvas,
          border: `1.5px solid ${hovered ? D.borderFaint : 'rgba(178,221,217,0.5)'}`,
          boxShadow: hovered ? `0 4px 16px ${D.tealGlow}` : D.shadow1,
          transition: `all 250ms ${D.ease}`,
          overflow: 'hidden',
        }}>
          <connector.Logo size={36} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 15, fontWeight: 800, color: D.ink,
              letterSpacing: '-0.02em', lineHeight: 1.2,
            }}>
              {connector.name}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 5,
              background: hovered ? D.tealFaint : 'rgba(178,221,217,0.3)',
              color: hovered ? D.tealDark : D.inkMute,
              transition: `all 200ms ${D.ease}`,
            }}>
              {connector.category}
            </span>
          </div>

          <p style={{
            fontSize: 12, color: D.inkMute, margin: '0 0 10px',
            lineHeight: 1.5, maxWidth: 260,
          }}>
            {connector.tagline}
          </p>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {connector.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{
                fontSize: 10, fontWeight: 600,
                padding: '2px 6px', borderRadius: 4,
                background: 'rgba(178,221,217,0.22)',
                color: D.inkMid,
                letterSpacing: '0.02em',
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 16, paddingTop: 12,
        borderTop: `1px solid ${hovered ? D.borderFaint : 'rgba(226,230,234,0.7)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'border-color 200ms',
      }}>
        <span style={{ fontSize: 11, color: D.inkFaint }}>
          <span style={{ fontWeight: 700, color: D.inkMid }}>{connector.checks}+</span> assessment checks
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 700,
          color: hovered ? D.tealDark : D.inkFaint,
          transition: `color 200ms ${D.ease}`,
        }}>
          Start Assessment
          <ArrowRight style={{
            width: 12, height: 12,
            transform: hovered ? 'translateX(3px)' : 'translateX(0)',
            transition: `transform 250ms ${D.spring}`,
          }} />
        </span>
      </div>
    </button>
  )
}

// ── Search bar ─────────────────────────────────────────────────────────────────

function SearchBar({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{
      position: 'relative',
      maxWidth: 520,
      width: '100%',
    }}>
      <Search style={{
        position: 'absolute', left: 16, top: '50%',
        transform: 'translateY(-50%)',
        width: 16, height: 16,
        color: focused ? D.tealDark : D.inkFaint,
        transition: `color 200ms ${D.ease}`,
        pointerEvents: 'none',
      }} />
      <input
        type="text"
        placeholder="Search connectors — SAP, Snowflake, Databricks…"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '12px 44px 12px 44px',
          borderRadius: 14,
          border: `1.5px solid ${focused ? D.teal : D.border}`,
          background: D.surface,
          fontSize: 14,
          color: D.ink,
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${D.tealGlow}, ${D.shadow1}` : D.shadow1,
          transition: `all 250ms ${D.ease}`,
          fontFamily: 'inherit',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute', right: 12, top: '50%',
            transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 4, borderRadius: 6,
            color: D.inkMute,
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  )
}

// ── Category pill filter ───────────────────────────────────────────────────────

function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string | Category
  active: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 14px', borderRadius: 10,
        border: `1.5px solid ${active ? D.teal : hovered ? D.teal : D.border}`,
        background: active ? `linear-gradient(135deg, ${D.tealDark}, ${D.teal})` : D.surface,
        color: active ? '#fff' : hovered ? D.tealDark : D.inkMid,
        fontSize: 12, fontWeight: 700,
        cursor: 'pointer',
        boxShadow: active ? `0 4px 16px ${D.tealGlow}` : hovered ? D.shadow1 : 'none',
        transform: active || hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: `all 200ms ${D.spring}`,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {label !== 'All' && CATEGORY_ICONS[label as Category]}
      {label}
    </button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ConnectorChooserPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | 'All'>('All')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return CONNECTORS.filter(c => {
      const matchCat = category === 'All' || c.category === category
      if (!q) return matchCat
      return matchCat && (
        c.name.toLowerCase().includes(q) ||
        c.tagline.toLowerCase().includes(q) ||
        c.tags.some(t => t.toLowerCase().includes(q)) ||
        c.category.toLowerCase().includes(q)
      )
    })
  }, [search, category])

  return (
    <div style={{
      minHeight: '100vh',
      background: D.canvas,
      fontFamily: "'Inter Variable','Inter',system-ui,sans-serif",
    }}>

      {/* ── Hero header ── */}
      <div style={{
        background: D.surface,
        borderBottom: `1px solid ${D.border}`,
        padding: '36px 48px 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #4DA8A0 0%, #93CCC6 100%)',
            boxShadow: '0 8px 24px rgba(108,189,181,0.38), inset 0 1px 0 rgba(255,255,255,0.20)',
            flexShrink: 0,
          }}>
            <DatabaseIcon style={{ width: 24, height: 24, color: '#fff' }} aria-hidden="true" />
          </div>
          <div>
            <h1 style={{
              fontSize: 26, fontWeight: 900, color: D.ink,
              margin: 0, letterSpacing: '-0.035em', lineHeight: 1.15,
            }}>
              Choose a Connector
            </h1>
            <p style={{ fontSize: 13, color: D.inkMute, margin: '4px 0 0', lineHeight: 1.5 }}>
              Select a source system to begin an assessment &mdash; {CONNECTORS.length} connectors available
            </p>
          </div>
        </div>

        {/* Search + filters row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <SearchBar value={search} onChange={setSearch} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <CategoryPill
              label="All"
              active={category === 'All'}
              onClick={() => setCategory('All')}
            />
            {CATEGORIES.map(cat => (
              <CategoryPill
                key={cat}
                label={cat}
                active={category === cat}
                onClick={() => setCategory(cat === category ? 'All' : cat)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Connector grid ── */}
      <div style={{ padding: '32px 48px 64px' }}>

        {/* Results count */}
        {(search || category !== 'All') && (
          <p style={{
            fontSize: 12, color: D.inkMute, marginBottom: 20,
            fontWeight: 600, letterSpacing: '0.02em',
          }}>
            {filtered.length === 0
              ? 'No connectors match your search'
              : `${filtered.length} connector${filtered.length !== 1 ? 's' : ''} found`}
          </p>
        )}

        {filtered.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: D.surface, border: `1.5px solid ${D.border}`,
              boxShadow: D.shadow1, marginBottom: 16,
            }}>
              <Search style={{ width: 28, height: 28, color: D.teal }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: D.ink, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              No connectors found
            </h3>
            <p style={{ fontSize: 13, color: D.inkMute, margin: '0 0 20px', maxWidth: 300, lineHeight: 1.6 }}>
              Try a different search term or clear the filters.
            </p>
            <button
              onClick={() => { setSearch(''); setCategory('All') }}
              style={{
                padding: '9px 20px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: `linear-gradient(135deg, ${D.tealDark}, ${D.teal})`,
                color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: `0 4px 16px ${D.tealGlow}`,
                transition: `all 200ms ${D.spring}`,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}>
            {filtered.map((connector, i) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                index={i}
                onClick={() => {
                  // Routes like '/?engine=mssql' need to be split into path + search
                  const [path, qs] = connector.route.split('?')
                  navigate({ pathname: path || '/', search: qs ? `?${qs}` : '' })
                }}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cardEnter {
          from {
            opacity: 0;
            transform: perspective(800px) translateY(20px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: perspective(800px) translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
