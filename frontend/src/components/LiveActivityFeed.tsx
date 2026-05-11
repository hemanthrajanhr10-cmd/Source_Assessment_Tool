import { useEffect, useRef } from 'react'
import type { ActivityEvent } from '../types/api'

interface LiveActivityFeedProps {
  events: ActivityEvent[]
}

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"

export default function LiveActivityFeed({ events }: LiveActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div
        style={{
          height: 160,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9CA3AF',
          fontSize: 12,
          fontFamily: FONT,
        }}
      >
        Waiting for activity…
      </div>
    )
  }

  return (
    <div
      style={{
        maxHeight: 200,
        overflowY: 'auto',
        fontFamily: FONT,
        fontSize: 11,
        lineHeight: 1.5,
        scrollbarWidth: 'thin',
        scrollbarColor: '#D1D5DB transparent',
      }}
      aria-label="Activity feed"
      aria-live="polite"
      aria-relevant="additions"
    >
      {events.map((ev, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            padding: '3px 4px',
            borderRadius: 4,
            background: ev.status === 'error' ? '#FFFBEB' : 'transparent',
          }}
        >
          {/* Timestamp */}
          <span style={{ color: '#9CA3AF', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {ev.ts}
          </span>

          {/* Status dot */}
          <span
            style={{
              flexShrink: 0,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: ev.status === 'error' ? '#F59E0B' : '#10B981',
              display: 'inline-block',
              marginBottom: 1,
            }}
          />

          {/* Type badge */}
          {ev.type && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: 9999,
                background: ev.type === 'model' ? '#EEF2FF' : ev.type === 'report' ? '#F0FDF4' : '#F3F4F6',
                color: ev.type === 'model' ? '#4338CA' : ev.type === 'report' ? '#15803D' : '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {ev.type}
            </span>
          )}

          {/* Name */}
          <span
            style={{
              color: ev.status === 'error' ? '#92400E' : '#374151',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
            title={ev.name}
          >
            {ev.name}
          </span>

          {/* Error note */}
          {ev.error && (
            <span
              style={{ color: '#B45309', flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={ev.error}
            >
              — {ev.error}
            </span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
