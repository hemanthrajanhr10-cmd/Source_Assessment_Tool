import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, User, Lock, Eye, EyeOff, Tag, Zap,
  CheckCircle2, AlertCircle, Wifi, ArrowRight,
  Shield, Globe, Key, ChevronDown, ChevronUp, Settings2,
  FileText, BarChart3, Hash,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { SageIntacctAssessmentRequest } from '../types/api'
import Spinner from '../components/ui/Spinner'
import { SageIntacctLogo } from '../components/ui/SourceLogos'

// ── Nature Green Teal design tokens ──────────────────────────────────────────

const SAGE = {
  primary:    '#4DA8A0',
  mid:        '#6CBDB5',
  accent:     '#93CCC6',
  light50:    '#F0FAF9',
  light100:   '#CCEFEC',
  light200:   '#A8E2DD',
  glow:       'rgba(77,168,160,0.15)',
  shadowCard: '0 2px 4px rgba(77,168,160,0.04), 0 8px 24px rgba(77,168,160,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowHover:'0 4px 8px rgba(77,168,160,0.06), 0 16px 40px rgba(77,168,160,0.10), 0 2px 4px rgba(0,0,0,0.04)',
  shadowBtn:  '0 2px 8px rgba(77,168,160,0.30), inset 0 1px 0 rgba(255,255,255,0.16)',
}

// ── Component helpers ─────────────────────────────────────────────────────────

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">
      {children}
      {required && <span className="text-red-400 ml-1">*</span>}
    </label>
  )
}

function InputField({
  icon: Icon,
  placeholder,
  value,
  onChange,
  type = 'text',
  mono = false,
  disabled = false,
  rightAction,
}: {
  icon?: React.ElementType
  placeholder?: string
  value: string
  onChange: (v: string) => void
  type?: string
  mono?: boolean
  disabled?: boolean
  rightAction?: React.ReactNode
}) {
  return (
    <div className="relative group">
      {Icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <Icon
            className="h-4 w-4 transition-colors duration-150"
            style={{ color: '#94A3B8' }}
          />
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={[
          'w-full rounded-xl border border-slate-200 bg-white',
          'text-sm text-slate-800 placeholder-slate-400',
          'py-2.5 transition-all duration-200 outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          Icon ? 'pl-10' : 'pl-3.5',
          rightAction ? 'pr-10' : 'pr-3.5',
          mono ? 'font-mono' : '',
        ].join(' ')}
        style={{
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = SAGE.mid
          e.currentTarget.style.boxShadow = `0 0 0 3px ${SAGE.glow}, 0 1px 2px rgba(0,0,0,0.04)`
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = ''
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
        }}
      />
      {rightAction && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightAction}</div>
      )}
    </div>
  )
}

function PasswordField({
  icon: Icon,
  placeholder,
  value,
  onChange,
  disabled = false,
}: {
  icon?: React.ElementType
  placeholder?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <InputField
      icon={Icon}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      type={show ? 'text' : 'password'}
      disabled={disabled}
      rightAction={
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="p-0.5 rounded text-slate-400 transition-colors"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = SAGE.primary }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '' }}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      }
    />
  )
}

function SectionCard({
  title,
  icon: Icon,
  badge,
  children,
  accent = SAGE.primary,
}: {
  title: string
  icon: React.ElementType
  badge?: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden"
      style={{
        boxShadow: SAGE.shadowCard,
        transition: 'box-shadow 240ms ease, transform 240ms cubic-bezier(0.34,1.56,0.64,1)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = SAGE.shadowHover
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = SAGE.shadowCard
        el.style.transform = 'translateY(0)'
      }}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
        style={{ background: `linear-gradient(135deg, ${SAGE.light50} 0%, rgba(255,255,255,0) 100%)` }}
      >
        <div
          className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, ${SAGE.mid} 100%)`,
            boxShadow: `0 3px 8px ${SAGE.glow}`,
          }}
        >
          <Icon className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
        </div>
        {badge && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase"
            style={{
              background: SAGE.light100,
              color: SAGE.primary,
              border: `1px solid ${SAGE.light200}`,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Connection test status bar ────────────────────────────────────────────────

type TestState = 'idle' | 'testing' | 'success' | 'error'

function ConnectionTestBar({
  state,
  message,
  companyName,
  onTest,
  canTest,
}: {
  state: TestState
  message: string
  companyName?: string
  onTest: () => void
  canTest: boolean
}) {
  return (
    <div
      className="rounded-xl border px-4 py-3 flex items-center gap-3 transition-all duration-200"
      style={{
        background:
          state === 'success' ? SAGE.light50
          : state === 'error' ? '#FFF5F5'
          : '#F8FAFC',
        borderColor:
          state === 'success' ? SAGE.light200
          : state === 'error' ? '#FECACA'
          : '#E2E8F0',
      }}
    >
      <div className="shrink-0">
        {state === 'testing' && (
          <span
            className="h-4 w-4 inline-block rounded-full animate-spin"
            style={{ border: `2px solid ${SAGE.primary}`, borderTopColor: 'transparent' }}
          />
        )}
        {state === 'success' && <CheckCircle2 className="h-4 w-4" style={{ color: SAGE.accent }} />}
        {state === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
        {state === 'idle' && <Wifi className="h-4 w-4 text-slate-400" />}
      </div>
      <div className="flex-1 min-w-0">
        {state === 'success' && companyName ? (
          <p className="text-sm font-semibold" style={{ color: SAGE.primary }}>
            {companyName}
          </p>
        ) : (
          <p className={`text-sm ${state === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
            {message || 'Test your credentials before starting the assessment'}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onTest}
        disabled={!canTest || state === 'testing'}
        className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold
                   transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: canTest && state !== 'testing' ? SAGE.primary : '#E2E8F0',
          color: canTest && state !== 'testing' ? 'white' : '#94A3B8',
          boxShadow: canTest && state !== 'testing' ? SAGE.shadowBtn : 'none',
        }}
        onMouseEnter={(e) => {
          if (canTest && state !== 'testing') {
            (e.currentTarget as HTMLButtonElement).style.background = SAGE.mid
          }
        }}
        onMouseLeave={(e) => {
          if (canTest && state !== 'testing') {
            (e.currentTarget as HTMLButtonElement).style.background = SAGE.primary
          }
        }}
      >
        {state === 'testing' ? (
          <><Spinner className="h-3 w-3" /> Testing…</>
        ) : (
          <><Wifi className="h-3 w-3" /> Test</>
        )}
      </button>
    </div>
  )
}

// ── Option toggle ─────────────────────────────────────────────────────────────

function OptionToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-150"
      style={{
        background: checked ? SAGE.light50 : 'white',
        borderColor: checked ? SAGE.light200 : '#E2E8F0',
        boxShadow: checked ? `0 0 0 1px ${SAGE.light200}` : 'none',
      }}
    >
      <div
        className="mt-0.5 h-4 w-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-150"
        style={{
          background: checked ? SAGE.primary : 'white',
          borderColor: checked ? SAGE.primary : '#CBD5E1',
        }}
      >
        {checked && (
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8">
            <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M1 4l3 3 5-6" />
          </svg>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </button>
  )
}

// ── Assessment steps preview ──────────────────────────────────────────────────

const ASSESSMENT_STEPS = [
  { label: 'Company & entity profile', icon: Building2 },
  { label: 'Users, roles & permissions', icon: User },
  { label: 'Chart of accounts (full COA)', icon: BarChart3 },
  { label: 'Financial dimensions (depts, locations, classes)', icon: Globe },
  { label: 'AR invoices & aging', icon: FileText },
  { label: 'AP bills & payment terms', icon: FileText },
  { label: 'GL journal entry volumes', icon: Hash },
  { label: 'Purchase & sales orders', icon: Settings2 },
  { label: 'Contracts & expense reports', icon: FileText },
  { label: 'Cash management & bank accounts', icon: Building2 },
  { label: 'Fixed assets & depreciation', icon: Settings2 },
  { label: 'Custom dimensions & platform extensions', icon: Settings2 },
  { label: 'Smart rules, events & reports', icon: Zap },
  { label: 'Data quality & open-item scan', icon: Shield },
  { label: 'Excel report generation', icon: FileText },
  { label: 'Word document report generation', icon: FileText },
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SageIntacctAssessmentPage() {
  const navigate = useNavigate()

  // Credentials form state
  const [companyId, setCompanyId] = useState('')
  const [userId, setUserId] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [senderId, setSenderId] = useState('')
  const [senderPassword, setSenderPassword] = useState('')
  const [entityId, setEntityId] = useState('')
  const [label, setLabel] = useState('')

  // Options
  const [includeTransactions, setIncludeTransactions] = useState(true)
  const [includeCustom, setIncludeCustom] = useState(true)

  // UI state
  const [testState, setTestState] = useState<TestState>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showSteps, setShowSteps] = useState(false)

  // Page entrance animation
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(16px)'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 400ms cubic-bezier(0,0,0.2,1), transform 400ms cubic-bezier(0,0,0.2,1)'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
  }, [])

  const coreFieldsFilled =
    companyId.trim() && userId.trim() && userPassword.trim() &&
    senderId.trim() && senderPassword.trim()

  const buildRequest = useCallback((): SageIntacctAssessmentRequest => ({
    credentials: {
      company_id: companyId.trim(),
      user_id: userId.trim(),
      user_password: userPassword,
      sender_id: senderId.trim(),
      sender_password: senderPassword,
      entity_id: entityId.trim() || undefined,
    },
    label: label.trim() || undefined,
    include_transaction_details: includeTransactions,
    include_custom_objects: includeCustom,
  }), [companyId, userId, userPassword, senderId, senderPassword, entityId, label, includeTransactions, includeCustom])

  const handleTestConnection = useCallback(async () => {
    setTestState('testing')
    setTestMessage('Connecting to Sage Intacct Web Services…')
    try {
      const { data } = await api.sageTestConnection(buildRequest())
      if (data.success) {
        setTestState('success')
        setCompanyName(data.company_name || companyId)
        setTestMessage(data.message)
      } else {
        setTestState('error')
        setTestMessage(data.message)
      }
    } catch (err) {
      setTestState('error')
      setTestMessage(getApiErrorMessage(err))
    }
  }, [buildRequest, companyId])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data } = await api.sageStartAssessment(buildRequest())
      navigate(`/sage-intacct/sessions/${data.job_id}`)
    } catch (err) {
      setSubmitError(getApiErrorMessage(err))
      setSubmitting(false)
    }
  }, [buildRequest, navigate])

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto space-y-6">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div
          className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
          style={{
            background: '#F0FAF9',
            border: '1px solid #A8E2DD',
            boxShadow: `0 6px 20px ${SAGE.glow}`,
          }}
        >
          <SageIntacctLogo size={36} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sage Intacct Assessment</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cloud ERP — comprehensive financial data extraction via XML Web Services API
          </p>
        </div>
        <div className="ml-auto shrink-0">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: SAGE.light100,
              color: SAGE.primary,
              border: `1px solid ${SAGE.light200}`,
            }}
          >
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: SAGE.accent, boxShadow: `0 0 5px ${SAGE.accent}` }}
            />
            Cloud Source
          </span>
        </div>
      </div>

      {/* ── What gets assessed ───────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-slate-200/80 overflow-hidden"
        style={{ boxShadow: SAGE.shadowCard }}
      >
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          style={{
            background: `linear-gradient(135deg, ${SAGE.light50} 0%, rgba(255,255,255,0.5) 100%)`,
          }}
          onClick={() => setShowSteps(!showSteps)}
        >
          <div className="flex items-center gap-2.5">
            <Zap className="h-4 w-4" style={{ color: SAGE.primary }} />
            <span className="text-sm font-semibold text-slate-700">
              {ASSESSMENT_STEPS.length} assessment dimensions
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {showSteps ? 'Hide' : 'Show all'}
            </span>
            {showSteps ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </button>

        {showSteps && (
          <div className="px-5 pb-4 border-t border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
              {ASSESSMENT_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-2.5 py-1.5">
                  <div
                    className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: SAGE.light100 }}
                  >
                    <step.icon className="h-3 w-3" style={{ color: SAGE.primary }} />
                  </div>
                  <span className="text-xs text-slate-600">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Company credentials ──────────────────────────────────────── */}
      <SectionCard title="Company Login" icon={Building2} badge="Required">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FormLabel required>Company ID</FormLabel>
            <InputField
              icon={Building2}
              placeholder="e.g. ACMECORP"
              value={companyId}
              onChange={setCompanyId}
              mono
            />
          </div>
          <div>
            <FormLabel required>User ID</FormLabel>
            <InputField
              icon={User}
              placeholder="Your Sage Intacct login"
              value={userId}
              onChange={setUserId}
            />
          </div>
          <div className="sm:col-span-2">
            <FormLabel required>User Password</FormLabel>
            <PasswordField
              icon={Lock}
              placeholder="Your Sage Intacct password"
              value={userPassword}
              onChange={setUserPassword}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Sender credentials ───────────────────────────────────────── */}
      <SectionCard title="Web Services Credentials" icon={Key} badge="Required">
        <p className="text-xs text-slate-500 mb-4">
          Obtain these from your Sage Intacct Web Services subscription
          (Company &rsaquo; Web Services &rsaquo; Authorized senders).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FormLabel required>Sender ID</FormLabel>
            <InputField
              icon={Key}
              placeholder="Web Services Sender ID"
              value={senderId}
              onChange={setSenderId}
              mono
            />
          </div>
          <div>
            <FormLabel required>Sender Password</FormLabel>
            <PasswordField
              icon={Lock}
              placeholder="Sender password"
              value={senderPassword}
              onChange={setSenderPassword}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Advanced ─────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-slate-200/80 overflow-hidden"
        style={{ boxShadow: SAGE.shadowCard }}
      >
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, rgba(255,255,255,0.5) 100%)' }}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">Advanced options</span>
          </div>
          {showAdvanced ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showAdvanced && (
          <div className="px-5 pb-5 border-t border-slate-100 space-y-5 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Label</FormLabel>
                <InputField
                  icon={Tag}
                  placeholder="e.g. ACMECORP Prod Q2 2025"
                  value={label}
                  onChange={setLabel}
                />
              </div>
              <div>
                <FormLabel>Entity ID</FormLabel>
                <InputField
                  icon={Globe}
                  placeholder="Leave blank for top-level"
                  value={entityId}
                  onChange={setEntityId}
                  mono
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  For multi-entity companies: specify a sub-entity to scope the assessment.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <FormLabel>Assessment scope</FormLabel>
              <OptionToggle
                label="Include transaction volumes"
                description="Count AR invoices, AP bills, GL entries, purchase/sales orders, contracts and expense reports"
                checked={includeTransactions}
                onChange={setIncludeTransactions}
              />
              <OptionToggle
                label="Include custom objects"
                description="Enumerate platform extensions, custom dimensions, user-defined fields, smart rules and events"
                checked={includeCustom}
                onChange={setIncludeCustom}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Connection test ──────────────────────────────────────────── */}
      <ConnectionTestBar
        state={testState}
        message={testMessage}
        companyName={companyName}
        onTest={handleTestConnection}
        canTest={!!coreFieldsFilled}
      />

      {/* ── Error ────────────────────────────────────────────────────── */}
      {submitError && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      {/* ── Submit ───────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${SAGE.light50} 0%, white 100%)`,
          borderColor: SAGE.light200,
          boxShadow: SAGE.shadowCard,
        }}
      >
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Ready to assess</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Assessment runs in the background. You will see live progress on the next screen.
            </p>
          </div>
          <button
            type="button"
            disabled={!coreFieldsFilled || submitting}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                       text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: coreFieldsFilled
                ? `linear-gradient(135deg, ${SAGE.primary} 0%, ${SAGE.mid} 100%)`
                : '#94A3B8',
              boxShadow: coreFieldsFilled ? SAGE.shadowBtn : 'none',
              transform: 'translateY(0)',
              transition: 'transform 80ms cubic-bezier(0.4,0,0.2,1), box-shadow 80ms',
            }}
            onMouseEnter={(e) => {
              if (coreFieldsFilled && !submitting) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
                  `0 6px 20px ${SAGE.glow}, inset 0 1px 0 rgba(255,255,255,0.18)`
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = SAGE.shadowBtn
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)'
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
            }}
          >
            {submitting ? (
              <><Spinner className="h-4 w-4" /> Starting…</>
            ) : (
              <>Start Assessment <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </div>

    </div>
  )
}
