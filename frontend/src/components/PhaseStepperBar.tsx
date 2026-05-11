import type { AssessmentProgressState } from '../types/api'

const PHASES: { key: keyof AssessmentProgressState['phase_progress']; label: string }[] = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'semantic_models', label: 'Semantic Models' },
  { key: 'reports', label: 'Reports' },
  { key: 'crosslinking', label: 'Cross-linking' },
  { key: 'saving', label: 'Saving' },
]

const PHASE_ORDER = PHASES.map(p => p.key)

interface PhaseStepperBarProps {
  currentPhase: AssessmentProgressState['phase']
  phaseProgress: AssessmentProgressState['phase_progress']
  status: AssessmentProgressState['status']
}

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"

export default function PhaseStepperBar({ currentPhase, phaseProgress, status }: PhaseStepperBarProps) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase)

  return (
    <div
      className="flex items-center gap-0 w-full"
      style={{ fontFamily: FONT }}
      role="list"
      aria-label="Assessment phases"
    >
      {PHASES.map(({ key, label }, idx) => {
        const phaseDone = phaseProgress[key]?.done ?? false
        const isCurrent = key === currentPhase && !phaseDone && status === 'running'
        const isCompleted = phaseDone || idx < currentIdx || status === 'completed'
        const isFailed = status === 'failed' && key === currentPhase && !phaseDone

        let dotBg = '#E5E7EB'   // pending — gray
        let dotBorder = '#D1D5DB'
        let labelColor = '#9CA3AF'
        if (isCompleted) { dotBg = '#10B981'; dotBorder = '#10B981'; labelColor = '#374151' }
        if (isCurrent)   { dotBg = '#3B82F6'; dotBorder = '#3B82F6'; labelColor = '#1D4ED8' }
        if (isFailed)    { dotBg = '#EF4444'; dotBorder = '#EF4444'; labelColor = '#DC2626' }

        const connectorDone = idx < PHASES.length - 1 && (idx < currentIdx || status === 'completed')

        return (
          <div key={key} className="flex items-center flex-1 min-w-0" role="listitem">
            {/* Step */}
            <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 60 }}>
              {/* Dot */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: dotBg,
                  border: `2px solid ${dotBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.3s, border-color 0.3s',
                  boxShadow: isCurrent ? '0 0 0 3px rgba(59,130,246,0.2)' : undefined,
                }}
              >
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : isFailed ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2L10 10M10 2L2 10" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : isCurrent ? (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ) : (
                  <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>{idx + 1}</span>
                )}
              </div>
              {/* Label */}
              <span
                style={{
                  fontSize: 10,
                  color: labelColor,
                  fontWeight: isCurrent || isCompleted ? 600 : 400,
                  marginTop: 4,
                  textAlign: 'center',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  transition: 'color 0.3s',
                }}
              >
                {label}
              </span>
              {/* Sub-count for models/reports */}
              {(key === 'semantic_models' || key === 'reports') && phaseProgress[key]?.total != null && (phaseProgress[key]?.total ?? 0) > 0 && (
                <span style={{ fontSize: 9, color: '#9CA3AF', marginTop: 1 }}>
                  {phaseProgress[key]?.processed ?? 0}/{phaseProgress[key]?.total ?? 0}
                </span>
              )}
            </div>

            {/* Connector line */}
            {idx < PHASES.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: connectorDone ? '#10B981' : '#E5E7EB',
                  transition: 'background 0.3s',
                  marginBottom: 20,
                  minWidth: 8,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
