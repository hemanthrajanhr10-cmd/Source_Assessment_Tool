import { useState } from 'react'
import { Search, X, Filter, ChevronDown } from 'lucide-react'
import type { FilterState } from '../../hooks/useSessionFilter'

const D = {
  surface:    '#FFFFFF',
  border:     '#B2DDD9',
  borderFaint:'#D4EFEC',
  teal:       '#6CBDB5',
  tealDark:   '#4DA8A0',
  tealGlow:   'rgba(108,189,181,0.18)',
  tealFaint:  'rgba(108,189,181,0.08)',
  ink:        '#0D1117',
  inkMid:     '#404555',
  inkMute:    '#767A8C',
  shadow1:    '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08)',
  spring:     'cubic-bezier(0.34,1.56,0.64,1)',
  ease:       'cubic-bezier(0.4,0,0.2,1)',
}

const STATUS_OPTIONS = [
  { value: 'all',       label: 'All Status' },
  { value: 'completed', label: 'Completed' },
  { value: 'partial',   label: 'Partial' },
  { value: 'running',   label: 'Running' },
  { value: 'pending',   label: 'Pending' },
  { value: 'failed',    label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface Props {
  filter: FilterState
  onField: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  onReset: () => void
  isActive: boolean
  totalCount: number
  filteredCount: number
  /** Extra right-side content (refresh button, new assessment button, etc.) */
  actions?: React.ReactNode
}

function InputField({
  icon,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  icon: React.ReactNode
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
      <span style={{
        position: 'absolute', left: 11, top: '50%',
        transform: 'translateY(-50%)', pointerEvents: 'none',
        color: focused ? D.tealDark : D.inkMute,
        transition: `color 200ms ${D.ease}`,
        display: 'flex', alignItems: 'center',
      }}>
        {icon}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: type === 'date' ? '7px 10px 7px 32px' : '7px 32px 7px 32px',
          borderRadius: 10,
          border: `1.5px solid ${focused ? D.teal : D.border}`,
          background: D.surface,
          fontSize: 12, color: D.ink,
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${D.tealGlow}` : 'none',
          transition: `all 200ms ${D.ease}`,
          fontFamily: 'inherit',
        }}
      />
      {value && type === 'text' && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute', right: 8, top: '50%',
            transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', padding: 2,
            color: D.inkMute, borderRadius: 4,
          }}
        >
          <X style={{ width: 11, height: 11 }} />
        </button>
      )}
    </div>
  )
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative', flex: '0 0 auto', minWidth: 140 }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '7px 32px 7px 12px',
          borderRadius: 10,
          border: `1.5px solid ${focused ? D.teal : D.border}`,
          background: D.surface,
          fontSize: 12, color: value !== 'all' ? D.ink : D.inkMute,
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${D.tealGlow}` : 'none',
          transition: `all 200ms ${D.ease}`,
          fontFamily: 'inherit',
          fontWeight: value !== 'all' ? 700 : 400,
          appearance: 'none',
          cursor: 'pointer',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown style={{
        position: 'absolute', right: 9, top: '50%',
        transform: 'translateY(-50%)', pointerEvents: 'none',
        width: 13, height: 13, color: D.inkMute,
      }} />
    </div>
  )
}

export default function SessionFilterBar({
  filter,
  onField,
  onReset,
  isActive,
  totalCount,
  filteredCount,
  actions,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Top row: search + toggle + actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8,
      }}>
        {/* Main search */}
        <div style={{ flex: '1 1 220px', minWidth: 180, position: 'relative' }}>
          <Search style={{
            position: 'absolute', left: 11, top: '50%',
            transform: 'translateY(-50%)', pointerEvents: 'none',
            width: 14, height: 14, color: D.inkMute,
          }} />
          <input
            type="text"
            placeholder="Search by Session ID, Job ID, name…"
            value={filter.search}
            onChange={e => onField('search', e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 36px 8px 34px',
              borderRadius: 10,
              border: `1.5px solid ${filter.search ? D.teal : D.border}`,
              background: D.surface,
              fontSize: 12, color: D.ink,
              outline: 'none',
              boxShadow: filter.search ? `0 0 0 3px ${D.tealGlow}` : D.shadow1,
              transition: `all 200ms ${D.ease}`,
              fontFamily: 'inherit',
            }}
          />
          {filter.search && (
            <button
              onClick={() => onField('search', '')}
              style={{
                position: 'absolute', right: 9, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', padding: 2,
                color: D.inkMute, borderRadius: 4,
              }}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>

        {/* Toggle filters button */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: expanded || isActive ? D.tealFaint : D.surface,
            border: `1.5px solid ${expanded || isActive ? D.teal : D.border}`,
            color: expanded || isActive ? D.tealDark : D.inkMid,
            cursor: 'pointer',
            boxShadow: D.shadow1,
            transition: `all 200ms ${D.spring}`,
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            if (!expanded && !isActive) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = D.teal
              ;(e.currentTarget as HTMLButtonElement).style.color = D.tealDark
            }
          }}
          onMouseLeave={e => {
            if (!expanded && !isActive) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = D.border
              ;(e.currentTarget as HTMLButtonElement).style.color = D.inkMid
            }
          }}
        >
          <Filter style={{ width: 12, height: 12 }} />
          Filters
          {isActive && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: D.tealDark, flexShrink: 0,
            }} />
          )}
          <ChevronDown style={{
            width: 12, height: 12,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: `transform 250ms ${D.ease}`,
          }} />
        </button>

        {/* Clear all */}
        {isActive && (
          <button
            onClick={onReset}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: 'rgba(220,38,38,0.07)',
              border: '1.5px solid rgba(220,38,38,0.20)',
              color: '#DC2626',
              cursor: 'pointer', transition: `all 200ms ${D.ease}`, flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.12)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.07)'}
          >
            <X style={{ width: 11, height: 11 }} />
            Clear
          </button>
        )}

        {/* Injected action buttons (refresh, new assessment) */}
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            {actions}
          </div>
        )}
      </div>

      {/* Expanded filters panel */}
      <div style={{
        overflow: 'hidden',
        maxHeight: expanded ? 120 : 0,
        opacity: expanded ? 1 : 0,
        transition: `max-height 300ms ${D.ease}, opacity 250ms ${D.ease}`,
      }}>
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          padding: '12px 16px',
          background: D.surface,
          borderRadius: 12,
          border: `1.5px solid ${D.border}`,
          boxShadow: D.shadow1,
          marginBottom: 4,
        }}>
          {/* Status */}
          <SelectField
            value={filter.status}
            onChange={v => onField('status', v)}
            options={STATUS_OPTIONS}
          />

          {/* Label */}
          <InputField
            icon={<Filter style={{ width: 12, height: 12 }} />}
            placeholder="Filter by label…"
            value={filter.label}
            onChange={v => onField('label', v)}
          />

          {/* Date from */}
          <InputField
            icon={<span style={{ fontSize: 11, fontWeight: 700, color: 'inherit', lineHeight: 1 }}>From</span>}
            placeholder="From date"
            value={filter.dateFrom}
            onChange={v => onField('dateFrom', v)}
            type="date"
          />

          {/* Date to */}
          <InputField
            icon={<span style={{ fontSize: 11, fontWeight: 700, color: 'inherit', lineHeight: 1 }}>To</span>}
            placeholder="To date"
            value={filter.dateTo}
            onChange={v => onField('dateTo', v)}
            type="date"
          />
        </div>
      </div>

      {/* Result count indicator */}
      {isActive && (
        <p style={{
          fontSize: 11, color: D.inkMute, margin: '6px 0 0',
          fontWeight: 600, letterSpacing: '0.02em',
        }}>
          {filteredCount === totalCount
            ? `${totalCount} session${totalCount !== 1 ? 's' : ''}`
            : `${filteredCount} of ${totalCount} sessions match`}
        </p>
      )}
    </div>
  )
}
