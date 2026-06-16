import { useEffect, useRef } from 'react'
import type { ActivityEvent } from '../types/api'

interface LiveActivityFeedProps {
  events: ActivityEvent[]
  isRunning?: boolean
}

const FONT = "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif"
const MONO = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"

const KEYFRAMES = `
  @keyframes row-enter {
    from { opacity: 0; transform: translateY(7px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dot-wave {
    0%, 60%, 100% { transform: translateY(0);   opacity: 0.25; }
    30%            { transform: translateY(-5px); opacity: 1;    }
  }
  @keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0; }
  }
  @keyframes latest-flash {
    0%   { background: rgba(0,132,212,0.1); }
    100% { background: transparent; }
  }
`

function WaitingState() {
  return (
    <div
      style={{
        height: 160,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#0084D4',
              display: 'inline-block',
              animation: `dot-wave 1.4s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontSize: 11,
          color: '#767A8C',
          fontFamily: FONT,
          letterSpacing: '0.02em',
        }}
      >
        Waiting for activity
        <span style={{ animation: 'cursor-blink 1.1s step-end infinite', marginLeft: 1 }}>_</span>
      </span>
    </div>
  )
}

export default function LiveActivityFeed({ events, isRunning }: LiveActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const lastIdx = events.length - 1

  if (events.length === 0) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <WaitingState />
      </>
    )
  }

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        style={{
          maxHeight: 210,
          overflowY: 'auto',
          fontFamily: MONO,
          fontSize: 11,
          lineHeight: 1.6,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0,86,179,0.18) transparent',
        }}
        aria-label="Activity feed"
        aria-live="polite"
        aria-relevant="additions"
      >
        {events.map((ev, i) => {
          const isLatest = i === lastIdx && isRunning

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '3px 6px',
                borderRadius: 4,
                animation: 'row-enter 0.28s cubic-bezier(0.16,1,0.3,1) both',
                ...(isLatest && {
                  animation: 'row-enter 0.28s cubic-bezier(0.16,1,0.3,1) both, latest-flash 1.2s ease-out 0.25s both',
                }),
                ...(ev.status === 'error' && {
                  background: 'rgba(251,191,36,0.06)',
                }),
              }}
            >
              {/* Timestamp */}
              <span
                style={{
                  color: '#9AB5D8',
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 10,
                  letterSpacing: '0.01em',
                }}
              >
                {ev.ts}
              </span>

              {/* Status dot */}
              <span
                style={{
                  flexShrink: 0,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: ev.status === 'error'
                    ? '#F59E0B'
                    : isLatest
                      ? '#0084D4'
                      : '#14B8A6',
                  display: 'inline-block',
                  boxShadow: isLatest ? '0 0 5px rgba(0,132,212,0.5)' : 'none',
                  transition: 'background 0.3s, box-shadow 0.3s',
                }}
              />

              {/* Type badge */}
              {ev.type && (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontFamily: FONT,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    ...(ev.type === 'model' && {
                      background: 'rgba(0,86,179,0.09)',
                      color: '#0056B3',
                    }),
                    ...(ev.type === 'report' && {
                      background: 'rgba(20,184,166,0.1)',
                      color: '#0D9488',
                    }),
                    ...(ev.type !== 'model' && ev.type !== 'report' && {
                      background: '#EFF6FF',
                      color: '#404555',
                    }),
                  }}
                >
                  {ev.type}
                </span>
              )}

              {/* Name */}
              <span
                style={{
                  color: ev.status === 'error' ? '#92400E' : isLatest ? '#0D1117' : '#404555',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  fontWeight: isLatest ? 500 : 400,
                  transition: 'color 0.3s, font-weight 0.3s',
                }}
                title={ev.name}
              >
                {ev.name}
              </span>

              {/* Error note */}
              {ev.error && (
                <span
                  style={{
                    color: '#B45309',
                    flexShrink: 0,
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 10,
                  }}
                  title={ev.error}
                >
                  {ev.error}
                </span>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </>
  )
}
