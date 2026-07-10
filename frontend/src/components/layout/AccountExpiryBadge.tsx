import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Send, X, ChevronRight, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

// ── Urgency tiers ─────────────────────────────────────────────────────────────
//
// calm    → > 14 days : teal brand, unobtrusive
// warn    → 8–14 days : amber, present but not alarming
// urgent  → 1–7 days  : red, demands attention
// expired → 0 days    : hard red

type Tier = 'calm' | 'warn' | 'urgent' | 'expired'

function getTier(days: number | null | undefined): Tier {
  if (days === null || days === undefined) return 'calm'
  if (days <= 0)   return 'expired'
  if (days <= 7)   return 'urgent'
  if (days <= 14)  return 'warn'
  return 'calm'
}

const TIER_STYLES: Record<Tier, {
  pill: { background: string; border: string; color: string; shadow: string }
  icon: string
  label: string
  dot: string
}> = {
  calm: {
    pill: {
      background: 'rgba(147,204,198,0.10)',
      border: 'rgba(108,189,181,0.35)',
      color: '#25706A',
      shadow: '0 0 0 3px rgba(108,189,181,0.08)',
    },
    icon: '#6CBDB5',
    label: '#25706A',
    dot: '#6CBDB5',
  },
  warn: {
    pill: {
      background: 'rgba(251,191,36,0.09)',
      border: 'rgba(245,158,11,0.35)',
      color: '#92400E',
      shadow: '0 0 0 3px rgba(245,158,11,0.08)',
    },
    icon: '#D97706',
    label: '#92400E',
    dot: '#F59E0B',
  },
  urgent: {
    pill: {
      background: 'rgba(239,68,68,0.08)',
      border: 'rgba(220,38,38,0.30)',
      color: '#991B1B',
      shadow: '0 0 0 3px rgba(220,38,38,0.08)',
    },
    icon: '#DC2626',
    label: '#991B1B',
    dot: '#EF4444',
  },
  expired: {
    pill: {
      background: 'rgba(239,68,68,0.10)',
      border: 'rgba(185,28,28,0.35)',
      color: '#7F1D1D',
      shadow: '0 0 0 3px rgba(185,28,28,0.10)',
    },
    icon: '#B91C1C',
    label: '#7F1D1D',
    dot: '#DC2626',
  },
}

// ── Sub-component: animated pulsing dot for urgent/expired ────────────────────

function UrgencyDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full h-2 w-2"
        style={{ backgroundColor: color }}
      />
    </span>
  )
}

// ── Extension request flyout ──────────────────────────────────────────────────

interface FlyoutProps {
  email: string
  daysRemaining: number | null | undefined
  onClose: () => void
}

function ExtensionFlyout({ email, daysRemaining, onClose }: FlyoutProps) {
  const [days, setDays]         = useState(30)
  const [status, setStatus]     = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus the input when flyout opens
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (days < 1 || days > 3650) return
    setStatus('sending')
    try {
      await api.requestExtension({ email, requested_days: days })
      setStatus('sent')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed. Please try again.'
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
      className="absolute right-0 top-full mt-2 w-[320px] rounded-2xl overflow-hidden z-50"
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(108,189,181,0.30)',
        boxShadow: '0 8px 32px rgba(108,189,181,0.14), 0 2px 12px rgba(0,0,0,0.07)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Request retention extension"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 border-b"
        style={{
          borderColor: 'rgba(108,189,181,0.20)',
          background: 'linear-gradient(135deg, rgba(147,204,198,0.10) 0%, rgba(108,189,181,0.05) 100%)',
        }}
      >
        <CalendarClock className="h-4 w-4 shrink-0" style={{ color: '#6CBDB5' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-tight" style={{ color: '#0F766E' }}>
            Request Retention Extension
          </p>
          {daysRemaining !== null && daysRemaining !== undefined && daysRemaining > 0 && (
            <p className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining on your account
            </p>
          )}
          {(daysRemaining === 0 || daysRemaining === null || daysRemaining === undefined) && (
            <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
              Account access has expired
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded-lg transition-colors"
          style={{ color: '#94A3B8' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#0F766E'; e.currentTarget.style.backgroundColor = 'rgba(108,189,181,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '' }}
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        <AnimatePresence mode="wait">
          {status === 'sent' ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
              className="flex flex-col items-center gap-3 py-4 text-center"
            >
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.22)' }}
              >
                <CheckCircle2 className="h-5 w-5" style={{ color: '#059669' }} />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: '#1E293B' }}>
                  Request sent
                </p>
                <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: '#64748B' }}>
                  An extension request for <strong>{days} days</strong> has been sent to your administrator.
                  You will be notified by email once it is reviewed.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-1 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: '#6CBDB5' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(108,189,181,0.10)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '' }}
              >
                Close
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-4"
            >
              {/* Description */}
              <p className="text-[12px] leading-relaxed" style={{ color: '#64748B' }}>
                Enter how many additional days of access you need. Your administrator
                will receive this request and can approve or adjust it.
              </p>

              {/* Days input */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="retention-days"
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: '#94A3B8' }}
                >
                  Requested days
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="retention-days"
                    type="number"
                    min={1}
                    max={3650}
                    value={days}
                    onChange={e => setDays(Math.max(1, Math.min(3650, Number(e.target.value))))}
                    className="w-full rounded-xl border px-3.5 py-2.5 text-[14px] font-semibold pr-12 outline-none transition-all"
                    style={{
                      borderColor: 'rgba(108,189,181,0.40)',
                      color: '#0D1117',
                      background: 'rgba(240,250,249,0.40)',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#6CBDB5'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,189,181,0.15)'
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'rgba(108,189,181,0.40)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium"
                    style={{ color: '#94A3B8' }}
                  >
                    days
                  </span>
                </div>

                {/* Quick presets */}
                <div className="flex gap-1.5 mt-0.5">
                  {[7, 30, 60, 90].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDays(preset)}
                      className="flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all"
                      style={{
                        background: days === preset ? 'rgba(108,189,181,0.14)' : 'rgba(148,163,184,0.08)',
                        color: days === preset ? '#25706A' : '#64748B',
                        border: `1px solid ${days === preset ? 'rgba(108,189,181,0.35)' : 'rgba(148,163,184,0.18)'}`,
                      }}
                    >
                      {preset}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {status === 'error' && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                  style={{
                    background: 'rgba(239,68,68,0.07)',
                    border: '1px solid rgba(220,38,38,0.22)',
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
                  <p className="text-[11.5px]" style={{ color: '#991B1B' }}>{errorMsg}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={status === 'sending' || days < 1}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #6CBDB5 0%, #4DA8A0 100%)',
                  color: '#FFFFFF',
                  boxShadow: '0 2px 8px rgba(108,189,181,0.30), 0 1px 2px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={e => {
                  if (status !== 'sending') {
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(108,189,181,0.40), 0 1px 3px rgba(0,0,0,0.08)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(108,189,181,0.30), 0 1px 2px rgba(0,0,0,0.06)'
                  e.currentTarget.style.transform = ''
                }}
                onMouseDown={e => { e.currentTarget.style.transform = 'translateY(0.5px)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
              >
                {status === 'sending' ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Sending request...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send to administrator
                  </>
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AccountExpiryBadge() {
  const { user } = useAuth()
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const days  = user?.days_remaining ?? null
  const email = user?.email ?? ''
  const tier  = getTier(days)
  const s     = TIER_STYLES[tier]

  // Don't render if no expiry is set on this account
  if (!user?.expires_at) return null

  // Click-outside to close flyout
  useEffect(() => {
    if (!flyoutOpen) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFlyoutOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [flyoutOpen])

  const pillLabel =
    days === null           ? 'Account expiry'
    : days === 0            ? 'Expired'
    : days === 1            ? '1 day left'
    : `${days} days left`

  return (
    <div ref={containerRef} className="relative">
      {/* Expiry pill button */}
      <motion.button
        onClick={() => setFlyoutOpen(v => !v)}
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
        style={{
          background: s.pill.background,
          borderColor: s.pill.border,
          color: s.pill.color,
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        aria-label={`Account expiry: ${pillLabel}. Click to request extension.`}
        aria-expanded={flyoutOpen}
      >
        {/* Dot for urgent/expired; static icon for calm/warn */}
        {(tier === 'urgent' || tier === 'expired') ? (
          <UrgencyDot color={s.dot} />
        ) : (
          <Clock className="h-3 w-3 shrink-0" style={{ color: s.icon }} />
        )}

        <span className="text-[10.5px] font-semibold tracking-wide tabular-nums">
          {pillLabel}
        </span>

        <ChevronRight
          className="h-2.5 w-2.5 shrink-0 transition-transform"
          style={{
            color: s.icon,
            transform: flyoutOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />
      </motion.button>

      {/* Mobile compact icon-only button */}
      <button
        onClick={() => setFlyoutOpen(v => !v)}
        className="md:hidden relative p-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-400/50"
        style={{ color: s.icon }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = s.pill.background }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '' }}
        aria-label={`Account expiry: ${pillLabel}`}
        aria-expanded={flyoutOpen}
      >
        <Clock className="h-4 w-4" />
        {(tier === 'urgent' || tier === 'expired') && (
          <span
            className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: s.dot }}
          />
        )}
      </button>

      {/* Flyout panel */}
      <AnimatePresence>
        {flyoutOpen && (
          <ExtensionFlyout
            email={email}
            daysRemaining={days}
            onClose={() => setFlyoutOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
