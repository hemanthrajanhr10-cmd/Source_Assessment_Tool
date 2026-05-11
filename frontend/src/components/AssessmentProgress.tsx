import { useEffect, useRef, useState } from 'react'
import { useAssessmentProgress } from '../hooks/useAssessmentProgress'
import PhaseStepperBar from './PhaseStepperBar'
import LiveActivityFeed from './LiveActivityFeed'

interface AssessmentProgressProps {
  sessionId: string
  sessionLabel?: string
}

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    queued:    { bg: '#F3F4F6', color: '#6B7280', label: 'Queued' },
    running:   { bg: '#EFF6FF', color: '#1D4ED8', label: 'Running' },
    completed: { bg: '#F0FDF4', color: '#15803D', label: 'Completed' },
    failed:    { bg: '#FFF1F2', color: '#BE123C', label: 'Failed' },
    cancelled: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
  }
  const { bg, color, label } = cfg[status] ?? cfg.queued
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 10px',
        borderRadius: 9999,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {status === 'running' && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#3B82F6',
            display: 'inline-block',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
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

export default function AssessmentProgress({ sessionId, sessionLabel }: AssessmentProgressProps) {
  const { progress, error } = useAssessmentProgress(sessionId)
  const elapsed = useElapsed(progress?.started_at)

  const pct = progress && progress.total_items > 0
    ? Math.round((progress.processed_items / progress.total_items) * 100)
    : 0

  const eta = formatETA(progress?.estimated_completion)
  const isTerminal = progress?.status === 'completed' || progress?.status === 'failed' || progress?.status === 'cancelled'

  return (
    <div
      style={{
        fontFamily: FONT,
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #E5E7EB',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      {/* ── Header strip ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid #F3F4F6',
          background: '#FAFAFA',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge status={progress?.status ?? 'queued'} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
            {sessionLabel ?? 'Fabric Assessment'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#6B7280' }}>
          <span>Elapsed: <strong style={{ color: '#374151' }}>{formatSeconds(elapsed)}</strong></span>
          {eta && !isTerminal && (
            <span>ETA: <strong style={{ color: '#374151' }}>{eta}</strong></span>
          )}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 16px' }}>

        {/* Phase stepper */}
        {progress && (
          <div style={{ marginBottom: 24 }}>
            <PhaseStepperBar
              currentPhase={progress.phase}
              phaseProgress={progress.phase_progress}
              status={progress.status}
            />
          </div>
        )}

        {/* Main progress bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: '#6B7280' }}>
              {progress?.current_item_name
                ? `Processing: ${progress.current_item_name}`
                : progress?.status === 'queued'
                  ? 'Queued — waiting to start…'
                  : 'Preparing…'}
            </span>
            <span style={{ fontWeight: 700, color: progress?.status === 'failed' ? '#DC2626' : '#374151' }}>
              {progress?.status === 'completed' ? '100%' : `${pct}%`}
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 9999,
              background: '#F3F4F6',
              overflow: 'hidden',
            }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              style={{
                height: '100%',
                width: `${progress?.status === 'completed' ? 100 : pct}%`,
                borderRadius: 9999,
                background: progress?.status === 'failed'
                  ? '#EF4444'
                  : progress?.status === 'completed'
                    ? '#10B981'
                    : 'linear-gradient(90deg, #3B82F6 0%, #6366F1 100%)',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          {progress && progress.total_items > 0 && (
            <div style={{ display: 'flex', gap: 16, marginTop: 5, fontSize: 11, color: '#9CA3AF' }}>
              <span>{progress.processed_items} / {progress.total_items} items</span>
              {progress.failed_items > 0 && (
                <span style={{ color: '#F59E0B' }}>{progress.failed_items} failed</span>
              )}
            </div>
          )}
        </div>

        {/* Failure reason */}
        {progress?.status === 'failed' && progress.failure_reason && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: '#FFF1F2',
              border: '1px solid #FECDD3',
              color: '#BE123C',
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            <strong>Error:</strong> {progress.failure_reason}
          </div>
        )}

        {/* SSE connection error */}
        {error && !progress && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              color: '#92400E',
              fontSize: 11,
              marginBottom: 12,
            }}
          >
            Connection issue — retrying… ({error})
          </div>
        )}

        {/* Activity feed */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#6B7280',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            Activity
          </div>
          <div
            style={{
              border: '1px solid #F3F4F6',
              borderRadius: 8,
              padding: '8px 10px',
              background: '#FAFAFA',
            }}
          >
            <LiveActivityFeed events={progress?.activity_log ?? []} />
          </div>
        </div>

        {/* Error summary */}
        {progress && progress.errors.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#B45309',
                cursor: 'pointer',
                userSelect: 'none',
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
                color: '#6B7280',
                scrollbarWidth: 'thin',
              }}
            >
              {progress.errors.map((e, i) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #F3F4F6' }}>
                  <strong style={{ color: '#374151' }}>{e.item}</strong>
                  {' — '}
                  <span style={{ color: '#B45309' }}>{e.error}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Pulse keyframe injected once */}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
