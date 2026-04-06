import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Server, Database, User, Lock, Eye, EyeOff,
  ShieldCheck, Zap, Tag, AlertCircle, ArrowRight,
  CheckCircle2, WifiOff, Wifi,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import Button from '../components/ui/Button'

interface FormState {
  server: string
  port: number
  database: string
  username: string
  password: string
  trust_server_certificate: boolean
  encrypt: boolean
  label: string
  include_null_analysis: boolean
  null_analysis_sample_limit: number
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent
          transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
          ${checked ? 'bg-brand-600' : 'bg-slate-200'}
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 rounded-full bg-white shadow-sm
            transform transition-transform duration-200
            ${checked ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </button>
      <div>
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; message: string } | { status: 'fail'; message: string }

export default function NewAssessmentPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })

  const [form, setForm] = useState<FormState>({
    server: '',
    port: 1433,
    database: '',
    username: '',
    password: '',
    trust_server_certificate: true,
    encrypt: true,
    label: '',
    include_null_analysis: true,
    null_analysis_sample_limit: 30,
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setTestState({ status: 'idle' })
  }

  const connectionPayload = () => ({
    connection: {
      server: form.server,
      port: form.port,
      database: form.database,
      username: form.username,
      password: form.password,
      trust_server_certificate: form.trust_server_certificate,
      encrypt: form.encrypt,
    },
    include_null_analysis: form.include_null_analysis,
    null_analysis_sample_limit: form.null_analysis_sample_limit,
  })

  const handleTestConnection = async () => {
    setTestState({ status: 'testing' })
    try {
      const { data } = await api.testConnection(connectionPayload())
      setTestState(data.success
        ? { status: 'ok',   message: data.message }
        : { status: 'fail', message: data.message })
    } catch (err) {
      setTestState({ status: 'fail', message: getApiErrorMessage(err) })
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      const { data } = await api.triggerAssessment({
        ...connectionPayload(),
        label: form.label.trim() || undefined,
      })
      navigate(`/jobs/${data.job_id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New Assessment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect to a SQL Server instance and run a comprehensive schema analysis.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Connection card */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
            <Server className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-800">Database Connection</h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Server */}
            <div className="sm:col-span-2">
              <label htmlFor="server" className="form-label">
                Server <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="server"
                  type="text"
                  required
                  className="form-input pl-10"
                  placeholder="SERVERNAME or SERVERNAME\INSTANCE"
                  value={form.server}
                  onChange={(e) => set('server', e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Database */}
            <div>
              <label htmlFor="database" className="form-label">
                Database <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="database"
                  type="text"
                  required
                  className="form-input pl-10"
                  placeholder="master"
                  value={form.database}
                  onChange={(e) => set('database', e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Port */}
            <div>
              <label htmlFor="port" className="form-label">Port</label>
              <input
                id="port"
                type="number"
                min={1}
                max={65535}
                className="form-input"
                value={form.port}
                onChange={(e) => set('port', parseInt(e.target.value, 10) || 1433)}
              />
            </div>

            {/* Username */}
            <div>
              <label htmlFor="username" className="form-label">
                Username <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="username"
                  type="text"
                  required
                  className="form-input pl-10"
                  placeholder="sa"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="form-label">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="form-input pl-10 pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Security toggles */}
          <div className="px-6 pt-1 flex flex-col sm:flex-row gap-5">
            <Toggle
              checked={form.encrypt}
              onChange={(v) => set('encrypt', v)}
              label="Encrypt Connection"
              description="Enforce TLS encryption"
            />
            <Toggle
              checked={form.trust_server_certificate}
              onChange={(v) => set('trust_server_certificate', v)}
              label="Trust Server Certificate"
              description="Accept self-signed certs"
            />
          </div>

          {/* Test Connection */}
          <div className="px-6 pb-6 pt-4 border-t border-slate-100 mt-4 space-y-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={testState.status === 'testing'}
              leftIcon={<Wifi className="h-4 w-4" />}
              onClick={handleTestConnection}
              disabled={!form.server || !form.database || !form.username || !form.password || testState.status === 'testing'}
            >
              {testState.status === 'testing' ? 'Testing connection…' : 'Test Connection'}
            </Button>

            {testState.status === 'ok' && (
              <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                <span>{testState.message}</span>
              </div>
            )}
            {testState.status === 'fail' && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <WifiOff className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                <span>{testState.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Options card */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
            <Zap className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-800">Assessment Options</h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Label */}
            <div className="sm:col-span-2">
              <label htmlFor="label" className="form-label">Job Label</label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="label"
                  type="text"
                  className="form-input pl-10"
                  placeholder="e.g. Production DB Audit – Q2 2026"
                  value={form.label}
                  onChange={(e) => set('label', e.target.value)}
                  maxLength={120}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">Optional. Helps identify the job later.</p>
            </div>

            {/* Null analysis toggle */}
            <div className="sm:col-span-2">
              <Toggle
                checked={form.include_null_analysis}
                onChange={(v) => set('include_null_analysis', v)}
                label="Include Null & Blank Analysis"
                description="Samples tables and calculates NULL / empty-string percentages per column"
              />
            </div>

            {/* Sample limit */}
            {form.include_null_analysis && (
              <div>
                <label htmlFor="sample_limit" className="form-label">
                  <ShieldCheck className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                  Sample Table Limit
                </label>
                <input
                  id="sample_limit"
                  type="number"
                  min={1}
                  max={1000}
                  className="form-input"
                  value={form.null_analysis_sample_limit}
                  onChange={(e) =>
                    set('null_analysis_sample_limit', Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 30)))
                  }
                />
                <p className="mt-1 text-xs text-slate-400">Max tables to sample (1–1000). Default: 30.</p>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          rightIcon={<ArrowRight className="h-4 w-4" />}
          className="w-full justify-center"
        >
          {isSubmitting ? 'Starting assessment…' : 'Run Assessment'}
        </Button>
      </form>
    </div>
  )
}
