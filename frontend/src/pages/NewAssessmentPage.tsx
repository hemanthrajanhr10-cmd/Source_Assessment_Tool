import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Server, Database, User, Lock, Eye, EyeOff,
  Plus, Trash2, ChevronDown, ChevronUp, Wifi, WifiOff,
  CheckCircle2, AlertCircle, ArrowRight, Tag, Zap,
  RefreshCw, Radio, Search,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { DatabaseInfo, DbType, Gateway } from '../types/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

const DB_TYPE_OPTIONS: { value: DbType; label: string; defaultPort: number }[] = [
  { value: 'mssql',    label: 'SQL Server',  defaultPort: 1433 },
  { value: 'postgres', label: 'PostgreSQL',  defaultPort: 5432 },
  { value: 'mysql',    label: 'MySQL',       defaultPort: 3306 },
]

// ── Types ─────────────────────────────────────────────────────────────────────

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
  username: string
  password: string
  show_password: boolean
  trust_server_certificate: boolean
  encrypt: boolean
  use_gateway: boolean
  gateway_key: string
  // Detect state
  connectivity: null | { reachable: boolean; latency_ms: number | null }
  connectivity_loading: boolean
  // Database browse state
  available_dbs: DatabaseInfo[] | null
  dbs_loading: boolean
  dbs_error: string | null
  // Selections
  selected_dbs: SelectedDb[]
  // UI
  expanded: boolean
}

function makeServer(): ServerEntry {
  return {
    id: crypto.randomUUID(),
    db_type: 'mssql',
    server: '',
    port: 1433,
    username: '',
    password: '',
    show_password: false,
    trust_server_certificate: true,
    encrypt: true,
    use_gateway: false,
    gateway_key: '',
    connectivity: null,
    connectivity_loading: false,
    available_dbs: null,
    dbs_loading: false,
    dbs_error: null,
    selected_dbs: [],
    expanded: true,
  }
}

// ── Toggle ────────────────────────────────────────────────────────────────────

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
          transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
          ${checked ? 'bg-brand-600' : 'bg-slate-200'}`}
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

// ── Server Card ───────────────────────────────────────────────────────────────

function ServerCard({
  entry,
  index,
  onUpdate,
  onRemove,
  canRemove,
  gateways,
}: {
  entry: ServerEntry
  index: number
  onUpdate: (id: string, patch: Partial<ServerEntry>) => void
  onRemove: (id: string) => void
  canRemove: boolean
  gateways: Gateway[]
}) {
  const set = (patch: Partial<ServerEntry>) => onUpdate(entry.id, patch)

  const handleDetect = async () => {
    if (!entry.server) return
    set({ connectivity_loading: true, connectivity: null })
    try {
      const { data } = await api.detectConnectivity([{ server: entry.server, port: entry.port }])
      const result = data[0]
      set({ connectivity: { reachable: result.reachable, latency_ms: result.latency_ms }, connectivity_loading: false })
      // Auto-suggest gateway if not reachable
      if (!result.reachable && !entry.use_gateway) {
        set({ use_gateway: true })
      }
    } catch {
      set({ connectivity_loading: false })
    }
  }

  const handleBrowseDbs = async () => {
    if (!entry.server || !entry.username || !entry.password) return
    set({ dbs_loading: true, dbs_error: null, available_dbs: null })
    // Use a sensible default catalog per db type
    const defaultDb = entry.db_type === 'postgres' ? 'postgres'
      : entry.db_type === 'mysql' ? 'information_schema'
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
    <div className="card overflow-hidden border-2 border-slate-100">
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{serverLabel}</p>
          {entry.selected_dbs.length > 0 && (
            <p className="text-xs text-slate-400">
              {entry.selected_dbs.length} database{entry.selected_dbs.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* Connectivity badge */}
        {connStatus && (
          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            connStatus.reachable
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {connStatus.reachable
              ? <><Wifi className="h-3 w-3" /> Cloud ({connStatus.latency_ms}ms)</>
              : <><WifiOff className="h-3 w-3" /> On-Premises</>
            }
          </span>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(entry.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
          {/* Connection fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* DB Type */}
            <div className="sm:col-span-2">
              <label className="form-label">Database Engine</label>
              <div className="flex gap-2">
                {DB_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set({ db_type: opt.value, port: opt.defaultPort, available_dbs: null, selected_dbs: [] })}
                    className={`flex-1 rounded-xl border-2 px-3 py-2 text-center text-xs font-semibold transition-all ${
                      entry.db_type === opt.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Server */}
            <div className="sm:col-span-2">
              <label className="form-label">Host / Server <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    className="form-input pl-10"
                    placeholder="SERVERNAME or host\INSTANCE"
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
                <button
                  type="button"
                  onClick={handleDetect}
                  disabled={!entry.server || entry.connectivity_loading}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  title="Test TCP connectivity"
                >
                  {entry.connectivity_loading
                    ? <Spinner size="sm" />
                    : <Search className="h-3.5 w-3.5" />}
                  Detect
                </button>
              </div>
            </div>

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
              <label className="form-label">Password <span className="text-red-500">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type={entry.show_password ? 'text' : 'password'}
                  className="form-input pl-10 pr-10"
                  placeholder="••••••••"
                  value={entry.password}
                  onChange={(e) => set({ password: e.target.value })}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => set({ show_password: !entry.show_password })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
          </div>

          {/* Connection mode */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => set({ use_gateway: false, gateway_key: '' })}
                className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                  !entry.use_gateway ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Wifi className="h-3.5 w-3.5 text-emerald-500" /> Direct Connection
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Server reachable from internet</p>
              </button>
              <button
                type="button"
                onClick={() => set({ use_gateway: true })}
                className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                  entry.use_gateway ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-brand-500" /> Via Gateway Agent
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Behind corporate firewall</p>
              </button>
            </div>

            {/* Gateway picker — shown only when use_gateway is selected */}
            {entry.use_gateway && (
              <div>
                <label className="form-label">Select Gateway <span className="text-red-500">*</span></label>
                {gateways.length === 0 ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    No gateways registered. Go to <strong>Gateway Manager</strong> to register one.
                  </div>
                ) : (
                  <select
                    className="form-input"
                    value={entry.gateway_key}
                    onChange={(e) => set({ gateway_key: e.target.value })}
                  >
                    <option value="">— Choose a gateway —</option>
                    {gateways.map((gw) => (
                      <option key={gw.gateway_key} value={gw.gateway_key}>
                        {gw.name} {gw.status === 'online' ? '● Online' : '○ Offline'}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Database browser */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Databases to Assess</span>
              <button
                type="button"
                onClick={handleBrowseDbs}
                disabled={!entry.server || !entry.username || !entry.password || entry.dbs_loading}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                {entry.dbs_loading
                  ? <><Spinner size="sm" /> Loading…</>
                  : <><RefreshCw className="h-3.5 w-3.5" /> Browse Databases</>}
              </button>
            </div>

            {entry.dbs_error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{entry.dbs_error}</span>
              </div>
            )}

            {entry.available_dbs && entry.available_dbs.length === 0 && (
              <p className="text-xs text-slate-400 italic">No user databases found on this server.</p>
            )}

            {entry.available_dbs && entry.available_dbs.length > 0 && (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {entry.available_dbs.map((db) => {
                  const sel = entry.selected_dbs.find((d) => d.name === db.name)
                  return (
                    <div key={db.name} className={`transition-colors ${sel ? 'bg-brand-50' : 'bg-white hover:bg-slate-50'}`}>
                      <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!sel}
                          onChange={() => toggleDb(db)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm font-medium text-slate-800 flex-1">{db.name}</span>
                        {db.size_mb != null && (
                          <span className="text-xs text-slate-400">{db.size_mb.toFixed(0)} MB</span>
                        )}
                      </label>
                      {/* Per-database null analysis settings */}
                      {sel && (
                        <div className="px-4 pb-3 pt-0 flex flex-wrap items-center gap-4 border-t border-brand-100 bg-brand-50">
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

            {/* Manual DB entry when no browse results */}
            {!entry.available_dbs && (
              <div className="text-xs text-slate-400 italic">
                Click "Browse Databases" to list available databases, or{' '}
                <button
                  type="button"
                  className="underline text-brand-600 hover:text-brand-800"
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewAssessmentPage() {
  const navigate = useNavigate()
  const [label, setLabel] = useState('')
  const [servers, setServers] = useState<ServerEntry[]>([makeServer()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: gateways = [] } = useQuery({
    queryKey: ['gateways'],
    queryFn: () => api.listGateways().then((r) => r.data),
    refetchInterval: 15_000,
  })

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

    // Validate
    for (const srv of servers) {
      if (!srv.server.trim()) { setError('All servers must have a hostname.'); return }
      if (!srv.username.trim()) { setError(`Server "${srv.server}": username is required.`); return }
      if (!srv.password) { setError(`Server "${srv.server}": password is required.`); return }
      if (srv.selected_dbs.length === 0) {
        setError(`Server "${srv.server}": no databases selected. Click "Browse Databases" and select at least one.`)
        return
      }
      if (srv.use_gateway && !srv.gateway_key) {
        setError(`Server "${srv.server}": please select a gateway agent.`)
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
          use_gateway: srv.use_gateway,
          gateway_key: srv.use_gateway ? srv.gateway_key : undefined,
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
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New Assessment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add one or more SQL Server instances, select databases, and run a comprehensive schema analysis.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Session label */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
            <Zap className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-800">Session Details</h2>
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
              gateways={gateways}
            />
          ))}

          <button
            type="button"
            onClick={addServer}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Another Server
          </button>
        </div>

        {/* Summary + error */}
        {totalDbs > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              <strong>{totalDbs}</strong> database{totalDbs !== 1 ? 's' : ''} across{' '}
              <strong>{servers.length}</strong> server{servers.length !== 1 ? 's' : ''} will be assessed in parallel.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
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
