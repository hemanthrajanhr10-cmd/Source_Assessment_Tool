interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  sub?: string
  accent?: string
  trend?: 'up' | 'down' | 'neutral'
}

export default function StatCard({
  label,
  value,
  icon,
  sub,
  accent = 'bg-indigo-50 text-indigo-600',
}: StatCardProps) {
  const strValue = typeof value === 'number' ? value.toLocaleString() : String(value)
  const valueFontClass =
    strValue.length > 16 ? 'text-xs'   :
    strValue.length > 12 ? 'text-sm'   :
    strValue.length > 8  ? 'text-base' :
    strValue.length > 5  ? 'text-xl'   : 'text-2xl'

  return (
    <div className="card p-5 flex items-start gap-4 hover:border-slate-300 transition-all duration-200 group">
      {icon && (
        <div className={`flex-shrink-0 rounded-xl p-2.5 ${accent} transition-transform duration-200 group-hover:scale-105`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest truncate">{label}</p>
        <p
          className={`mt-1.5 font-bold text-slate-900 font-display leading-snug break-words tabular-nums ${valueFontClass}`}
          title={strValue}
        >
          {strValue}
        </p>
        {sub && <p className="mt-1 text-xs text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
  )
}
