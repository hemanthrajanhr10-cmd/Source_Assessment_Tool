import { theme } from '../theme'

// Consistent table primitives — label-style headers, hover-only row emphasis
// (no zebra striping), right-aligned tabular-nums numeric columns, em-dash
// for empty cells. Row-specific logic (expand/collapse, per-domain cells)
// stays in the page; these only standardize presentation.

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: theme.font.body }}>
        {children}
      </table>
    </div>
  )
}

export function Thead({ headers }: { headers: string[] }) {
  return (
    <thead>
      <tr>
        {headers.map((h, i) => (
          <th key={i} style={{
            padding: '9px 14px', textAlign: 'left', fontSize: 9, fontWeight: 700,
            color: theme.color.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em',
            borderBottom: `1px solid ${theme.color.border}`, whiteSpace: 'nowrap',
            background: theme.color.surfaceSunken,
          }}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function Tr({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`db-row${onClick ? ' db-row-clickable' : ''}`}
      style={{ borderBottom: `1px solid ${theme.color.divider}` }}
    >
      {children}
    </tr>
  )
}

export function Td({ children, align = 'left', mono = false, emphasis = false, width }: {
  children: React.ReactNode; align?: 'left' | 'right' | 'center'; mono?: boolean; emphasis?: boolean; width?: number
}) {
  const empty = children == null || children === ''
  return (
    <td style={{
      padding: '9px 14px', textAlign: align, width,
      fontFamily: mono ? theme.font.mono : theme.font.body,
      fontWeight: emphasis ? 600 : 400,
      color: empty ? theme.color.inkFaint : emphasis ? theme.color.ink : theme.color.inkSecondary,
      fontVariantNumeric: mono ? 'tabular-nums' : undefined,
    }}>
      {empty ? '—' : children}
    </td>
  )
}

export function EmptyRow({ colSpan, label = 'No data' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 28, textAlign: 'center', color: theme.color.inkMuted, fontSize: 12 }}>
        {label}
      </td>
    </tr>
  )
}

// Simple label/value grid — for compact metadata blocks (workspace info, job orchestration, etc.)
export function KV({ rows }: { rows: [string, string | number | boolean | undefined | null][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', padding: '14px 18px' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          paddingBottom: 6, borderBottom: `1px solid ${theme.color.divider}`,
        }}>
          <span style={{ fontSize: 11, color: theme.color.inkMuted }}>{k}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, fontFamily: theme.font.mono,
            color: v == null || v === '' ? theme.color.inkFaint : theme.color.ink,
            textAlign: 'right', maxWidth: '55%', wordBreak: 'break-word',
          }}>
            {v == null || v === '' ? '—' : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Generic read-only data grid for simple row/column data without custom cell logic.
export function InlineTable({ cols, rows }: { cols: string[]; rows: (string | number | boolean | null | undefined)[][] }) {
  return (
    <Table>
      <Thead headers={cols} />
      <tbody>
        {rows.length === 0 && <EmptyRow colSpan={cols.length} />}
        {rows.map((row, i) => (
          <Tr key={i}>
            {row.map((cell, j) => <Td key={j} mono={j === 0} emphasis={j === 0}>{cell}</Td>)}
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}
