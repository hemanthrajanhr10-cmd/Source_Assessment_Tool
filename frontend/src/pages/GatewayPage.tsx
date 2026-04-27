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
import { timeAgo } from '../utils/dateTime'

function GatewayStatusBadge({ status }: { status: Gateway['status'] }) {
  return status === 'online' ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
      <Wifi className="h-3 w-3" /> Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200">
      <WifiOff className="h-3 w-3" /> Offline
    </span>
  )
}

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
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
        <Plus className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">Register New Gateway</h2>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-slate-500">
          Give the gateway a name, then download the agent and run it inside the client's network.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            className="form-input flex-1"
            placeholder="e.g. Acme Corp — HQ"
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
            <p className="text-sm font-semibold text-emerald-700">Gateway registered! Copy your key:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm font-mono text-slate-700 select-all break-all">
                {newKey}
              </code>
              <button
                onClick={copyKey}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-white text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Set this as the <code className="font-mono bg-slate-100 px-1 rounded text-slate-700">GATEWAY_KEY</code> environment
              variable when running the agent.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="ml-auto shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-700 transition-colors"
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
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
        <Download className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">Download Agent</h2>
      </div>
      <div className="p-6 space-y-5">

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm space-y-1">
            <div className="flex items-center gap-2 font-semibold text-violet-700">
              <Zap className="h-4 w-4" /> Azure Relay Hybrid Connection
            </div>
            <p className="text-xs text-violet-600">
              Real-time via outbound WebSocket (port 443). No inbound ports needed.
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm space-y-1">
            <div className="flex items-center gap-2 font-semibold text-blue-700">
              <Info className="h-4 w-4" /> Azure Service Bus (alternative)
            </div>
            <p className="text-xs text-blue-600">
              Queue-based delivery via outbound HTTPS port 443. Works through corporate VPNs.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Step 1 — Download the agent</p>
          <a
            href={api.getAgentDownloadUrl()}
            download="sat_agent.py"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Download className="h-4 w-4" />
            Download sat_agent.py
          </a>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Step 2 — Install dependencies</p>
          <div className="code-block flex items-center gap-2">
            <Terminal className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="flex-1">pip install pymssql requests websockets</span>
            <CopyButton text="pip install pymssql requests websockets" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-violet-600" />
            Step 3a — Azure Relay mode (recommended)
          </p>
          <ol className="text-xs text-slate-500 list-decimal list-inside space-y-1 pl-1">
            <li>Create a <strong className="text-slate-700">Relay</strong> namespace in Azure Portal</li>
            <li>Create a <strong className="text-slate-700">Hybrid Connection</strong> with Listen + Send policy</li>
            <li>Copy the <strong className="text-slate-700">Primary connection string</strong></li>
            <li>Paste below and run the agent:</li>
          </ol>
          <div className="code-block space-y-2 text-xs">
            <div className="text-slate-500"># Windows — Command Prompt</div>
            <div className="break-all">set RELAY_CONNECTION_STRING=<span className="text-amber-400">Endpoint=sb://my-relay.servicebus.windows.net/;...</span></div>
            <div className="break-all">set SAT_SERVER_URL=<span className="text-amber-400">https://your-sat-app.azurewebsites.net</span></div>
            <div>set GATEWAY_KEY=<span className="text-amber-400">&lt;your-gateway-key&gt;</span></div>
            <div className="flex items-center gap-2">
              <span className="flex-1">python sat_agent.py</span>
              <CopyButton text="python sat_agent.py" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-blue-600" />
            Step 3b — Service Bus mode (alternative)
          </p>
          <div className="code-block space-y-2 text-xs">
            <div className="text-slate-500"># Windows — Command Prompt</div>
            <div className="break-all">set SERVICE_BUS_CONNECTION_STRING=<span className="text-amber-400">Endpoint=sb://sat-servicebus.servicebus.windows.net/;...</span></div>
            <div>python sat_agent.py</div>
          </div>
          <p className="text-xs text-slate-400">
            Add <code className="font-mono bg-slate-100 px-1 rounded text-slate-700">azure-servicebus</code> to your pip install when using this mode.
          </p>
        </div>
      </div>
    </div>
  )
}

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
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-violet-50 transition-colors"
      >
        <Zap className="h-3.5 w-3.5 text-violet-600 shrink-0" />
        <span className="text-xs font-semibold text-violet-700 flex-1">
          Azure Relay Config
          {isConfigured && (
            <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full text-[10px]">
              <Check className="h-2.5 w-2.5" /> Configured
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-violet-400" /> : <ChevronDown className="h-3.5 w-3.5 text-violet-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-violet-200">
          <p className="text-xs text-violet-600">
            Paste the Azure Relay Hybrid Connection string (must include <code className="font-mono bg-violet-100 px-1 rounded">EntityPath=</code>).
          </p>
          <textarea
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
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
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
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
      <Spinner className="text-indigo-500" />
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
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-200 bg-slate-50">
        <Radio className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700">Registered Gateways</h2>
        <span className="ml-auto text-xs text-slate-400">{gateways.length} total</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {gateways.map((gw) => (
          <li key={gw.gateway_key} className="px-6 py-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800 truncate">{gw.name}</span>
                  <GatewayStatusBadge status={gw.status} />
                  {gw.relay_connection_string && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-700 ring-1 ring-violet-200">
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
                    {gw.status === 'online' ? 'Last seen ' : ''}{timeAgo(gw.last_seen_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => copyKey(gw.gateway_key)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
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

export default function GatewayPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['gateways'],
    queryFn: () => api.listGateways().then((r) => r.data),
    refetchInterval: 10_000,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['gateways'] })

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Gateway Manager</h1>
          <p className="mt-1 text-sm text-slate-500">
            Connect to on-premises SQL Servers through a lightweight agent inside the client's network.
            Uses Azure Relay Hybrid Connection for VPN-compatible job delivery.
          </p>
        </div>
      </div>

      <RegisterGateway onRegistered={refresh} />
      <DownloadAgent />
      <GatewayList gateways={data ?? []} isLoading={isLoading} onRelayUpdate={refresh} />
    </div>
  )
}
