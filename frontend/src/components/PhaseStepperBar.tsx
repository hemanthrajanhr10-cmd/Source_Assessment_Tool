import type { AssessmentProgressState } from '../types/api'

const PHASES: { key: keyof AssessmentProgressState['phase_progress']; label: string }[] = [
  { key: 'discovery',      label: 'Discovery' },
  { key: 'semantic_models', label: 'Semantic Models' },
  { key: 'reports',        label: 'Reports' },
  { key: 'crosslinking',   label: 'Cross-linking' },
  { key: 'saving',         label: 'Saving' },
]

const PHASE_ORDER = PHASES.map(p => p.key)

interface PhaseStepperBarProps {
  currentPhase: AssessmentProgressState['phase']
  phaseProgress: AssessmentProgressState['phase_progress']
  status: AssessmentProgressState['status']
}

const FONT = "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif"

const KEYFRAMES = `
  @keyframes phase-ring-1 {
    0%   { transform: scale(1);    opacity: 0.55; }
    100% { transform: scale(2.4);  opacity: 0; }
  }
  @keyframes phase-ring-2 {
    0%   { transform: scale(1);    opacity: 0.35; }
    100% { transform: scale(1.75); opacity: 0; }
  }
  @keyframes phase-inner-dot {
    0%, 100% { opacity: 1;   transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.8); }
  }
  @keyframes connector-flow {
    0%   { background-position:  0% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes tick-reveal {
    from { opacity: 0; transform: scale(0.4) rotate(-20deg); }
    to   { opacity: 1; transform: scale(1)   rotate(0deg); }
  }
`

export default function PhaseStepperBar({ currentPhase, phaseProgress, status }: PhaseStepperBarProps) {
  const pp = phaseProgress ?? {} as AssessmentProgressState['phase_progress']
  const currentIdx = PHASE_ORDER.indexOf(currentPhase)

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', width: '100%', fontFamily: FONT }}
        role="list"
        aria-label="Assessment phases"
      >
        {PHASES.map(({ key, label }, idx) => {
          const phaseDone  = pp[key]?.done ?? false
          const isCurrent  = key === currentPhase && !phaseDone && status === 'running'
          const isCompleted = phaseDone || idx < currentIdx || status === 'completed'
          const isFailed   = status === 'failed' && key === currentPhase && !phaseDone
          const isPending  = !isCurrent && !isCompleted && !isFailed

          const connectorDone    = idx < PHASES.length - 1 && (idx < currentIdx || status === 'completed')
          const connectorActive  = idx < PHASES.length - 1 && idx === currentIdx && status === 'running'

          const nodeSize = isCurrent ? 34 : 30

          return (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0 }} role="listitem">
              {/* Step node + label */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 62 }}>

                {/* Node with optional ping rings */}
                <div style={{ position: 'relative', width: nodeSize, height: nodeSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

                  {/* Outer ping ring */}
                  {isCurrent && (
                    <span style={{
                      position: 'absolute',
                      inset: -4,
                      borderRadius: '50%',
                      border: '1.5px solid rgba(22,163,74,0.45)',
                      animation: 'phase-ring-1 2s cubic-bezier(0,0,0.2,1) infinite',
                    }} />
                  )}

                  {/* Inner ping ring */}
                  {isCurrent && (
                    <span style={{
                      position: 'absolute',
                      inset: -1,
                      borderRadius: '50%',
                      border: '1.5px solid rgba(22,163,74,0.55)',
                      animation: 'phase-ring-2 2s cubic-bezier(0,0,0.2,1) 0.55s infinite',
                    }} />
                  )}

                  {/* Main node disc */}
                  <div
                    style={{
                      width: nodeSize,
                      height: nodeSize,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.35s cubic-bezier(0.16,1,0.3,1), border-color 0.35s, box-shadow 0.35s',
                      ...(isCompleted && {
                        background: '#10B981',
                        border: '2px solid #10B981',
                        boxShadow: '0 0 0 3px rgba(16,185,129,0.14)',
                      }),
                      ...(isCurrent && {
                        background: 'linear-gradient(145deg, #22C55E, #166534)',
                        border: '2px solid transparent',
                        boxShadow: '0 2px 12px rgba(22,163,74,0.35), 0 0 0 3px rgba(22,163,74,0.15)',
                      }),
                      ...(isFailed && {
                        background: '#EF4444',
                        border: '2px solid #EF4444',
                        boxShadow: '0 0 0 3px rgba(239,68,68,0.15)',
                      }),
                      ...(isPending && {
                        background: '#F0FDF4',
                        border: '2px solid #BBF7D0',
                      }),
                    }}
                  >
                    {isCompleted ? (
                      <svg
                        width="13" height="13" viewBox="0 0 13 13" fill="none"
                        style={{ animation: 'tick-reveal 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
                      >
                        <path d="M2 7L5 10L11 4" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : isFailed ? (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M2 2L9 9M9 2L2 9" stroke="white" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    ) : isCurrent ? (
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.92)',
                          animation: 'phase-inner-dot 1.6s ease-in-out infinite',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 10, color: '#9AB5D8', fontWeight: 600 }}>{idx + 1}</span>
                    )}
                  </div>
                </div>

                {/* Label */}
                <span
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    fontWeight: isCurrent || isCompleted ? 700 : 400,
                    color: isCompleted ? '#059669'
                         : isCurrent  ? '#16A34A'
                         : isFailed   ? '#DC2626'
                         : '#9CA3AF',
                    textAlign: 'center',
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    letterSpacing: isCurrent ? '0.01em' : '0',
                    transition: 'color 0.3s',
                  }}
                >
                  {label}
                </span>

                {/* Sub-count */}
                {(key === 'semantic_models' || key === 'reports') &&
                  (pp[key]?.total ?? 0) > 0 && (
                  <span
                    style={{
                      marginTop: 2,
                      fontSize: 9,
                      color: isCurrent ? '#16A34A' : '#9CA3AF',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: isCurrent ? 600 : 400,
                      transition: 'color 0.3s',
                    }}
                  >
                    {pp[key]?.processed ?? 0}/{pp[key]?.total ?? 0}
                  </span>
                )}
              </div>

              {/* Connector */}
              {idx < PHASES.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    marginTop: (nodeSize / 2) - 1,
                    marginBottom: 0,
                    minWidth: 8,
                    borderRadius: 9999,
                    overflow: 'hidden',
                    position: 'relative',
                    ...(connectorDone && {
                      background: '#10B981',
                    }),
                    ...(connectorActive && {
                      background: `linear-gradient(90deg, #166534 0%, #4ADE80 40%, #166534 80%, #4ADE80 100%)`,
                      backgroundSize: '200% 100%',
                      animation: 'connector-flow 1.4s linear infinite',
                    }),
                    ...(!connectorDone && !connectorActive && {
                      background: '#D8E6F8',
                    }),
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
