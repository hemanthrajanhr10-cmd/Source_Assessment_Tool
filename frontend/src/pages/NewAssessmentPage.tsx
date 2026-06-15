import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Server, Database, User, Lock, Eye, EyeOff,
  Plus, Trash2, ChevronDown, ChevronUp, Wifi, WifiOff,
  CheckCircle2, AlertCircle, ArrowRight, Tag, Zap,
  RefreshCw, Search, ShieldCheck, Info, Network, Share2,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { AccessLevel, DatabaseInfo, DbType, HybridConnection } from '../types/api'
import { ACCESS_LEVEL_OPTIONS } from '../types/api'
import Button from '../components/ui/Button'
import { SqlServerLogo, MySQLFullLogo, OracleFullLogo, PostgreSQLIconLogo } from '../components/ui/SourceLogos'
import Spinner from '../components/ui/Spinner'

const DB_TYPE_OPTIONS: { value: DbType; label: string; defaultPort: number }[] = [
  { value: 'mssql',    label: 'SQL Server',  defaultPort: 1433 },
  { value: 'postgres', label: 'PostgreSQL',  defaultPort: 5432 },
  { value: 'mysql',    label: 'MySQL',       defaultPort: 3306 },
  { value: 'oracle',   label: 'Oracle',      defaultPort: 1521 },
]

// ── PostgreSQL platform detection (mirrors backend connector.py logic) ─────────

type PgPlatform = {
  key: string
  label: string
  note: string
  badge: string  // tailwind colour tokens for the badge
}

const PG_PLATFORM_EXAMPLES: { platform: string; example: string }[] = [
  { platform: 'On-premises / Local',       example: '192.168.1.10  or  pgserver.corp.local' },
  { platform: 'Azure PostgreSQL',          example: 'myserver.postgres.database.azure.com' },
  { platform: 'AWS RDS / Aurora',          example: 'mydb.cluster-xxx.us-east-1.rds.amazonaws.com' },
  { platform: 'GCP Cloud SQL (public IP)', example: '34.x.x.x  (instance public IP)' },
  { platform: 'GCP Cloud SQL (name)',      example: 'project-id:us-central1:instance-name' },
  { platform: 'Supabase',                  example: 'db.abcxyz.supabase.co' },
  { platform: 'Neon',                      example: 'ep-xxx.us-east-2.aws.neon.tech' },
  { platform: 'CockroachDB Cloud',         example: 'cluster.xxx.cockroachlabs.cloud' },
  { platform: 'Aiven',                     example: 'pg-xxx.aivencloud.com' },
  { platform: 'Railway',                   example: 'containers-us-west-xxx.railway.app' },
  { platform: 'Render',                    example: 'dpg-xxx.oregon-postgres.render.com' },
]

function detectPgPlatform(server: string): PgPlatform {
  const s = server.trim().toLowerCase()

  // GCP Cloud SQL instance name — project:region:instance
  const parts = server.trim().split(':')
  if (parts.length === 3 && parts.every(p => p.trim())) {
    return {
      key: 'gcp_cloudsql_name',
      label: 'GCP Cloud SQL',
      note: 'Uses the Cloud SQL Connector. No SA key needed on GCE/Cloud Run/GKE — ADC is automatic.',
      badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    }
  }
  if (s.endsWith('.postgres.database.azure.com') || s.endsWith('.database.windows.net'))
    return { key: 'azure', label: 'Azure PostgreSQL', note: 'SSL required — handled automatically. Managed Identity option available below.', badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' }
  if (s.includes('.rds.amazonaws.com'))
    return { key: 'aws', label: 'AWS RDS / Aurora', note: 'SSL required — handled automatically.', badge: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' }
  if (s.endsWith('.alloydb.goog') || s.endsWith('.alloydb-dev.goog'))
    return { key: 'alloydb', label: 'GCP AlloyDB', note: 'SSL required — handled automatically.', badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' }
  if (s.endsWith('.supabase.co') || s.endsWith('.supabase.com') || s.includes('.pooler.supabase'))
    return { key: 'supabase', label: 'Supabase', note: 'SSL required — handled automatically.', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' }
  if (s.endsWith('.neon.tech'))
    return { key: 'neon', label: 'Neon', note: 'SSL required — handled automatically.', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' }
  if (s.endsWith('.cockroachlabs.cloud'))
    return { key: 'cockroach', label: 'CockroachDB Cloud', note: 'SSL required — handled automatically.', badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' }
  if (s.endsWith('.aivencloud.com'))
    return { key: 'aiven', label: 'Aiven', note: 'SSL required — handled automatically.', badge: 'bg-red-50 text-red-700 ring-1 ring-red-200' }
  if (s.endsWith('.railway.app'))
    return { key: 'railway', label: 'Railway', note: 'SSL required — handled automatically.', badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' }
  if (s.endsWith('.render.com'))
    return { key: 'render', label: 'Render', note: 'SSL required — handled automatically.', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' }
  if (s.endsWith('.tsdb.io'))
    return { key: 'timescale', label: 'TimescaleDB Cloud', note: 'SSL required — handled automatically.', badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' }
  if (s.endsWith('.db.elephantsql.com'))
    return { key: 'elephant', label: 'ElephantSQL', note: 'SSL required — handled automatically.', badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' }
  if (/\.compute(-\d+)?\.amazonaws\.com$/.test(s))
    return { key: 'heroku', label: 'Heroku (RDS)', note: 'SSL required — handled automatically.', badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' }
  if (s === 'localhost' || s.startsWith('127.') || s.startsWith('::1') || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(s))
    return { key: 'local', label: 'Local / On-premises', note: 'Direct TCP connection — SSL optional.', badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' }

  return { key: 'onprem', label: 'On-premises / Direct', note: 'Direct TCP connection — SSL negotiated automatically.', badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' }
}

function PgPlatformHint({ server }: { server: string }) {
  const [showExamples, setShowExamples] = useState(false)

  if (!server.trim()) {
    return (
      <div className="sm:col-span-2">
        <button
          type="button"
          onClick={() => setShowExamples(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
          {showExamples ? 'Hide' : 'Show'} accepted server formats
        </button>
        {showExamples && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden text-xs">
            {PG_PLATFORM_EXAMPLES.map(({ platform, example }) => (
              <div key={platform} className="flex items-baseline gap-2 px-3 py-1.5">
                <span className="w-44 shrink-0 text-slate-500 font-medium">{platform}</span>
                <span className="text-slate-400 font-mono">{example}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const platform = detectPgPlatform(server)
  return (
    <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${platform.badge}`}>
        <Zap className="h-3 w-3" />
        {platform.label}
      </span>
      <span className="text-xs text-slate-400">{platform.note}</span>
    </div>
  )
}

interface SelectedDb {
  name: string
  include_null_analysis: boolean
  null_analysis_sample_limit: number
}

interface ServerEntry {
  id: string
  db_type: DbType
  server: string
  port: number
  service_name: string
  username: string
  password: string
  show_password: boolean
  trust_server_certificate: boolean
  encrypt: boolean
  access_level: AccessLevel
  gateway_key: string | null   // set when a Hybrid Connection is selected
  gcp_sa_key: string           // GCP service account key JSON for Cloud SQL auth
  show_gcp_sa_key: boolean
  gcp_private_ip: boolean
  azure_managed_identity: boolean
  connectivity: null | { reachable: boolean; latency_ms: number | null }
  connectivity_loading: boolean
  available_dbs: DatabaseInfo[] | null
  dbs_loading: boolean
  dbs_error: string | null
  selected_dbs: SelectedDb[]
  expanded: boolean
}

// ── Hybrid Connection Picker ───────────────────────────────────────────────────

function HybridConnectionPicker({
  onSelect,
}: {
  onSelect: (host: string, port: number) => void
}) {
  const [open, setOpen]               = useState(false)
  const [connections, setConnections] = useState<HybridConnection[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = async () => {
    setOpen(true)
    if (connections.length > 0) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.listHybridConnections()
      setConnections(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handlePick = (hc: HybridConnection) => {
    // Azure App Service HCM transparently tunnels TCP to endpoint_host:endpoint_port.
    // No gateway_key needed — psycopg2 / mssql-python connects directly and HCM routes it.
    onSelect(hc.endpoint_host, hc.endpoint_port)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-earth-50 hover:border-earth-200 hover:text-earth-800 disabled:opacity-40 transition-colors"
        title="Pick from your saved Hybrid Connections"
      >
        <Share2 className="h-3.5 w-3.5" />
        Hybrid
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden animate-slide-down">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
            <Share2 className="h-3.5 w-3.5 text-earth-600" />
            <span className="text-xs font-semibold text-slate-700">Your Hybrid Connections</span>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          )}

          {error && (
            <div className="px-3 py-3 text-xs text-red-600">{error}</div>
          )}

          {!loading && !error && connections.length === 0 && (
            <div className="px-3 py-4 text-xs text-slate-400 text-center">
              No saved connections.{' '}
              <a href="/hybrid-connection" className="text-earth-700 underline underline-offset-2">
                Create one
              </a>{' '}
              first.
            </div>
          )}

          {!loading && connections.map((hc) => (
            <button
              key={hc.connection_id}
              type="button"
              onClick={() => handlePick(hc)}
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-earth-50 transition-colors border-b border-slate-50 last:border-0"
            >
              <div className="h-7 w-7 rounded-lg bg-earth-50 border border-earth-100 flex items-center justify-center shrink-0 mt-0.5">
                <Share2 className="h-3.5 w-3.5 text-earth-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{hc.name}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {hc.endpoint_host}:{hc.endpoint_port}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function makeServer(): ServerEntry {
  return {
    id: crypto.randomUUID(),
    db_type: 'mssql',
    server: '',
    port: 1433,
    service_name: '',
    username: '',
    password: '',
    show_password: false,
    trust_server_certificate: true,
    encrypt: true,
    access_level: 'db_datareader',
    gateway_key: null,
    gcp_sa_key: '',
    show_gcp_sa_key: false,
    gcp_private_ip: false,
    azure_managed_identity: false,
    connectivity: null,
    connectivity_loading: false,
    available_dbs: null,
    dbs_loading: false,
    dbs_error: null,
    selected_dbs: [],
    expanded: true,
  }
}

function Toggle({
  checked, onChange, label, description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent
          transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-earth-600/40
          ${checked ? 'bg-earth-600' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform
          ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      <div>
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

function ServerCard({
  entry, index, onUpdate, onRemove, canRemove,
}: {
  entry: ServerEntry
  index: number
  onUpdate: (id: string, patch: Partial<ServerEntry>) => void
  onRemove: (id: string) => void
  canRemove: boolean
}) {
  const set = (patch: Partial<ServerEntry>) => onUpdate(entry.id, patch)

  const handleDetect = async () => {
    if (!entry.server) return
    set({ connectivity_loading: true, connectivity: null })
    try {
      const { data } = await api.detectConnectivity([{ server: entry.server, port: entry.port }])
      const result = data[0]
      set({ connectivity: { reachable: result.reachable, latency_ms: result.latency_ms }, connectivity_loading: false })
    } catch {
      set({ connectivity_loading: false })
    }
  }

  const handleBrowseDbs = async () => {
    if (!entry.server || !entry.username || !entry.password) return
    set({ dbs_loading: true, dbs_error: null, available_dbs: null })
    const defaultDb = entry.db_type === 'postgres' ? 'postgres'
      : entry.db_type === 'mysql' ? 'information_schema'
      : entry.db_type === 'oracle' ? (entry.service_name.trim() || 'ORCL')
      : 'master'
    try {
      const { data } = await api.listDatabases({
        db_type: entry.db_type,
        server: entry.server,
        port: entry.port,
        database: defaultDb,
        username: entry.username,
        password: entry.password,
        trust_server_certificate: entry.trust_server_certificate,
        encrypt: entry.encrypt,
        gcp_sa_key: entry.gcp_sa_key || undefined,
        gcp_private_ip: entry.gcp_private_ip || undefined,
        azure_managed_identity: entry.azure_managed_identity || undefined,
      })
      set({ available_dbs: data, dbs_loading: false })
    } catch (err) {
      set({ dbs_loading: false, dbs_error: getApiErrorMessage(err) })
    }
  }

  const toggleDb = (db: DatabaseInfo) => {
    const exists = entry.selected_dbs.find((d) => d.name === db.name)
    if (exists) {
      set({ selected_dbs: entry.selected_dbs.filter((d) => d.name !== db.name) })
    } else {
      set({
        selected_dbs: [...entry.selected_dbs, {
          name: db.name,
          include_null_analysis: true,
          null_analysis_sample_limit: 30,
        }],
      })
    }
  }

  const updateSelectedDb = (name: string, patch: Partial<SelectedDb>) => {
    set({
      selected_dbs: entry.selected_dbs.map((d) =>
        d.name === name ? { ...d, ...patch } : d
      ),
    })
  }

  const connStatus = entry.connectivity
  const serverLabel = entry.server || `Server ${index + 1}`

  return (
    <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: `${index * 60}ms` }}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5 shrink-0">
          <DbEngineChip dbType={entry.db_type} />
          <span className="text-xs font-bold text-earth-700 tabular-nums">{index + 1}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{serverLabel}</p>
          {entry.selected_dbs.length > 0 && (
            <p className="text-xs text-slate-400">
              {entry.selected_dbs.length} database{entry.selected_dbs.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {connStatus && (
          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium animate-scale-in ${
            connStatus.reachable
              ? 'bg-earth-50 text-earth-700 ring-1 ring-earth-200'
              : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
          }`}>
            {connStatus.reachable
              ? <><Wifi className="h-3 w-3" /> Reachable ({connStatus.latency_ms}ms)</>
              : <><WifiOff className="h-3 w-3" /> Not directly reachable</>
            }
          </span>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(entry.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Remove server"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => set({ expanded: !entry.expanded })}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {entry.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Card body */}
      {entry.expanded && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* DB Type */}
            <div className="sm:col-span-2">
              <label className="form-label">Database Engine</label>
              <div className="flex gap-2">
                {DB_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set({ db_type: opt.value, port: opt.defaultPort, service_name: '', available_dbs: null, selected_dbs: [] })}
                    className={`flex-1 rounded-xl border-2 px-3 py-2 text-center text-xs font-semibold transition-all ${
                      entry.db_type === opt.value
                        ? 'border-earth-600 bg-earth-50 text-earth-800'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Oracle service name */}
            {entry.db_type === 'oracle' && (
              <div className="sm:col-span-2">
                <label className="form-label">
                  Service Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    className="form-input pl-10"
                    placeholder="e.g. ORCL, XEPDB1, mydb.sub.oraclevcn.com"
                    value={entry.service_name}
                    onChange={(e) => set({ service_name: e.target.value, available_dbs: null, selected_dbs: [] })}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            )}

            {/* Server */}
            <div className="sm:col-span-2">
              <label className="form-label">Host / Server <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    className="form-input pl-10"
                    placeholder={
                      entry.db_type === 'postgres' ? 'hostname, IP, or project:region:instance'
                      : entry.db_type === 'mysql'  ? 'hostname or IP'
                      : entry.db_type === 'oracle' ? 'hostname or IP'
                      : 'SERVERNAME or host\\INSTANCE'
                    }
                    value={entry.server}
                    onChange={(e) => set({ server: e.target.value, connectivity: null })}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <input
                  type="number"
                  className="form-input w-24"
                  min={1} max={65535}
                  value={entry.port}
                  onChange={(e) => set({ port: parseInt(e.target.value, 10) || 1433, connectivity: null })}
                  title="Port"
                />
                <HybridConnectionPicker
                  onSelect={(host, port) =>
                    set({ server: host, port, gateway_key: null, connectivity: null })
                  }
                />
                {/* Hide TCP Detect for Cloud SQL instance names — the Connector manages the tunnel, not direct TCP */}
                {!(entry.db_type === 'postgres' && detectPgPlatform(entry.server).key === 'gcp_cloudsql_name') && (
                  <button
                    type="button"
                    onClick={handleDetect}
                    disabled={!entry.server || entry.connectivity_loading}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-colors"
                    title="Test TCP connectivity"
                  >
                    {entry.connectivity_loading
                      ? <Spinner size="sm" className="text-earth-600" />
                      : <Search className="h-3.5 w-3.5" />}
                    Detect
                  </button>
                )}
              </div>
            </div>

            {/* PostgreSQL platform hint */}
            {entry.db_type === 'postgres' && (
              <PgPlatformHint server={entry.server} />
            )}

            {/* Azure PostgreSQL — Managed Identity toggle */}
            {entry.db_type === 'postgres' && detectPgPlatform(entry.server).key === 'azure' && (
              <div className="sm:col-span-2 space-y-2">
                <Toggle
                  checked={entry.azure_managed_identity}
                  onChange={(v) => set({ azure_managed_identity: v })}
                  label="Use Azure Managed Identity"
                  description="Authenticate via Microsoft Entra ID (no password needed). The SAT host must have a Managed Identity, or run az login on dev machines."
                />
                {entry.azure_managed_identity && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-700 space-y-1">
                    <p className="font-semibold text-sky-800">Required on the Azure PostgreSQL side:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-sky-600">
                      <li>Enable <strong>Microsoft Entra authentication</strong> on the Flexible Server (Portal → Authentication)</li>
                      <li>Create the Entra principal in PG: <code className="font-mono">SELECT pgaadauth_create_principal('user@tenant.com', false, false);</code></li>
                      <li>Grant read access: <code className="font-mono">GRANT pg_read_all_data TO "user@tenant.com";</code></li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* GCP Cloud SQL — Auth options + Private IP */}
            {entry.db_type === 'postgres' && detectPgPlatform(entry.server).key === 'gcp_cloudsql_name' && (
              <div className="sm:col-span-2 space-y-3">
                {/* ADC info banner */}
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                  <p className="font-semibold text-blue-800 mb-1">Authentication — no key file needed in most cases</p>
                  <ul className="space-y-0.5 text-blue-600 list-disc list-inside">
                    <li><strong>GCE / Cloud Run / GKE:</strong> attached service account is used automatically</li>
                    <li><strong>Dev machine:</strong> run <code className="font-mono">gcloud auth application-default login</code></li>
                    <li><strong>Fallback:</strong> paste an SA key JSON below</li>
                  </ul>
                </div>

                {/* SA Key (collapsible, optional fallback) */}
                <div>
                  <button
                    type="button"
                    onClick={() => set({ show_gcp_sa_key: !entry.show_gcp_sa_key })}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Service Account Key JSON
                    <span className="text-slate-400 font-normal ml-0.5">(optional fallback)</span>
                    <svg
                      className={`h-3.5 w-3.5 ml-0.5 transition-transform ${entry.show_gcp_sa_key ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20" fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {entry.show_gcp_sa_key && (
                    <div className="mt-2">
                      <textarea
                        className="form-input font-mono text-xs resize-none leading-relaxed"
                        rows={4}
                        placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                        value={entry.gcp_sa_key}
                        onChange={(e) => set({ gcp_sa_key: e.target.value, available_dbs: null })}
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        Paste the full JSON of your SA key file. The SA needs the{' '}
                        <strong className="text-slate-500">Cloud SQL Client</strong> IAM role.
                      </p>
                    </div>
                  )}
                </div>

                {/* Private IP toggle */}
                <Toggle
                  checked={entry.gcp_private_ip}
                  onChange={(v) => set({ gcp_private_ip: v })}
                  label="Use Private IP (VPC)"
                  description="Connect via private IP — SAT must be in the same VPC or a VPC-peered network."
                />
              </div>
            )}

            {/* Username */}
            <div>
              <label className="form-label">Username <span className="text-red-500">*</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  className="form-input pl-10"
                  placeholder="sa"
                  value={entry.username}
                  onChange={(e) => set({ username: e.target.value })}
                  autoComplete="username"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="form-label">
                Password{' '}
                {entry.db_type === 'postgres' && entry.azure_managed_identity
                  ? <span className="text-sky-500 font-normal text-xs">(not needed — Managed Identity)</span>
                  : <span className="text-red-500">*</span>
                }
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type={entry.show_password ? 'text' : 'password'}
                  className={`form-input pl-10 pr-10 ${entry.db_type === 'postgres' && entry.azure_managed_identity ? 'opacity-40' : ''}`}
                  placeholder={entry.db_type === 'postgres' && entry.azure_managed_identity ? 'Leave blank' : '••••••••'}
                  value={entry.password}
                  onChange={(e) => set({ password: e.target.value })}
                  autoComplete="current-password"
                  disabled={entry.db_type === 'postgres' && entry.azure_managed_identity}
                />
                <button
                  type="button"
                  onClick={() => set({ show_password: !entry.show_password })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {entry.show_password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* TLS toggles — SQL Server only */}
            {entry.db_type === 'mssql' && (
              <div className="sm:col-span-2 flex flex-wrap gap-5">
                <Toggle
                  checked={entry.encrypt}
                  onChange={(v) => set({ encrypt: v })}
                  label="Encrypt Connection"
                  description="Enforce TLS"
                />
                <Toggle
                  checked={entry.trust_server_certificate}
                  onChange={(v) => set({ trust_server_certificate: v })}
                  label="Trust Server Certificate"
                  description="Accept self-signed"
                />
              </div>
            )}

            {/* Access Level — SQL Server only */}
            {entry.db_type === 'mssql' && (
              <div className="sm:col-span-2">
                <label className="form-label flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-earth-600" />
                  Database Access Level <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {ACCESS_LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set({ access_level: opt.value })}
                      className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                        entry.access_level === opt.value
                          ? 'border-earth-600 bg-earth-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <p className={`text-xs font-semibold ${
                        entry.access_level === opt.value ? 'text-earth-800' : 'text-slate-700'
                      }`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-tight">{opt.description}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Select the role granted to <strong className="text-slate-600">{entry.username || 'this login'}</strong> on the target database.
                  Assessments requiring a higher role will be skipped and shown as locked.
                </p>
              </div>
            )}
          </div>

          {/* Connectivity callout — platform-aware */}
          {connStatus && !connStatus.reachable && (() => {
            const isGcpName = entry.db_type === 'postgres' && detectPgPlatform(entry.server).key === 'gcp_cloudsql_name'
            if (isGcpName) return null  // Cloud SQL Connector handles its own tunnel — TCP unreachable is normal
            const dbLabel = DB_TYPE_OPTIONS.find(o => o.value === entry.db_type)?.label ?? 'database server'
            const isPostgres = entry.db_type === 'postgres'
            return (
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 animate-slide-down">
                <Network className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-700 space-y-1">
                  <p className="font-semibold text-blue-800">Server not directly reachable from Azure</p>
                  <p>
                    If this is an on-premises {dbLabel}, install the{' '}
                    <strong>Azure Hybrid Connection Manager (HCM)</strong> on a machine
                    connected to the same network as the server.
                    HCM creates a transparent TCP tunnel — SAT connects to{' '}
                    <code className="font-mono">{entry.server}:{entry.port}</code> directly,
                    no gateway agent needed.
                  </p>
                  {isPostgres && (
                    <p className="text-blue-600">
                      For on-premises PostgreSQL: HCM works with all PostgreSQL versions.
                      SSL is negotiated automatically (<code className="font-mono">sslmode=prefer</code>).
                    </p>
                  )}
                  <a
                    href="/hybrid-connection"
                    className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-blue-900 transition-colors"
                  >
                    <Info className="h-3 w-3" />
                    Hybrid Connection setup guide
                  </a>
                </div>
              </div>
            )
          })()}

          {/* Database browser */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Databases to Assess</span>
              <button
                type="button"
                onClick={handleBrowseDbs}
                disabled={!entry.server || !entry.username || !entry.password || entry.dbs_loading}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-colors"
              >
                {entry.dbs_loading
                  ? <><Spinner size="sm" className="text-earth-600" /> Loading…</>
                  : <><RefreshCw className="h-3.5 w-3.5" /> Browse Databases</>}
              </button>
            </div>

            {entry.dbs_error && (() => {
              const isGcpCredErr = (
                entry.db_type === 'postgres' &&
                detectPgPlatform(entry.server).key === 'gcp_cloudsql_name' &&
                (entry.dbs_error.includes('Application Default Credentials') ||
                 entry.dbs_error.includes('credentials') ||
                 entry.dbs_error.includes('credential'))
              )
              if (isGcpCredErr) {
                return (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2 animate-slide-down">
                    <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      GCP authentication failed — choose one of the options below
                    </p>
                    <div className="space-y-2">
                      <div className="rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-800">Option A — Application Default Credentials (recommended)</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          On <strong>GCE / Cloud Run / GKE</strong>: the attached service account is used automatically — nothing to do.{' '}
                          On a <strong>dev machine</strong>: run <code className="font-mono">gcloud auth application-default login</code> once.
                          The SA / user needs the <strong>Cloud SQL Client</strong> IAM role.
                        </p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-800">Option B — Paste a Service Account Key JSON (above)</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          GCP Console → IAM → Service Accounts: create an SA with the{' '}
                          <strong>Cloud SQL Client</strong> role, download its JSON key, and paste it into the{' '}
                          <strong>Service Account Key JSON</strong> field above.
                        </p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-800">Option C — Use the public IP (bypass the Connector)</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          GCP Console → Cloud SQL → your instance → <strong>Connections → Networking</strong>: enable <strong>Public IP</strong>,
                          add this server's outbound IP to <strong>Authorized Networks</strong>, then paste the public IP into the Server field.
                        </p>
                      </div>
                    </div>
                  </div>
                )
              }
              return (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{entry.dbs_error}</span>
                </div>
              )
            })()}

            {entry.available_dbs && entry.available_dbs.length === 0 && (
              <p className="text-xs text-slate-400 italic">No user databases found on this server.</p>
            )}

            {entry.available_dbs && entry.available_dbs.length > 0 && (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {entry.available_dbs.map((db) => {
                  const sel = entry.selected_dbs.find((d) => d.name === db.name)
                  return (
                    <div key={db.name} className={`transition-colors ${sel ? 'bg-earth-50/60' : 'hover:bg-slate-50'}`}>
                      <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!sel}
                          onChange={() => toggleDb(db)}
                          className="h-4 w-4 rounded border-slate-300 text-earth-700 focus:ring-earth-600/40 bg-white"
                        />
                        <span className="text-sm font-medium text-slate-800 flex-1">{db.name}</span>
                        {db.size_mb != null && (
                          <span className="text-xs text-slate-400">{db.size_mb.toFixed(0)} MB</span>
                        )}
                      </label>
                      {sel && (
                        <div className="px-4 pb-3 pt-0 flex flex-wrap items-center gap-4 border-t border-earth-100 bg-earth-50/40">
                          <Toggle
                            checked={sel.include_null_analysis}
                            onChange={(v) => updateSelectedDb(db.name, { include_null_analysis: v })}
                            label="Null Analysis"
                          />
                          {sel.include_null_analysis && (
                            <div className="flex items-center gap-2 ml-auto">
                              <label className="text-xs text-slate-500">Sample limit</label>
                              <input
                                type="number"
                                min={1} max={1000}
                                className="form-input w-20 py-1 text-xs"
                                value={sel.null_analysis_sample_limit}
                                onChange={(e) =>
                                  updateSelectedDb(db.name, {
                                    null_analysis_sample_limit: Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 30)),
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {!entry.available_dbs && (
              <div className="text-xs text-slate-400 italic">
                Click "Browse Databases" to list available databases, or{' '}
                <button
                  type="button"
                  className="underline text-earth-700 hover:text-earth-800"
                  onClick={() => {
                    const name = prompt('Enter database name:')
                    if (name?.trim()) {
                      set({
                        available_dbs: [{ name: name.trim(), size_mb: null, state: 'ONLINE' }],
                        selected_dbs: [...entry.selected_dbs, {
                          name: name.trim(),
                          include_null_analysis: true,
                          null_analysis_sample_limit: 30,
                        }],
                      })
                    }
                  }}
                >
                  enter manually
                </button>
                .
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DbEngineChip({ dbType }: { dbType: DbType }) {
  if (dbType === 'mysql') return (
    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
      style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', boxShadow: '0 1px 4px rgba(22,163,74,0.10)' }}>
      <MySQLFullLogo height={18} />
    </div>
  )
  if (dbType === 'oracle') return (
    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
      style={{ background: '#FFF7F7', border: '1px solid #FECACA', boxShadow: '0 1px 4px rgba(204,41,54,0.10)' }}>
      <OracleFullLogo height={14} />
    </div>
  )
  if (dbType === 'postgres') return (
    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
      style={{ background: '#F8FAFF', border: '1px solid #C5D5EC', boxShadow: '0 1px 4px rgba(70,130,180,0.12)' }}>
      <PostgreSQLIconLogo size={18} />
    </div>
  )
  return (
    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
      style={{ background: '#F8FAFF', border: '1px solid #C5D5EC', boxShadow: '0 1px 4px rgba(204,41,54,0.10)' }}>
      <SqlServerLogo size={18} />
    </div>
  )
}

export default function NewAssessmentPage() {
  const navigate = useNavigate()
  const [label, setLabel] = useState('')
  const [servers, setServers] = useState<ServerEntry[]>([makeServer()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateServer = useCallback((id: string, patch: Partial<ServerEntry>) => {
    setServers((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s))
  }, [])

  const removeServer = useCallback((id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const addServer = () => setServers((prev) => [...prev, makeServer()])

  const totalDbs = servers.reduce((n, s) => n + s.selected_dbs.length, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    for (const srv of servers) {
      if (!srv.server.trim()) { setError('All servers must have a hostname.'); return }
      if (srv.db_type === 'oracle' && !srv.service_name.trim()) {
        setError(`Server "${srv.server}": Oracle service name is required.`)
        return
      }
      if (!srv.username.trim()) { setError(`Server "${srv.server}": username is required.`); return }
      const msiActive = srv.db_type === 'postgres' && srv.azure_managed_identity
      if (!srv.password && !msiActive) { setError(`Server "${srv.server}": password is required.`); return }
      if (srv.selected_dbs.length === 0) {
        setError(`Server "${srv.server}": no databases selected. Click "Browse Databases" and select at least one.`)
        return
      }
    }

    if (totalDbs === 0) {
      setError('Select at least one database across all servers.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data } = await api.createSession({
        label: label.trim() || undefined,
        servers: servers.map((srv) => ({
          db_type: srv.db_type,
          server: srv.server.trim(),
          port: srv.port,
          username: srv.username.trim(),
          password: srv.password,
          trust_server_certificate: srv.trust_server_certificate,
          encrypt: srv.encrypt,
          use_gateway: !!srv.gateway_key,
          gateway_key: srv.gateway_key ?? undefined,
          access_level: srv.db_type === 'mssql' ? srv.access_level : undefined,
          gcp_sa_key: srv.gcp_sa_key || undefined,
          gcp_private_ip: srv.gcp_private_ip || undefined,
          azure_managed_identity: srv.azure_managed_identity || undefined,
          databases: srv.selected_dbs.map((db) => ({
            name: db.name,
            include_null_analysis: db.include_null_analysis,
            null_analysis_sample_limit: db.null_analysis_sample_limit,
          })),
        })),
      })
      navigate(`/sessions/${data.session_id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: '#F8FAFF', border: '1px solid #C5D5EC', boxShadow: '0 2px 8px rgba(204,41,54,0.10)' }}>
            <SqlServerLogo size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-display">DB Assessment</h1>
            <p className="mt-1 text-sm text-slate-500">
              Add one or more database servers, select databases, and run a comprehensive schema analysis.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Session label */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
            <Zap className="h-4 w-4 text-earth-600" />
            <h2 className="text-sm font-semibold text-slate-700">Session Details</h2>
          </div>
          <div className="p-6">
            <label htmlFor="session-label" className="form-label">Session Label</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                id="session-label"
                type="text"
                className="form-input pl-10"
                placeholder="e.g. Client A — Full Assessment Q2 2026"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={200}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">Optional. Identifies this session in the Sessions list.</p>
          </div>
        </div>

        {/* Server cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              SQL Server Instances
              <span className="ml-2 text-xs font-normal text-slate-400">({servers.length})</span>
            </h2>
          </div>

          {servers.map((entry, i) => (
            <ServerCard
              key={entry.id}
              entry={entry}
              index={i}
              onUpdate={updateServer}
              onRemove={removeServer}
              canRemove={servers.length > 1}
            />
          ))}

          <button
            type="button"
            onClick={addServer}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm font-medium text-slate-400 hover:border-earth-300 hover:text-earth-700 hover:bg-earth-50/40 transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Another Server
          </button>
        </div>

        {/* Summary + error */}
        {totalDbs > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl border border-earth-200 bg-earth-50 px-4 py-3 text-sm text-earth-700">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-earth-600" />
            <span>
              <strong>{totalDbs}</strong> database{totalDbs !== 1 ? 's' : ''} across{' '}
              <strong>{servers.length}</strong> server{servers.length !== 1 ? 's' : ''} will be assessed in parallel.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          disabled={totalDbs === 0}
          rightIcon={<ArrowRight className="h-4 w-4" />}
          className="w-full justify-center"
        >
          {isSubmitting
            ? `Starting ${totalDbs} assessment${totalDbs !== 1 ? 's' : ''}…`
            : totalDbs === 0
              ? 'Select databases to start'
              : `Run ${totalDbs} Assessment${totalDbs !== 1 ? 's' : ''}`}
        </Button>
      </form>
    </div>
  )
}
