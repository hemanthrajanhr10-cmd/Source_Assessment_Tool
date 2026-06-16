import { useEffect, useRef, useState } from 'react'
import { useAssessmentProgress } from '../hooks/useAssessmentProgress'
import PhaseStepperBar from './PhaseStepperBar'
import LiveActivityFeed from './LiveActivityFeed'

interface AssessmentProgressProps {
  sessionId: string
  sessionLabel?: string
  onComplete?: () => void
}

const FONT = "'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif"

const KEYFRAMES = `
  @keyframes ping-status {
    0%   { transform: scale(0.9); opacity: 0.6; }
    100% { transform: scale(2.6); opacity: 0;   }
  }
  @keyframes pulse-status {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.55; }
  }
  @keyframes bar-shimmer {
    0%   { transform: translateX(-120%); }
    100% { transform: translateX(280%);  }
  }
  @keyframes card-breathe {
    0%,  100% { box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 0   rgba(22,163,74,0),    0 4px 16px rgba(22,163,74,0.04); }
    50%        { box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 3px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.10); }
  }
  @keyframes header-scan {
    0%   { transform: translateX(-100%); opacity: 0.6; }
    60%  { opacity: 0.9; }
    100% { transform: translateX(100%);  opacity: 0;   }
  }
  @keyframes pct-pop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.12); }
    100% { transform: scale(1); }
  }
`

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; border: string; color: string; dot: string; label: string }> = {
    queued:    { bg: '#F0FDF4', border: 'transparent',          color: '#404555', dot: '#86EFAC',  label: 'Queued'    },
    running:   { bg: 'rgba(22,163,74,0.07)', border: 'rgba(22,163,74,0.18)', color: '#166534', dot: '#16A34A', label: 'Running' },
    completed: { bg: 'rgba(5,150,105,0.07)', border: 'rgba(5,150,105,0.2)', color: '#059669', dot: '#10B981', label: 'Completed' },
    failed:    { bg: '#FFF1F2', border: '#FECDD3',              color: '#BE123C', dot: '#EF4444', label: 'Failed'    },
    cancelled: { bg: '#F8FAFC', border: 'transparent',          color: '#767A8C', dot: '#9CA3AF', label: 'Cancelled' },
  }
  const { bg, border, color, dot, label } = cfg[status] ?? cfg.queued
  const isRunning = status === 'running'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '3px 11px 3px 9px',
        borderRadius: 9999,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        fontFamily: FONT,
      }}
    >
      <span style={{ position: 'relative', width: 7, height: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isRunning && (
          <span
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              background: dot,
              opacity: 0,
              animation: 'ping-status 1.8s cubic-bezier(0,0,0.2,1) infinite',
            }}
          />
        )}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dot,
            display: 'inline-block',
            animation: isRunning ? 'pulse-status 1.8s ease-in-out infinite' : 'none',
          }}
        />
      </span>
      {label}
    </span>
  )
}

function useElapsed(startedAt?: string) {
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!startedAt) return
    const start = new Date(startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [startedAt])

  return elapsed
}

function formatSeconds(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function formatETA(iso?: string | null) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'any moment'
  return `~${formatSeconds(Math.ceil(ms / 1000))}`
}

export default function AssessmentProgress({ sessionId, sessionLabel, onComplete }: AssessmentProgressProps) {
  const { progress, error } = useAssessmentProgress(sessionId)
  const elapsed = useElapsed(progress?.started_at)
  const completedCallbackFired = useRef(false)

  const pct = progress && progress.total_items > 0
    ? Math.round((progress.processed_items / progress.total_items) * 100)
    : 0

  const eta = formatETA(progress?.estimated_completion)
  const isRunning   = progress?.status === 'running'
  const isCompleted = progress?.status === 'completed'
  const isFailed    = progress?.status === 'failed'
  const isTerminal  = isCompleted || isFailed || progress?.status === 'cancelled'

  useEffect(() => {
    if (isTerminal && onComplete && !completedCallbackFired.current) {
      completedCallbackFired.current = true
      onComplete()
    }
  }, [isTerminal, onComplete])

  const displayPct = isCompleted ? 100 : pct

  const barColor = isFailed
    ? '#EF4444'
    : isCompleted
      ? '#10B981'
      : 'linear-gradient(90deg, #166534 0%, #16A34A 45%, #4ADE80 80%, #16A34A 100%)'

  const barBg = isFailed ? '#FFF1F2' : isCompleted ? 'rgba(20,184,166,0.08)' : '#F0FDF4'

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        style={{
          fontFamily: FONT,
          background: '#FFFFFF',
          borderRadius: 14,
          border: '1px solid #C5D5EC',
          overflow: 'hidden',
          maxWidth: 740,
          margin: '0 auto',
          animation: isRunning ? 'card-breathe 3s ease-in-out infinite' : 'none',
        }}
      >

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '13px 20px',
            background: 'linear-gradient(180deg, #FAFCFF 0%, #F5F8FE 100%)',
            borderBottom: '1px solid #E8F0FB',
            flexWrap: 'wrap',
            gap: 8,
            overflow: 'hidden',
          }}
        >
          {/* Scan-line shimmer on header when running */}
          {isRunning && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(22,163,74,0.06) 50%, transparent 100%)',
                animation: 'header-scan 3.5s cubic-bezier(0.4,0,0.6,1) infinite',
                pointerEvents: 'none',
              }}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            <StatusBadge status={progress?.status ?? 'queued'} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1117', letterSpacing: '-0.01em' }}>
              {sessionLabel ?? 'Fabric Assessment'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12, color: '#767A8C', position: 'relative' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              Elapsed{' '}
              <strong style={{ color: '#0D1117', fontWeight: 600 }}>{formatSeconds(elapsed)}</strong>
            </span>
            {eta && !isTerminal && (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                ETA{' '}
                <strong style={{ color: '#16A34A', fontWeight: 600 }}>{eta}</strong>
              </span>
            )}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div style={{ padding: '22px 22px 18px' }}>

          {/* Phase stepper */}
          {progress && (
            <div style={{ marginBottom: 28 }}>
              <PhaseStepperBar
                currentPhase={progress.phase}
                phaseProgress={progress.phase_progress}
                status={progress.status}
              />
            </div>
          )}

          {/* Main progress section */}
          <div style={{ marginBottom: 20 }}>

            {/* Label row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  color: '#404555',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '74%',
                }}
              >
                {progress?.current_item_name
                  ? `Processing: ${progress.current_item_name}`
                  : progress?.status === 'queued'
                    ? 'Queued — waiting to start'
                    : 'Preparing'}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: isFailed ? '#DC2626' : isCompleted ? '#059669' : '#166534',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                  flexShrink: 0,
                }}
              >
                {displayPct}%
              </span>
            </div>

            {/* Progress bar track */}
            <div
              style={{
                height: 7,
                borderRadius: 9999,
                background: barBg,
                overflow: 'hidden',
                position: 'relative',
              }}
              role="progressbar"
              aria-valuenow={displayPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {/* Fill */}
              <div
                style={{
                  height: '100%',
                  width: `${displayPct}%`,
                  borderRadius: 9999,
                  background: barColor,
                  backgroundSize: '300% 100%',
                  transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Shimmer overlay */}
                {isRunning && (
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.32) 50%, transparent 100%)',
                      animation: 'bar-shimmer 2.2s cubic-bezier(0.4,0,0.6,1) infinite',
                    }}
                  />
                )}
              </div>
            </div>

            {/* Item counter */}
            {progress && progress.total_items > 0 && (
              <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: '#9AB5D8', fontVariantNumeric: 'tabular-nums' }}>
                <span>
                  <strong style={{ color: '#404555', fontWeight: 600 }}>{progress.processed_items}</strong>
                  {' / '}
                  {progress.total_items} items
                </span>
                {progress.failed_items > 0 && (
                  <span style={{ color: '#F59E0B', fontWeight: 500 }}>
                    {progress.failed_items} with errors
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Failure reason */}
          {isFailed && progress?.failure_reason && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: '#FFF1F2',
                border: '1px solid #FECDD3',
                color: '#BE123C',
                fontSize: 12,
                marginBottom: 18,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ fontWeight: 700 }}>Error:</strong>{' '}{progress.failure_reason}
            </div>
          )}

          {/* SSE error */}
          {error && !progress && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                color: '#92400E',
                fontSize: 11,
                marginBottom: 14,
              }}
            >
              Connection issue — retrying ({error})
            </div>
          )}

          {/* Activity feed */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#9AB5D8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Activity
              </span>
              {isRunning && (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#16A34A',
                    display: 'inline-block',
                    animation: 'pulse-status 1.4s ease-in-out infinite',
                  }}
                />
              )}
            </div>

            <div
              style={{
                border: '1px solid #E8F0FB',
                borderRadius: 10,
                padding: '8px 10px',
                background: '#FAFCFF',
              }}
            >
              <LiveActivityFeed
                events={progress?.activity_log ?? []}
                isRunning={isRunning}
              />
            </div>
          </div>

          {/* Error summary */}
          {progress && progress.errors.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#B45309',
                  cursor: 'pointer',
                  userSelect: 'none',
                  letterSpacing: '0.01em',
                }}
              >
                {progress.errors.length} item{progress.errors.length !== 1 ? 's' : ''} with errors
              </summary>
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 120,
                  overflowY: 'auto',
                  fontSize: 11,
                  color: '#767A8C',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(22,163,74,0.18) transparent',
                }}
              >
                {progress.errors.map((e, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #F0FDF4' }}>
                    <strong style={{ color: '#404555' }}>{e.item}</strong>
                    {' — '}
                    <span style={{ color: '#B45309' }}>{e.error}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </>
  )
}
