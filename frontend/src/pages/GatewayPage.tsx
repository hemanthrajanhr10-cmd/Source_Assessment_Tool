import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Radio, Plus, Download, Copy, Check, Wifi, WifiOff,
  Clock, AlertCircle, Info, Terminal,
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

// ── Download agent ─────────────────────────────────────────────────────────────

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

function DownloadAgent() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
        <Download className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-800">Download Agent</h2>
      </div>
      <div className="p-6 space-y-5">

        {/* How it works */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            The agent connects to <strong>Azure Service Bus</strong> (outbound HTTPS port 443) —
            this works through corporate VPNs. No inbound ports needed on the client network.
            Requires Python 3.9+ only. No ODBC Driver installation needed.
          </span>
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
            <span>pip install pymssql requests azure-servicebus</span>
            <CopyButton text="pip install pymssql requests azure-servicebus" />
          </div>
        </div>

        {/* Step 3 */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Step 3 — Set the Service Bus connection string and run</p>
          <p className="text-xs text-slate-400">
            Get the connection string from: <strong>Azure Portal → Service Bus → sat-servicebus → Shared access policies → RootManageSharedAccessKey → Primary Connection String</strong>
          </p>

          <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-xs text-slate-100 space-y-2">
            <div className="text-slate-400"># Windows — Command Prompt</div>
            <div className="flex items-start gap-2">
              <span className="flex-1 break-all">set SERVICE_BUS_CONNECTION_STRING=<span className="text-yellow-300">Endpoint=sb://sat-servicebus.servicebus.windows.net/;SharedAccessKey=...</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1">python sat_agent.py</span>
              <CopyButton text="python sat_agent.py" />
            </div>
          </div>

          <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-xs text-slate-100 space-y-2">
            <div className="text-slate-400"># Linux / Mac — Terminal</div>
            <div className="flex items-start gap-2">
              <span className="flex-1 break-all">export SERVICE_BUS_CONNECTION_STRING=<span className="text-yellow-300">Endpoint=sb://sat-servicebus.servicebus.windows.net/;SharedAccessKey=...</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1">python sat_agent.py</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          The agent connects to Azure Service Bus on port 443 (HTTPS) — the same port used by
          Office 365 and Teams, so corporate firewalls allow it by default.
          Keep the agent running while assessments are being submitted.
        </p>
      </div>
    </div>
  )
}

// ── Gateway list ───────────────────────────────────────────────────────────────

function GatewayList({ gateways, isLoading }: { gateways: Gateway[]; isLoading: boolean }) {
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
          <li key={gw.gateway_key} className="px-6 py-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-900 truncate">{gw.name}</span>
                <StatusBadge status={gw.status} />
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
          Connect to on-premises SQL Servers through a lightweight agent running inside the client's network.
        </p>
      </div>

      <RegisterGateway onRegistered={refresh} />
      <DownloadAgent />
      <GatewayList gateways={data ?? []} isLoading={isLoading} />
    </div>
  )
}
