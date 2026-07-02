/**
 * HybridConnectionPage
 *
 * Top section: Create a new Hybrid Connection (form → API → stored per-user).
 * Middle section: Your Connections — user-specific list with status + delete.
 * Bottom section: Setup guide, topology diagram, connectivity test.
 */

import { useEffect, useState } from 'react'
import {
  Globe, Share2, Laptop, Database, Network,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  ExternalLink, Search, Wifi, WifiOff, Info,
  Plus, Trash2, RefreshCw, Server, Copy, Check, KeyRound, Download,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { HybridConnection } from '../types/api'
import Button from '../components/ui/Button'
import Loader3D from '../components/ui/Loader3D'

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select the text in a temporary textarea
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all
        ${copied
          ? 'border-earth-300 bg-earth-50 text-earth-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'}
        ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Listener connection string display box ────────────────────────────────────

function ConnectionStringBox({
  value,
  label,
  hint,
}: {
  value: string
  label: string
  hint: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-earth-200 bg-earth-50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-earth-800">
          <KeyRound className="h-3.5 w-3.5" />
          {label}
        </div>
        <CopyButton text={value} />
      </div>
      <p className="break-all font-mono text-[11px] text-earth-900 leading-relaxed bg-white border border-earth-100 rounded-lg px-3 py-2 select-all">
        {value}
      </p>
      <p className="text-[10px] text-earth-700">{hint}</p>
    </div>
  )
}

// ── Connection topology ───────────────────────────────────────────────────────

function TopologyNode({
  icon: Icon,
  label,
  sublabel,
  highlight,
}: {
  icon: React.ElementType
  label: string
  sublabel?: string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div
        className={`
          relative flex items-center justify-center w-14 h-14 rounded-xl
          transition-all duration-200
          ${highlight
            ? 'bg-amber-50 border-2 border-amber-300 shadow-md shadow-amber-100/60'
            : 'bg-white border border-slate-200 shadow-sm'}
        `}
      >
        <Icon className={`w-6 h-6 ${highlight ? 'text-amber-500' : 'text-slate-500'}`} />
        {highlight && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
          </span>
        )}
      </div>
      <div className="text-center">
        <p className={`text-xs font-semibold leading-tight ${highlight ? 'text-amber-700' : 'text-slate-700'}`}>
          {label}
        </p>
        {sublabel && (
          <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{sublabel}</p>
        )}
      </div>
    </div>
  )
}

function ConnectionDiagram() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 overflow-x-auto">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-5">Connection path</p>
      <div className="flex items-center justify-between min-w-[480px]">
        <TopologyNode icon={Globe}    label="Azure App"    sublabel="App Service" />
        <div className="signal-line flex-1 mx-3" style={{ minWidth: '48px' }} />
        <TopologyNode icon={Share2}   label="Azure Relay"  sublabel="Service Bus" />
        <div className="signal-line flex-1 mx-3" style={{ minWidth: '48px' }} />
        <TopologyNode icon={Laptop}   label="HCM"          sublabel="Your laptop" highlight />
        <div className="signal-line flex-1 mx-3" style={{ minWidth: '48px' }} />
        <TopologyNode icon={Database} label="SQL Server"   sublabel="On-premises" />
      </div>
      <p className="text-[11px] text-slate-400 mt-5 text-center">
        Outbound-only relay — no inbound firewall rules required on either end.
      </p>
    </div>
  )
}

// ── HCM Installer download ────────────────────────────────────────────────────

function HcmDownloadCard() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
        <Download className="h-4 w-4 text-earth-600" />
        <h2 className="text-sm font-semibold text-slate-700">Download HCM Installer</h2>
        <span className="ml-auto text-xs text-slate-400">Official Microsoft download</span>
      </div>
      <div className="p-6 space-y-3">
        <p className="text-sm text-slate-600">
          Install the <strong className="text-slate-800">Hybrid Connection Manager</strong> on the machine
          that has access to your on-premises SQL Server. Download the installer directly from Microsoft —
          no Azure credentials or portal login required.
        </p>
        <a
          href="https://learn.microsoft.com/en-us/azure/app-service/app-service-hybrid-connections#hybrid-connection-manager"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-earth-600 hover:bg-earth-700 active:bg-earth-800 text-white text-sm font-semibold px-4 py-2.5 transition-colors"
        >
          <Download className="h-4 w-4" />
          Download Hybrid Connection Manager
          <ExternalLink className="h-3.5 w-3.5 opacity-70" />
        </a>
        <p className="text-[11px] text-slate-400">
          Opens the official Microsoft Azure documentation page. The installer download link is under the
          "Hybrid Connection Manager" section. Windows 7+ / Server 2008 R2+ required.
        </p>
      </div>
    </div>
  )
}

// ── Create Hybrid Connection form ─────────────────────────────────────────────

interface CreateResult {
  status: string
  errorDetail: string | null
  name: string
  listenerConnectionString: string | null
  senderConnectionString: string | null
}

function CreateConnectionForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName]   = useState('')
  const [host, setHost]   = useState('')
  const [port, setPort]   = useState('1433')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [result, setResult]   = useState<CreateResult | null>(null)

  const valid = name.trim() && host.trim() && parseInt(port) > 0

  const handleCreate = async () => {
    if (!valid) return
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const { data } = await api.createHybridConnection({
        name: name.trim(),
        endpoint_host: host.trim(),
        endpoint_port: parseInt(port, 10) || 1433,
      })
      setResult({
        status: data.status,
        errorDetail: data.error_detail ?? null,
        name: data.name,
        listenerConnectionString: data.listener_connection_string ?? null,
        senderConnectionString: data.sender_connection_string ?? null,
      })
      setName(''); setHost(''); setPort('1433')
      onCreated()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
        <Plus className="h-4 w-4 text-earth-600" />
        <h2 className="text-sm font-semibold text-slate-700">Create Hybrid Connection</h2>
        <span className="ml-auto text-xs text-slate-400">Saved to your account</span>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div
          className="flex flex-col items-center justify-center py-8 gap-2"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(245,247,255,0.97) 100%)',
            borderTop: '1px solid rgba(226,232,240,0.50)',
          }}
        >
          <Loader3D message="Creating Hybrid Connection in Azure…" size="sm" />
        </div>
      )}

      <div className={`p-6 space-y-4 ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Hybrid connection name</label>
            <input
              type="text"
              className="form-input w-full"
              placeholder="e.g. sat-onprem-sql"
              value={name}
              onChange={(e) => { setName(e.target.value); setResult(null) }}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          {/* Endpoint host */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Endpoint host</label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                className="form-input pl-10 w-full"
                placeholder="SQL Server hostname or IP"
                value={host}
                onChange={(e) => { setHost(e.target.value); setResult(null) }}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Endpoint port */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Endpoint port</label>
            <input
              type="number"
              className="form-input w-full"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => { setPort(e.target.value); setResult(null) }}
            />
          </div>
        </div>

        <Button
          onClick={handleCreate}
          loading={loading}
          disabled={!valid}
          leftIcon={loading ? undefined : <Plus className="h-4 w-4" />}
          className="w-full sm:w-auto"
        >
          Create Connection
        </Button>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 animate-slide-down">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && result.status === 'provisioned' && (
          <div className="rounded-lg border border-earth-200 bg-earth-50 px-3 py-2.5 text-sm text-earth-700 animate-slide-down space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <strong>{result.name}</strong> was created and provisioned in the Azure Relay Namespace.
                Copy the Listener string below and paste it into Hybrid Connection Manager on your on-premises machine.
              </span>
            </div>
            {result.listenerConnectionString && (
              <ConnectionStringBox
                value={result.listenerConnectionString}
                label="HCM Listener String"
                hint={<>Paste into <strong>Hybrid Connection Manager</strong> on your on-premises machine.</>}
              />
            )}
          </div>
        )}

        {result && result.status !== 'provisioned' && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-700 animate-slide-down">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p>
                <strong>{result.name}</strong> was saved to your account.
                Azure auto-provisioning could not complete on this server.
              </p>
              {result.errorDetail && (
                <p className="mt-1 text-xs text-blue-600">{result.errorDetail}</p>
              )}
              <p className="mt-1 text-xs text-blue-600">
                You can complete setup manually via the Azure Portal — see the guide below.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    provisioned:     { label: 'Provisioned',   cls: 'bg-earth-50 text-earth-700 border-earth-200' },
    created:         { label: 'Saved',          cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    config_missing:  { label: 'Saved (manual setup needed)', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    error:           { label: 'Provision failed', cls: 'bg-red-50 text-red-700 border-red-200' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ── Single connection row with collapsible string ────────────────────────────

function ConnectionItem({
  hc,
  deleting,
  onDelete,
}: {
  hc: HybridConnection
  deleting: boolean
  onDelete: (id: string) => void
}) {
  const [showString, setShowString] = useState(false)
  const [rebinding, setRebinding] = useState(false)
  const [rebindMsg, setRebindMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const hasStrings = !!hc.listener_connection_string

  const handleRebind = async () => {
    setRebinding(true)
    setRebindMsg(null)
    try {
      const { data } = await api.rebindHybridConnection(hc.connection_id)
      setRebindMsg({ ok: true, text: data.message })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setRebindMsg({ ok: false, text: msg })
    } finally {
      setRebinding(false)
    }
  }

  return (
    <div className="px-5 py-3.5 hover:bg-slate-50/70 transition-colors duration-150">
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="h-8 w-8 rounded-lg bg-earth-50 border border-earth-100 flex items-center justify-center shrink-0">
          <Share2 className="h-3.5 w-3.5 text-earth-600" />
        </div>

        {/* Name + endpoint */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{hc.name}</p>
          <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
            {hc.endpoint_host}:{hc.endpoint_port}
          </p>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={hc.status} />

          <span className="text-[11px] text-slate-400 tabular-nums hidden sm:block mx-1">
            {hc.created_at ? new Date(hc.created_at).toLocaleDateString() : '—'}
          </span>

          {hasStrings && (
            <button
              onClick={() => setShowString((v) => !v)}
              title={showString ? 'Hide connection strings' : 'Show connection strings'}
              className={`p-1.5 rounded-lg transition-all duration-150 ${
                showString
                  ? 'bg-earth-100 text-earth-700'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={handleRebind}
            disabled={rebinding || deleting}
            title="Re-apply App Service binding (fixes 'Not Reachable' for on-premises servers)"
            className="p-1.5 rounded-lg hover:bg-earth-50 hover:text-earth-700 text-slate-400 transition-colors disabled:opacity-50"
          >
            <Network className={`h-3.5 w-3.5 ${rebinding ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => onDelete(hc.connection_id)}
            disabled={deleting}
            className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-400 transition-colors disabled:opacity-50"
            title="Delete"
          >
            {deleting
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Rebind feedback */}
      {rebindMsg && (
        <div className={`mt-2 ml-11 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs animate-slide-down ${
          rebindMsg.ok
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {rebindMsg.ok
            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          <span>{rebindMsg.text}</span>
        </div>
      )}

      {/* Collapsible connection strings */}
      {showString && hasStrings && (
        <div
          className="mt-3 ml-11 space-y-2 animate-slide-down"
          style={{ animationDuration: '180ms', animationTimingFunction: 'cubic-bezier(0,0,0.2,1)' }}
        >
          {hc.listener_connection_string && (
            <ConnectionStringBox
              value={hc.listener_connection_string}
              label="HCM Listener String"
              hint={<>Paste into <strong>Hybrid Connection Manager</strong> on your on-premises machine.</>}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── My Connections list ───────────────────────────────────────────────────────

function MyConnectionsListControlled() {
  const [connections, setConnections] = useState<HybridConnection[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<Set<string>>(new Set())

  const load = async () => {
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

  useEffect(() => { load() }, [])

  const handleCreated = () => { load() }

  const handleDelete = async (id: string) => {
    setDeleting(prev => new Set([...prev, id]))
    try {
      await api.deleteHybridConnection(id)
      setConnections((prev) => prev.filter((c) => c.connection_id !== id))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDeleting(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  return (
    <>
      <CreateConnectionForm onCreated={handleCreated} />

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <Share2 className="h-4 w-4 text-earth-600" />
          <h2 className="text-sm font-semibold text-slate-700">My Hybrid Connections</h2>
          {connections.length > 0 && (
            <span className="ml-1 text-[11px] font-semibold text-slate-400 bg-slate-200 rounded-full px-1.5 py-px">
              {connections.length}
            </span>
          )}
          <button
            onClick={load}
            className="ml-auto p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Hint bar — shown only when there are connections with strings */}
        {connections.some((c) => c.listener_connection_string) && (
          <div className="flex items-center gap-1.5 px-5 py-2 bg-slate-50/50 border-b border-slate-100 text-[11px] text-slate-400">
            <KeyRound className="h-3 w-3" />
            <span>Tap the key icon on any row to reveal its HCM Listener string.</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && connections.length === 0 ? (
          <div className="py-10 flex items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : connections.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            No hybrid connections yet. Create one above.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {connections.map((hc) => (
              <ConnectionItem
                key={hc.connection_id}
                hc={hc}
                deleting={deleting.has(hc.connection_id)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Setup steps ───────────────────────────────────────────────────────────────

interface Step {
  n: number
  title: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Prerequisites',
    body: (
      <ul className="space-y-2 text-sm text-slate-600">
        {[
          'Hybrid Connection Manager (HCM) installed on the machine that has access to your on-premises SQL Server',
          'That machine must be on the same network (or VPN) as the SQL Server',
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-earth-500 mt-0.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    n: 2,
    title: 'Create a Hybrid Connection',
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          Fill in the <strong className="text-slate-800">Create Hybrid Connection</strong> form above and click
          {' '}<strong className="text-slate-800">Create Connection</strong>. The connection is provisioned directly
          in an <strong className="text-slate-800">Azure Relay Namespace</strong> — not bound to the App Service plan —
          so there is no tier limit on how many you can create.
        </p>
        <p>
          On success you will receive the <strong className="text-slate-700">HCM Listener String</strong> — paste it into Hybrid Connection Manager on the on-premises machine. That is all you need to do.
        </p>
        <p className="text-xs text-slate-400">
          If auto-provisioning is unavailable, create the Hybrid Connection manually under{' '}
          <strong className="text-slate-600">Azure Portal → Relay Namespace → Hybrid Connections → Add</strong>.
        </p>
      </div>
    ),
  },
  {
    n: 3,
    title: 'Connect your machine to the VPN',
    body: (
      <div className="space-y-2 text-sm text-slate-600">
        <p>
          Ensure the machine running HCM is connected to the network that hosts the on-premises SQL Server.
          Verify access by pinging or connecting to the SQL Server from that machine before proceeding.
        </p>
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            The Azure app can only reach the SQL Server while the HCM machine remains on the network and HCM is running.
            Disconnect either, and assessments will fail with a connection error.
          </p>
        </div>
      </div>
    ),
  },
  {
    n: 4,
    title: 'Verify and run an assessment',
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          Use the <strong className="text-slate-800">Test Connectivity</strong> panel below to confirm the relay
          is working — enter the same hostname and port you used when creating the Hybrid Connection.
        </p>
        <p>
          Once reachable, go to <strong className="text-slate-800">New Assessment</strong>, enter the on-premises
          SQL Server hostname exactly as configured in the Hybrid Connection endpoint, and run normally.
        </p>
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            Keep the HCM Listener string confidential — it grants relay access to your on-premises machine.
          </p>
        </div>
      </div>
    ),
  },
]

function SetupStep({ step, defaultOpen }: { step: Step; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="card overflow-hidden animate-fade-slide">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
        aria-expanded={open}
      >
        <div className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-earth-50 border border-earth-200 text-earth-800 text-xs font-bold">
          {step.n}
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-800">{step.title}</span>
        {open
          ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100 animate-slide-down">
          {step.body}
        </div>
      )}
    </div>
  )
}

// ── Connectivity test ─────────────────────────────────────────────────────────

function isIpAddress(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s.trim())
}

function ConnectivityTest() {
  const [server, setServer] = useState('')
  const [port, setPort]     = useState('1433')
  const [result, setResult] = useState<{ reachable: boolean; latency_ms: number | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const serverIsIp = isIpAddress(server)

  const handleTest = async () => {
    if (!server.trim()) return
    setResult(null)
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.detectConnectivity([{
        server: server.trim(),
        port: parseInt(port, 10) || 1433,
      }])
      setResult({ reachable: data[0].reachable, latency_ms: data[0].latency_ms })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
        <Network className="h-4 w-4 text-earth-600" />
        <h2 className="text-sm font-semibold text-slate-700">Test Connectivity</h2>
        <span className="ml-auto text-xs text-slate-400">
          Verify the Azure app can reach your SQL Server through HCM
        </span>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div
          className="flex flex-col items-center justify-center py-8"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(245,247,255,0.97) 100%)',
            borderTop: '1px solid rgba(226,232,240,0.50)',
          }}
        >
          <Loader3D message="Testing TCP connectivity…" size="sm" />
        </div>
      )}

      <div className={`p-6 space-y-4 ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              className="form-input pl-10"
              placeholder="SQL Server hostname (e.g. UIAP-S-SQL-01V)"
              value={server}
              onChange={(e) => { setServer(e.target.value); setResult(null); setError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && server.trim() && handleTest()}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <input
            type="number"
            className="form-input w-24"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => { setPort(e.target.value); setResult(null) }}
            title="Port"
          />
          <Button
            onClick={handleTest}
            loading={loading}
            disabled={!server.trim()}
            leftIcon={loading ? undefined : <Search className="h-4 w-4" />}
          >
            Test
          </Button>
        </div>

        {/* IP address warning — shown inline before testing */}
        {serverIsIp && !result && !loading && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 animate-slide-down">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Azure Hybrid Connection routes traffic by <strong>hostname</strong>, not IP address.
              IP <strong>{server.trim()}</strong> will not be routed through HCM and will always appear unreachable.
              Use the exact hostname you registered in the Hybrid Connection endpoint instead.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 animate-slide-down">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className={`animate-slide-down rounded-xl border px-4 py-3 ${
            result.reachable
              ? 'border-earth-200 bg-earth-50'
              : 'border-red-200 bg-red-50'
          }`}>
            <div className={`flex items-center gap-2 text-sm font-semibold ${
              result.reachable ? 'text-earth-700' : 'text-red-700'
            }`}>
              {result.reachable
                ? <><Wifi className="h-4 w-4" /> Reachable{result.latency_ms != null ? ` — ${result.latency_ms} ms` : ''}</>
                : <><WifiOff className="h-4 w-4" /> Not reachable</>}
            </div>
            {!result.reachable && (
              <p className="mt-1.5 text-xs text-red-600">
                {serverIsIp
                  ? <>Azure Hybrid Connection routes by <strong>hostname only</strong> — IP address <strong>{server.trim()}</strong> bypasses HCM and cannot reach a private network. Use the hostname registered in your Hybrid Connection endpoint.</>
                  : <>Ensure HCM is running on a machine connected to the VPN, the Hybrid Connection is configured in Azure Portal, and the endpoint host matches the SQL Server hostname exactly.</>}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HybridConnectionPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            Azure Hybrid Connection
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">
            Connect this hosted application to your on-premises SQL Server through the
            Azure Hybrid Connection Manager running on your VPN-connected laptop.
            No inbound firewall rules or Python agent required.
          </p>
        </div>
      </div>

      {/* How it works — 3 bullets */}
      <div className="grid sm:grid-cols-3 gap-3 stagger-children">
        {[
          {
            icon: Laptop,
            title: 'HCM on your laptop',
            body: 'Install the Hybrid Connection Manager. It makes one outbound connection to Azure Relay — no inbound ports needed.',
          },
          {
            icon: Share2,
            title: 'Azure relays the traffic',
            body: 'The App Service sends SQL connections through the relay to HCM, which forwards them to the on-prem SQL Server.',
          },
          {
            icon: Database,
            title: 'Assessment runs in the cloud',
            body: 'The app connects to the SQL Server as if it were local. No gateway agent, no polling — just configure and run.',
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-4 animate-fade-slide">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-earth-50 border border-earth-100 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-earth-600" />
              </div>
              <p className="text-sm font-semibold text-slate-800">{title}</p>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      {/* Topology diagram */}
      <ConnectionDiagram />

      {/* HCM installer download */}
      <HcmDownloadCard />

      {/* ── Create form + My Connections ── */}
      <MyConnectionsListControlled />

      {/* Setup steps */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Setup Guide</h2>
        <div className="space-y-2 stagger-children">
          {STEPS.map((step, i) => (
            <SetupStep key={step.n} step={step} defaultOpen={i === 0} />
          ))}
        </div>
      </div>

      {/* Connectivity test */}
      <ConnectivityTest />

      {/* Running assessment note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-700">
          <strong>Running an assessment:</strong> Once HCM is active, go to{' '}
          <strong>New Assessment</strong>, enter the on-prem SQL Server hostname exactly
          as configured in the Hybrid Connection endpoint, and run normally.
          The app reaches the server through the relay transparently.
        </div>
      </div>
    </div>
  )
}
