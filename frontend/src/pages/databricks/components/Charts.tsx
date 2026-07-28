import { theme } from '../theme'

export interface ChartDatum { label: string; value: number; color: string }

export function DonutChart({ data, size = 140, label }: { data: ChartDatum[]; size?: number; label?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: theme.color.inkMuted }}>No data</span>
      </div>
    )
  }
  const r = size / 2 - 8, ir = r * 0.6
  const cx = size / 2, cy = size / 2
  let angle = -90
  const toRad = (a: number) => (a * Math.PI) / 180
  const arcs = data.filter(d => d.value > 0).map(d => {
    const sweep = (d.value / total) * 360
    const s = angle, e = angle + sweep; angle = e
    const x1 = cx + r * Math.cos(toRad(s)), y1 = cy + r * Math.sin(toRad(s))
    const x2 = cx + r * Math.cos(toRad(e)), y2 = cy + r * Math.sin(toRad(e))
    const ix1 = cx + ir * Math.cos(toRad(s)), iy1 = cy + ir * Math.sin(toRad(s))
    const ix2 = cx + ir * Math.cos(toRad(e)), iy2 = cy + ir * Math.sin(toRad(e))
    return { ...d, path: `M${x1} ${y1} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} L${ix2} ${iy2} A${ir} ${ir} 0 ${sweep > 180 ? 1 : 0} 0 ${ix1} ${iy1}Z` }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} stroke={theme.color.surface} strokeWidth="2" />)}
      <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="700" fontFamily={theme.font.mono} fill={theme.color.ink}>{total.toLocaleString()}</text>
      {label && <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="600" fill={theme.color.inkMuted}>{label}</text>}
    </svg>
  )
}

export function Legend({ data }: { data: ChartDatum[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
          <span style={{ flex: 1, color: theme.color.inkMuted }}>{d.label}</span>
          <span style={{ fontWeight: 700, color: theme.color.ink, fontFamily: theme.font.mono }}>{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export function HBar({ data, labelW = 130 }: { data: ChartDatum[]; labelW?: number }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: labelW, fontSize: 10, color: theme.color.inkMuted, textAlign: 'right', flexShrink: 0 }}>{d.label}</span>
          <div style={{ flex: 1, height: 7, background: theme.color.surfaceSunken, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(d.value / max) * 100}%`, background: d.color, borderRadius: 4,
              transition: `width ${theme.motion.slow}ms ${theme.motion.easeCss}`,
            }} />
          </div>
          <span style={{ width: 36, fontSize: 11, fontWeight: 700, color: theme.color.ink, textAlign: 'right', fontFamily: theme.font.mono }}>{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
