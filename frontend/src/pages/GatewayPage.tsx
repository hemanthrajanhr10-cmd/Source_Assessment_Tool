import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Radio, Plus, Download, Copy, Check, Wifi, WifiOff,
  Clock, AlertCircle, Info, Terminal, Zap, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { Gateway } from '../types/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso?: string) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

function StatusBadge({ status }: { status: Gateway['status'] }) {
  return status === 'online' ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      <Wifi className="h-3 w-3" /> Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
      <WifiOff className="h-3 w-3" /> Offline
    </span>
  )
}

// ── Register form ──────────────────────────────────────────────────────────────

function RegisterGateway({ onRegistered }: { onRegistered: () => void }) {
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => api.registerGateway(name.trim()),
    onSuccess: ({ data }) => {
      setNewKey(data.gateway_key)
      setName('')
      onRegistered()
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  const copyKey = () => {
    if (!newKey) return
    navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
        <Plus className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-800">Register New Gateway</h2>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-slate-500">
          Give the gateway a name (e.g. "Client A — London Office"), then download the agent and
          run it on any machine inside the client's network.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            className="form-input flex-1"
            placeholder="Gateway name, e.g. Acme Corp — HQ"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            maxLength={100}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && mutation.mutate()}
          />
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!name.trim()}
          >
            Register
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {newKey && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-emerald-800">Gateway registered! Copy your key:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-white border border-emerald-200 px-3 py-2 text-sm font-mono text-slate-800 select-all break-all">
                {newKey}
              </code>
              <button
                onClick={copyKey}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-emerald-700">
              Set this as the <code className="font-mono bg-emerald-100 px-1 rounded">GATEWAY_KEY</code> environment
              variable when running the agent. Keep it safe — it grants access to submit assessment results.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="ml-auto shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Download agent ─────────────────────────────────────────────────────────────

function DownloadAgent() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
        <Download className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-800">Download Agent</h2>
      </div>
      <div className="p-6 space-y-5">

        {/* Mode overview */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800 space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <Zap className="h-4 w-4" /> Azure Relay Hybrid Connection
            </div>
            <p className="text-xs text-purple-700">
              Recommended for on-prem & network-restricted databases. Real-time dispatch via
              outbound WebSocket (port 443). No inbound ports needed.
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <Info className="h-4 w-4" /> Azure Service Bus (alternative)
            </div>
            <p className="text-xs text-blue-700">
              Queue-based delivery via outbound HTTPS port 443.
              Works through corporate VPNs. Agent polls the queue.
            </p>
          </div>
        </div>

        {/* Step 1 */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Step 1 — Download the agent</p>
          <a
            href={api.getAgentDownloadUrl()}
            download="sat_agent.py"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download sat_agent.py
          </a>
        </div>

        {/* Step 2 */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Step 2 — Install dependencies</p>
          <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100 flex items-center gap-2">
            <Terminal className="h-4 w-4 shrink-0 text-slate-400" />
            <span>pip install pymssql requests websockets</span>
            <CopyButton text="pip install pymssql requests websockets" />
          </div>
        </div>

        {/* Step 3 — Relay mode */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-purple-500" />
            Step 3a — Configure Azure Relay mode (recommended)
          </p>
          <ol className="text-xs text-slate-500 list-decimal list-inside space-y-1 pl-1">
            <li>In Azure Portal, create a <strong>Relay</strong> namespace (or use an existing one)</li>
            <li>Inside it, create a <strong>Hybrid Connection</strong> — name it anything (e.g. <code className="font-mono bg-slate-100 px-1 rounded">sat-gateway-acme</code>)</li>
            <li>Go to the Hybrid Connection → <strong>Shared access policies</strong> → Add a policy with <strong>Listen + Send</strong></li>
            <li>Copy the <strong>Primary connection string</strong> — it includes <code className="font-mono bg-slate-100 px-1 rounded">EntityPath=</code></li>
            <li>Paste it into the gateway's <strong>Relay Config</strong> panel below, then run the agent:</li>
          </ol>
          <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-xs text-slate-100 space-y-2">
            <div className="text-slate-400"># Windows — Command Prompt</div>
            <div className="flex items-start gap-2">
              <span className="flex-1 break-all">set RELAY_CONNECTION_STRING=<span className="text-yellow-300">Endpoint=sb://my-relay.servicebus.windows.net/;SharedAccessKeyName=...;SharedAccessKey=...;EntityPath=sat-gateway-acme</span></span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex-1 break-all">set SAT_SERVER_URL=<span className="text-yellow-300">https://your-sat-app.azurewebsites.net</span></span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex-1">set GATEWAY_KEY=<span className="text-yellow-300">&lt;your-gateway-key&gt;</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1">python sat_agent.py</span>
              <CopyButton text="python sat_agent.py" />
            </div>
          </div>
        </div>

        {/* Step 3b — Service Bus mode */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-blue-500" />
            Step 3b — Configure Service Bus mode (alternative)
          </p>
          <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-xs text-slate-100 space-y-2">
            <div className="text-slate-400"># Windows — Command Prompt</div>
            <div className="flex items-start gap-2">
              <span className="flex-1 break-all">set SERVICE_BUS_CONNECTION_STRING=<span className="text-yellow-300">Endpoint=sb://sat-servicebus.servicebus.windows.net/;SharedAccessKey=...</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1">python sat_agent.py</span>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Add <code className="font-mono bg-slate-100 px-1 rounded">azure-servicebus</code> to your pip install command when using this mode.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Relay config panel (per gateway) ──────────────────────────────────────────

function RelayConfigPanel({ gw, onSaved }: { gw: Gateway; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [connStr, setConnStr] = useState(gw.relay_connection_string ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.setGatewayRelay(gw.gateway_key, connStr.trim()),
    onSuccess: () => {
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 3000)
      onSaved()
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  const isConfigured = !!gw.relay_connection_string

  return (
    <div className="mt-3 rounded-xl border border-purple-100 bg-purple-50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-purple-100 transition-colors"
      >
        <Zap className="h-3.5 w-3.5 text-purple-600 shrink-0" />
        <span className="text-xs font-semibold text-purple-800 flex-1">
          Azure Relay Config
          {isConfigured && (
            <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full text-[10px]">
              <Check className="h-2.5 w-2.5" /> Configured
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-purple-400" /> : <ChevronDown className="h-3.5 w-3.5 text-purple-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-purple-100">
          <p className="text-xs text-purple-700">
            Paste the Azure Relay Hybrid Connection string (must include <code className="font-mono bg-purple-100 px-1 rounded">EntityPath=</code>).
            Leave blank to use Service Bus / HTTP polling mode.
          </p>
          <textarea
            className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            rows={3}
            placeholder="Endpoint=sb://my-relay.servicebus.windows.net/;SharedAccessKeyName=...;SharedAccessKey=...;EntityPath=sat-gateway-xyz"
            value={connStr}
            onChange={(e) => { setConnStr(e.target.value); setError(null) }}
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
            >
              {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save'}
            </Button>
            {isConfigured && (
              <button
                onClick={() => { setConnStr(''); mutation.mutate() }}
                className="flex items-center gap-1 text-xs text-red-600 hover:underline"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gateway list ───────────────────────────────────────────────────────────────

function GatewayList({ gateways, isLoading, onRelayUpdate }: {
  gateways: Gateway[]
  isLoading: boolean
  onRelayUpdate: () => void
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  if (isLoading) return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  )

  if (!gateways.length) return (
    <div className="card p-8 text-center">
      <Radio className="h-8 w-8 text-slate-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-slate-600">No gateways registered yet</p>
      <p className="text-xs text-slate-400 mt-1">Register one above and download the agent to get started.</p>
    </div>
  )

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
        <Radio className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-800">Registered Gateways</h2>
        <span className="ml-auto text-xs text-slate-400">{gateways.length} total</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {gateways.map((gw) => (
          <li key={gw.gateway_key} className="px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-900 truncate">{gw.name}</span>
                  <StatusBadge status={gw.status} />
                  {gw.relay_connection_string && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                      <Zap className="h-2.5 w-2.5" /> Relay
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  <span className="font-mono truncate max-w-[200px]" title={gw.gateway_key}>
                    {gw.gateway_key.substring(0, 8)}…{gw.gateway_key.substring(gw.gateway_key.length - 6)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {gw.status === 'online' ? 'Last seen ' : ''}{relativeTime(gw.last_seen_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => copyKey(gw.gateway_key)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                title="Copy gateway key"
              >
                {copiedKey === gw.gateway_key ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedKey === gw.gateway_key ? 'Copied' : 'Key'}
              </button>
            </div>
            <RelayConfigPanel gw={gw} onSaved={onRelayUpdate} />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GatewayPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['gateways'],
    queryFn: () => api.listGateways().then((r) => r.data),
    refetchInterval: 10_000,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['gateways'] })

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Gateway Manager</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect to on-premises or network-restricted SQL Servers through a lightweight agent
          running inside the client's network. Uses Azure Relay Hybrid Connection for real-time,
          VPN-compatible job delivery.
        </p>
      </div>

      <RegisterGateway onRegistered={refresh} />
      <DownloadAgent />
      <GatewayList gateways={data ?? []} isLoading={isLoading} onRelayUpdate={refresh} />
    </div>
  )
}
