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
  Plus, Trash2, Terminal, RefreshCw, Server,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { HybridConnection } from '../types/api'
import Button from '../components/ui/Button'

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

// ── Create Hybrid Connection form ─────────────────────────────────────────────

function CreateConnectionForm({ onCreated }: { onCreated: (hc: HybridConnection) => void }) {
  const [name, setName]               = useState('')
  const [host, setHost]               = useState('')
  const [port, setPort]               = useState('1433')
  const [namespace, setNamespace]     = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [cliCmds, setCliCmds]         = useState<string[] | null>(null)

  const valid = name.trim() && host.trim() && namespace.trim() && parseInt(port) > 0

  const handleCreate = async () => {
    if (!valid) return
    setError(null)
    setCliCmds(null)
    setLoading(true)
    try {
      const { data } = await api.createHybridConnection({
        name: name.trim(),
        endpoint_host: host.trim(),
        endpoint_port: parseInt(port, 10) || 1433,
        service_bus_namespace: namespace.trim(),
      })
      onCreated(data)
      if (data.cli_commands?.length) setCliCmds(data.cli_commands)
      // Reset fields
      setName(''); setHost(''); setPort('1433'); setNamespace('')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
        <Plus className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">Create Hybrid Connection</h2>
        <span className="ml-auto text-xs text-slate-400">Saved to your account</span>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Hybrid connection name</label>
            <input
              type="text"
              className="form-input w-full"
              placeholder="e.g. sat-onprem-sql"
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          {/* Service Bus Namespace */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Service Bus Namespace</label>
            <input
              type="text"
              className="form-input w-full"
              placeholder="e.g. myns or myns.servicebus.windows.net"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
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
                onChange={(e) => setHost(e.target.value)}
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
              onChange={(e) => setPort(e.target.value)}
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

        {cliCmds && (
          <div className="animate-slide-down rounded-xl border border-slate-200 bg-slate-900 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700">
              <Terminal className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">
                Azure CLI commands — run these to provision the connection
              </span>
            </div>
            <pre className="px-4 py-3 text-[11px] text-emerald-300 leading-relaxed overflow-x-auto">
              {cliCmds.join('\n')}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: HybridConnection['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    provisioned:     { label: 'Provisioned',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    created:         { label: 'Created',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    cli_unavailable: { label: 'CLI not set up', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    cli_error:       { label: 'CLI error',      cls: 'bg-red-50 text-red-700 border-red-200' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ── My Connections list ───────────────────────────────────────────────────────

function MyConnectionsList() {
  const [connections, setConnections] = useState<HybridConnection[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)

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

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await api.deleteHybridConnection(id)
      setConnections((prev) => prev.filter((c) => c.connection_id !== id))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
        <Share2 className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">My Hybrid Connections</h2>
        <button
          onClick={load}
          className="ml-auto p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

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
            <div key={hc.connection_id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
              <div className="h-9 w-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                <Share2 className="h-4 w-4 text-indigo-500" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{hc.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {hc.endpoint_host}:{hc.endpoint_port}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {hc.service_bus_namespace}.servicebus.windows.net
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={hc.status} />
                <span className="text-[11px] text-slate-400 hidden sm:block">
                  {hc.created_at ? new Date(hc.created_at).toLocaleDateString() : '—'}
                </span>
                <button
                  onClick={() => handleDelete(hc.connection_id)}
                  disabled={deleting === hc.connection_id}
                  className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-400 transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  {deleting === hc.connection_id
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MyConnectionsList that accepts an external "new item" prop ─────────────────

function MyConnectionsListControlled() {
  const [connections, setConnections] = useState<HybridConnection[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)

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

  const handleCreated = (hc: HybridConnection) => {
    // Optimistically prepend; full data will come from next load
    setConnections((prev) => [hc, ...prev])
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await api.deleteHybridConnection(id)
      setConnections((prev) => prev.filter((c) => c.connection_id !== id))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <CreateConnectionForm onCreated={handleCreated} />

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
          <Share2 className="h-4 w-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-700">My Hybrid Connections</h2>
          <button
            onClick={load}
            className="ml-auto p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

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
              <div key={hc.connection_id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                <div className="h-9 w-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                  <Share2 className="h-4 w-4 text-indigo-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{hc.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {hc.endpoint_host}:{hc.endpoint_port}
                    <span className="mx-1.5 text-slate-300">·</span>
                    {hc.service_bus_namespace}.servicebus.windows.net
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={hc.status} />
                  <span className="text-[11px] text-slate-400 hidden sm:block">
                    {hc.created_at ? new Date(hc.created_at).toLocaleDateString() : '—'}
                  </span>
                  <button
                    onClick={() => handleDelete(hc.connection_id)}
                    disabled={deleting === hc.connection_id}
                    className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-400 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deleting === hc.connection_id
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
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
          'Azure subscription with this App Service deployed',
          'On-premises SQL Server reachable from your laptop',
          'VPN client installed, configured, and working',
          'Windows 7+ or Windows Server 2008 R2+ on the HCM machine',
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    n: 2,
    title: 'Create a Hybrid Connection (use the form above or Azure Portal)',
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          Use the <strong className="text-slate-800">Create Hybrid Connection</strong> form above to register the
          connection in this tool. If the server has the Azure CLI configured with your subscription,
          the relay entity and App Service binding are provisioned automatically. Otherwise, the form
          returns CLI commands to run manually.
        </p>
        <p>Alternatively, create the connection directly in Azure Portal:</p>
        <ol className="space-y-2 list-decimal list-inside text-slate-500">
          <li>Open <strong className="text-slate-700">App Service → Networking → Hybrid connections</strong>.</li>
          <li>Click <strong className="text-slate-700">Add hybrid connection → Create new hybrid connection</strong>.</li>
          <li>Fill in name, endpoint host/port, and Service Bus namespace.</li>
        </ol>
      </div>
    ),
  },
  {
    n: 3,
    title: 'Install Hybrid Connection Manager on your laptop',
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>The HCM creates an outbound relay from your laptop to Azure.</p>
        <ol className="space-y-2 list-decimal list-inside">
          <li>
            On the Hybrid connections page in Azure Portal, click{' '}
            <strong className="text-slate-800">Download connection manager</strong>.
          </li>
          <li>Run the installer on the machine that has VPN access to the SQL Server (your laptop).</li>
          <li>After install, open <strong className="text-slate-800">Hybrid Connection Manager UI</strong> from the Start menu.</li>
        </ol>
        <a
          href="https://learn.microsoft.com/en-us/azure/app-service/app-service-hybrid-connections"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Official HCM documentation
        </a>
      </div>
    ),
  },
  {
    n: 4,
    title: 'Connect your laptop to the VPN',
    body: (
      <div className="space-y-2 text-sm text-slate-600">
        <p>
          Connect your VPN client to the network that hosts the on-premises SQL Server.
          Verify access by pinging or connecting to the SQL Server from your laptop before proceeding.
        </p>
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            The Azure app can only reach the SQL Server while your laptop remains on the VPN and HCM is running.
            Disconnect either, and assessments will fail with a connection error.
          </p>
        </div>
      </div>
    ),
  },
  {
    n: 5,
    title: 'Add the connection in HCM and verify',
    body: (
      <ol className="space-y-3 text-sm text-slate-600 list-decimal list-inside">
        <li>In Hybrid Connection Manager UI, click <strong className="text-slate-800">Add a new Hybrid Connection</strong>.</li>
        <li>Sign in with the same Azure account used to create the connection.</li>
        <li>Select the Hybrid Connection you created and click <strong className="text-slate-800">Save</strong>.</li>
        <li>
          Back in Azure Portal, the connection status should change to{' '}
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <Wifi className="h-3.5 w-3.5" /> Connected
          </span>.
        </li>
        <li>
          Use the connectivity test below to confirm the Azure app can reach the SQL Server through the relay.
        </li>
      </ol>
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
        <div className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
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

function ConnectivityTest() {
  const [server, setServer] = useState('')
  const [port, setPort]     = useState('1433')
  const [result, setResult] = useState<{ reachable: boolean; latency_ms: number | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

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
        <Network className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">Test Connectivity</h2>
        <span className="ml-auto text-xs text-slate-400">
          Verify the Azure app can reach your SQL Server through HCM
        </span>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              className="form-input pl-10"
              placeholder="SQL Server hostname or IP"
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

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 animate-slide-down">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className={`animate-slide-down rounded-xl border px-4 py-3 ${
            result.reachable
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}>
            <div className={`flex items-center gap-2 text-sm font-semibold ${
              result.reachable ? 'text-emerald-700' : 'text-red-700'
            }`}>
              {result.reachable
                ? <><Wifi className="h-4 w-4" /> Reachable{result.latency_ms != null ? ` — ${result.latency_ms} ms` : ''}</>
                : <><WifiOff className="h-4 w-4" /> Not reachable</>}
            </div>
            {!result.reachable && (
              <p className="mt-1.5 text-xs text-red-600">
                Ensure HCM is running on a machine connected to the VPN, the Hybrid Connection is configured in Azure Portal,
                and the endpoint host matches the SQL Server hostname exactly.
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
              <div className="h-7 w-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="text-sm font-semibold text-slate-800">{title}</p>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      {/* Topology diagram */}
      <ConnectionDiagram />

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
