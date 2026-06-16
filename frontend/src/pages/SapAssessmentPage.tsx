import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Server, User, Lock, Eye, EyeOff, ArrowRight,
  ChevronRight, Tag, Zap, AlertCircle, CheckCircle2,
  Wifi, Globe, Network, Database, Hash,
  RefreshCw,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type {
  SapVariant,
  SapAssessmentRequest,
  SapRfcParams,
  SapHanaParams,
  SapPiPoParams,
  SapSuccessFactorsParams,
  SapODataParams,
} from '../types/api'
import { SAP_VARIANTS } from '../types/api'
import Button from '../components/ui/Button'
import { SapLogo } from '../components/ui/SourceLogos'
import Spinner from '../components/ui/Spinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

const RFC_VARIANTS: SapVariant[] = ['ecc', 's4hana', 'bw', 'crm', 'srm', 'scm', 'mdg']

function isRfcVariant(v: SapVariant): v is typeof RFC_VARIANTS[number] {
  return RFC_VARIANTS.includes(v)
}

function protocolBadge(protocol: string) {
  const map: Record<string, { bg: string; text: string }> = {
    rfc:   { bg: 'bg-tide-50 border-tide-200 text-tide-700',   text: 'RFC' },
    jdbc:  { bg: 'bg-amber-50 border-amber-200 text-amber-700', text: 'JDBC' },
    rest:  { bg: 'bg-grove-50 border-grove-200 text-grove-700', text: 'REST' },
    odata: { bg: 'bg-ember-50 border-ember-200 text-ember-700', text: 'OData' },
  }
  const style = map[protocol] ?? { bg: 'bg-slate-100 border-slate-200 text-slate-600', text: protocol.toUpperCase() }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-bold tracking-wide ${style.bg}`}>
      {style.text}
    </span>
  )
}

// ── Sub-forms per connectivity type ──────────────────────────────────────────

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({
  icon: Icon,
  placeholder,
  value,
  onChange,
  type = 'text',
  mono = false,
}: {
  icon?: React.ElementType
  placeholder?: string
  value: string
  onChange: (v: string) => void
  type?: string
  mono?: boolean
}) {
  return (
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />}
      <input
        type={type}
        className={`form-input ${Icon ? 'pl-10' : ''} ${mono ? 'font-mono text-sm' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        type={show ? 'text' : 'password'}
        className="form-input pl-10 pr-10"
        placeholder="••••••••"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="current-password"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// RFC form — shared by ECC, BW, CRM, SRM, SCM, MDG, and base params for S/4HANA
function RfcForm({ params, onChange }: { params: SapRfcParams; onChange: (p: SapRfcParams) => void }) {
  const set = (patch: Partial<SapRfcParams>) => onChange({ ...params, ...patch })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <FormField label="Application Server Host" required>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput icon={Server} placeholder="sap-prod.corp.local" value={params.host} onChange={(v) => set({ host: v })} />
            </div>
            <div className="w-28">
              <TextInput placeholder="System Nr" value={params.sysnr} onChange={(v) => set({ sysnr: v })} mono />
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">System Number is the 2-digit instance number (e.g. 00, 01).</p>
        </FormField>
      </div>

      <FormField label="Client" required>
        <TextInput icon={Hash} placeholder="100" value={params.client} onChange={(v) => set({ client: v })} mono />
      </FormField>

      <FormField label="Username" required>
        <TextInput icon={User} placeholder="BASIS_USER" value={params.username} onChange={(v) => set({ username: v })} />
      </FormField>

      <div className="sm:col-span-2">
        <FormField label="Password" required>
          <PasswordField value={params.password} onChange={(v) => set({ password: v })} />
        </FormField>
      </div>
    </div>
  )
}

// S/4HANA: RFC + optional OData base URL
function S4HanaForm({
  rfc, odata, onRfc, onOdata,
}: {
  rfc: SapRfcParams
  odata: SapODataParams
  onRfc: (p: SapRfcParams) => void
  onOdata: (p: SapODataParams) => void
}) {
  return (
    <div className="space-y-5">
      <RfcForm params={rfc} onChange={onRfc} />
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">OData / REST (optional)</p>
        <FormField label="OData API Base URL">
          <TextInput
            icon={Globe}
            placeholder="https://s4hana.corp.local:44300/sap/opu/odata"
            value={odata.api_base_url}
            onChange={(v) => onOdata({ api_base_url: v })}
            mono
          />
        </FormField>
        <p className="mt-1 text-xs text-slate-400">Leave blank to skip OData-based dimensions (Fiori apps, activated business functions).</p>
      </div>
    </div>
  )
}

// HANA: JDBC parameters
function HanaForm({ params, onChange }: { params: SapHanaParams; onChange: (p: SapHanaParams) => void }) {
  const set = (patch: Partial<SapHanaParams>) => onChange({ ...params, ...patch })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <FormField label="HANA Host" required>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput icon={Server} placeholder="hana-host.corp.local" value={params.host} onChange={(v) => set({ host: v })} />
            </div>
            <div className="w-28">
              <input
                type="number"
                className="form-input font-mono text-sm"
                min={1} max={65535}
                value={params.port}
                onChange={(e) => set({ port: parseInt(e.target.value, 10) || 30015 })}
                title="Port"
              />
            </div>
          </div>
        </FormField>
      </div>

      <FormField label="Instance Number" required>
        <TextInput icon={Hash} placeholder="00" value={params.instance_number} onChange={(v) => set({ instance_number: v })} mono />
      </FormField>

      <FormField label="Default Schema" required>
        <TextInput icon={Database} placeholder="SYSTEM" value={params.schema} onChange={(v) => set({ schema: v })} />
      </FormField>

      <FormField label="Username" required>
        <TextInput icon={User} placeholder="SYSTEM" value={params.username} onChange={(v) => set({ username: v })} />
      </FormField>

      <FormField label="Password" required>
        <PasswordField value={params.password} onChange={(v) => set({ password: v })} />
      </FormField>
    </div>
  )
}

// PI/PO: REST parameters
function PiPoForm({ params, onChange }: { params: SapPiPoParams; onChange: (p: SapPiPoParams) => void }) {
  const set = (patch: Partial<SapPiPoParams>) => onChange({ ...params, ...patch })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <FormField label="PI/PO Host" required>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput icon={Server} placeholder="pihost.corp.local" value={params.host} onChange={(v) => set({ host: v })} />
            </div>
            <div className="w-28">
              <input
                type="number"
                className="form-input font-mono text-sm"
                min={1} max={65535}
                value={params.port}
                onChange={(e) => set({ port: parseInt(e.target.value, 10) || 50000 })}
                title="Port"
              />
            </div>
          </div>
        </FormField>
      </div>

      <FormField label="Username" required>
        <TextInput icon={User} placeholder="piuser" value={params.username} onChange={(v) => set({ username: v })} />
      </FormField>

      <FormField label="Password" required>
        <PasswordField value={params.password} onChange={(v) => set({ password: v })} />
      </FormField>

      <div className="sm:col-span-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={params.use_https}
            onClick={() => set({ use_https: !params.use_https })}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent
              transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-earth-600/40
              ${params.use_https ? 'bg-earth-600' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform
              ${params.use_https ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm font-medium text-slate-700">Use HTTPS</span>
        </label>
      </div>
    </div>
  )
}

// SuccessFactors: OData/OAuth2
function SuccessFactorsForm({
  params,
  onChange,
}: {
  params: SapSuccessFactorsParams
  onChange: (p: SapSuccessFactorsParams) => void
}) {
  const set = (patch: Partial<SapSuccessFactorsParams>) => onChange({ ...params, ...patch })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <FormField label="API URL" required>
          <TextInput
            icon={Globe}
            placeholder="https://api.successfactors.com"
            value={params.api_url}
            onChange={(v) => set({ api_url: v })}
            mono
          />
        </FormField>
      </div>

      <FormField label="Company ID" required>
        <TextInput icon={Hash} placeholder="ACME_CORP" value={params.company_id} onChange={(v) => set({ company_id: v })} />
      </FormField>

      <FormField label="User ID" required>
        <TextInput icon={User} placeholder="admin@acme.com" value={params.user_id} onChange={(v) => set({ user_id: v })} />
      </FormField>

      <FormField label="OAuth2 Client ID" required>
        <TextInput icon={Network} placeholder="client-id" value={params.client_id} onChange={(v) => set({ client_id: v })} mono />
      </FormField>

      <FormField label="OAuth2 Client Secret" required>
        <PasswordField value={params.client_secret} onChange={(v) => set({ client_secret: v })} />
      </FormField>
    </div>
  )
}

// ── Variant selector grid ─────────────────────────────────────────────────────

function VariantGrid({
  selected,
  onSelect,
}: {
  selected: SapVariant | null
  onSelect: (v: SapVariant) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {SAP_VARIANTS.map((meta) => {
        const isSelected = selected === meta.value
        return (
          <button
            key={meta.value}
            type="button"
            onClick={() => onSelect(meta.value)}
            className={`relative flex flex-col items-start gap-1.5 rounded-xl border-2 px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-earth-600/40 ${
              isSelected
                ? 'border-earth-600 bg-earth-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {isSelected && (
              <CheckCircle2
                className="absolute top-2 right-2 h-3.5 w-3.5 text-earth-600"
                aria-hidden="true"
              />
            )}
            <span className={`text-xs font-bold tracking-tight ${isSelected ? 'text-earth-800' : 'text-slate-800'}`}>
              {meta.shortLabel}
            </span>
            {protocolBadge(meta.protocol)}
            <span className={`text-[10px] leading-snug ${isSelected ? 'text-earth-700' : 'text-slate-400'}`}>
              {meta.description.split('—')[0].trim()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Default param factories ───────────────────────────────────────────────────

const defaultRfc = (): SapRfcParams => ({ host: '', sysnr: '00', client: '100', username: '', password: '' })
const defaultOdata = (): SapODataParams => ({ api_base_url: '' })
const defaultHana = (): SapHanaParams => ({ host: '', port: 30015, instance_number: '00', schema: 'SYSTEM', username: '', password: '' })
const defaultPiPo = (): SapPiPoParams => ({ host: '', port: 50000, username: '', password: '', use_https: true })
const defaultSf = (): SapSuccessFactorsParams => ({ api_url: '', company_id: '', client_id: '', client_secret: '', user_id: '' })

// ── Validation ────────────────────────────────────────────────────────────────

function validateRequest(req: SapAssessmentRequest): string | null {
  const v = req.variant
  if (v === 'hana') {
    const p = req.hana!
    if (!p.host) return 'HANA host is required.'
    if (!p.username) return 'HANA username is required.'
    if (!p.password) return 'HANA password is required.'
    if (!p.instance_number) return 'HANA instance number is required.'
    if (!p.schema) return 'HANA default schema is required.'
  } else if (v === 'pi_po') {
    const p = req.pi_po!
    if (!p.host) return 'PI/PO host is required.'
    if (!p.username) return 'PI/PO username is required.'
    if (!p.password) return 'PI/PO password is required.'
  } else if (v === 'successfactors') {
    const p = req.successfactors!
    if (!p.api_url) return 'SuccessFactors API URL is required.'
    if (!p.company_id) return 'Company ID is required.'
    if (!p.client_id) return 'OAuth2 Client ID is required.'
    if (!p.client_secret) return 'OAuth2 Client Secret is required.'
    if (!p.user_id) return 'User ID is required.'
  } else {
    const p = req.rfc!
    if (!p.host) return 'SAP application server host is required.'
    if (!p.client) return 'SAP client number is required.'
    if (!p.username) return 'SAP username is required.'
    if (!p.password) return 'SAP password is required.'
  }
  return null
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SapAssessmentPage() {
  const navigate = useNavigate()

  const [step, setStep] = useState<'select' | 'configure'>('select')
  const [variant, setVariant] = useState<SapVariant | null>(null)
  const [label, setLabel] = useState('')

  // Connection params — all initialized, only the relevant one is used
  const [rfc, setRfc] = useState<SapRfcParams>(defaultRfc)
  const [odata, setOdata] = useState<SapODataParams>(defaultOdata)
  const [hana, setHana] = useState<SapHanaParams>(defaultHana)
  const [piPo, setPiPo] = useState<SapPiPoParams>(defaultPiPo)
  const [sf, setSf] = useState<SapSuccessFactorsParams>(defaultSf)

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectVariant = (v: SapVariant) => {
    setVariant(v)
    setTestStatus('idle')
    setTestMessage(null)
    setError(null)
  }

  const buildRequest = useCallback((): SapAssessmentRequest => {
    const req: SapAssessmentRequest = { variant: variant!, label: label.trim() || undefined }
    if (variant === 'hana') req.hana = hana
    else if (variant === 'pi_po') req.pi_po = piPo
    else if (variant === 'successfactors') req.successfactors = sf
    else {
      req.rfc = rfc
      if (variant === 's4hana' && odata.api_base_url) req.odata = odata
    }
    return req
  }, [variant, label, rfc, odata, hana, piPo, sf])

  const handleTestConnection = async () => {
    if (!variant) return
    const req = buildRequest()
    const validationError = validateRequest(req)
    if (validationError) { setError(validationError); return }
    setError(null)
    setTestStatus('testing')
    setTestMessage(null)
    try {
      const { data } = await api.sapTestConnection(req)
      setTestStatus(data.success ? 'ok' : 'error')
      setTestMessage(data.message)
    } catch (err) {
      setTestStatus('error')
      setTestMessage(getApiErrorMessage(err))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!variant) return
    const req = buildRequest()
    const validationError = validateRequest(req)
    if (validationError) { setError(validationError); return }
    setError(null)
    setIsSubmitting(true)
    try {
      const { data } = await api.sapStartAssessment(req)
      navigate(`/sap/sessions/${data.job_id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedMeta = SAP_VARIANTS.find((m) => m.value === variant)

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: '#F8FAFF', border: '1px solid #C5D5EC', boxShadow: '0 2px 8px rgba(0,155,215,0.12)' }}>
            <SapLogo size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-display">SAP Assessment</h1>
            <p className="mt-1 text-sm text-slate-500">
              Connect to any SAP system variant and run a comprehensive readiness assessment.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Step 1 — Select variant */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <div
                className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                style={{ background: 'linear-gradient(135deg, #166534 0%, #16A34A 100%)' }}
              >
                1
              </div>
              <span className="text-sm font-semibold text-slate-700">Select SAP System Type</span>
            </div>
            {variant && step === 'configure' && (
              <button
                type="button"
                onClick={() => setStep('select')}
                className="text-xs text-earth-700 font-medium hover:text-earth-800 transition-colors"
              >
                Change
              </button>
            )}
          </div>

          <div className="p-5">
            {step === 'select' || !variant ? (
              <>
                <VariantGrid selected={variant} onSelect={handleSelectVariant} />
                {variant && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      size="md"
                      rightIcon={<ChevronRight className="h-4 w-4" />}
                      onClick={() => setStep('configure')}
                    >
                      Configure connection
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(123,94,0,0.08), rgba(196,154,15,0.12))', border: '1px solid rgba(196,154,15,0.3)' }}
                >
                  <CheckCircle2 className="h-4 w-4" style={{ color: '#16A34A' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{selectedMeta?.label}</p>
                  <p className="text-xs text-slate-400">{selectedMeta?.description.split('—')[1]?.trim()}</p>
                </div>
                {selectedMeta && protocolBadge(selectedMeta.protocol)}
              </div>
            )}
          </div>
        </div>

        {/* Step 2 — Configure connection */}
        {step === 'configure' && variant && (
          <>
            {/* Session label */}
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                <Zap className="h-4 w-4 text-earth-600" />
                <span className="text-sm font-semibold text-slate-700">Session Details</span>
              </div>
              <div className="p-5">
                <label className="form-label">Label</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    className="form-input pl-10"
                    placeholder="e.g. Client A — SAP ECC Production Assessment"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
            </div>

            {/* Connection parameters */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ background: 'linear-gradient(135deg, #166534 0%, #16A34A 100%)' }}
                  >
                    2
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Connection Parameters</span>
                </div>
                {selectedMeta && protocolBadge(selectedMeta.protocol)}
              </div>

              <div className="p-5">
                {variant === 'hana' && <HanaForm params={hana} onChange={setHana} />}
                {variant === 'pi_po' && <PiPoForm params={piPo} onChange={setPiPo} />}
                {variant === 'successfactors' && <SuccessFactorsForm params={sf} onChange={setSf} />}
                {variant === 's4hana' && (
                  <S4HanaForm rfc={rfc} odata={odata} onRfc={setRfc} onOdata={setOdata} />
                )}
                {isRfcVariant(variant) && variant !== 's4hana' && (
                  <RfcForm params={rfc} onChange={setRfc} />
                )}
              </div>
            </div>

            {/* Assessment scope info */}
            <AssessmentScopeInfo variant={variant} />

            {/* Test connection */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-colors"
              >
                {testStatus === 'testing'
                  ? <><Spinner size="sm" className="text-earth-600" /> Testing…</>
                  : <><Wifi className="h-4 w-4" /> Test Connection</>}
              </button>

              {testStatus === 'ok' && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium animate-scale-in">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {testMessage}
                </span>
              )}
              {testStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium animate-scale-in">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {testMessage}
                </span>
              )}
            </div>

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
              rightIcon={<ArrowRight className="h-4 w-4" />}
              className="w-full justify-center"
            >
              {isSubmitting ? 'Starting assessment…' : `Run ${selectedMeta?.label ?? 'SAP'} Assessment`}
            </Button>
          </>
        )}
      </form>
    </div>
  )
}

// ── Assessment scope info card ────────────────────────────────────────────────

const SCOPE_LINES: Record<SapVariant, string[]> = {
  ecc:            ['Custom Z-table vs standard table ratio', 'ABAP program inventory', 'Transport landscape', 'Data volume per module (FI, CO, MM, SD, HR, PP)'],
  s4hana:         ['Activated business functions', 'Fiori app count', 'Embedded HANA usage', 'BAdI and Enhancement Spot inventory', 'Migration object count'],
  bw:             ['InfoProvider inventory (InfoCubes, DSOs, InfoObjects)', 'Process Chain count and complexity', 'Transformation and DTP count', 'Delta extraction mechanism support', 'Query and workbook count'],
  hana:           ['Schema inventory', 'Row vs column store table split', 'Calculation, analytic, and attribute views', 'Stored procedures and SQLScript objects', 'Data volume per schema', 'Replication status'],
  crm:            ['Business Partner count', 'Interaction Center profile configuration', 'Campaign object inventory', 'Middleware replication queues', 'Custom object count'],
  srm:            ['Vendor master count', 'Shopping cart and PO volume', 'Catalog item inventory', 'Workflow configuration', 'Backend system connections'],
  scm:            ['liveCache status', 'Planning area inventory', 'Model and version structure', 'CIF connected system count', 'Data object counts'],
  pi_po:          ['Interface and iFlow inventory', 'Adapter types in use', 'Message monitoring statistics', 'Business system landscape', 'Error rate metrics'],
  mdg:            ['Governed entity types', 'Workflow rule count', 'Consolidation and governance model', 'Open change request volume', 'Consolidation rule count'],
  successfactors: ['Active module inventory', 'Employee count', 'MDF object inventory', 'Integration Center connections', 'Data replication status'],
}

const COMMON_SCOPE = [
  'Connectivity check and system info (SID, client, basis release, kernel)',
  'Object inventory (total, custom vs standard, deprecated)',
  'Data volume estimates for key objects',
  'User and authorization profile',
  'Performance indicators (response time, background jobs, work process utilization)',
  'Extraction readiness (RFC, ODP, SLT, JDBC — delta-enabled objects, extractors)',
]

function AssessmentScopeInfo({ variant }: { variant: SapVariant }) {
  const [expanded, setExpanded] = useState(false)
  const lines = SCOPE_LINES[variant] ?? []

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Assessment scope</span>
        </div>
        <span className="text-xs text-slate-400">{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 animate-slide-down">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Common (all SAP variants)</p>
            <ul className="space-y-1">
              {COMMON_SCOPE.map((l) => (
                <li key={l} className="flex items-start gap-2 text-xs text-slate-500">
                  <CheckCircle2 className="h-3 w-3 text-slate-300 shrink-0 mt-0.5" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
          {lines.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Variant-specific</p>
              <ul className="space-y-1">
                {lines.map((l) => (
                  <li key={l} className="flex items-start gap-2 text-xs text-slate-600">
                    <CheckCircle2 className="h-3 w-3 text-earth-400 shrink-0 mt-0.5" />
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
