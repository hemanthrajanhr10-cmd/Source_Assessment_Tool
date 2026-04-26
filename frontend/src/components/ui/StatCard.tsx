interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  sub?: string
  accent?: string
}

export default function StatCard({
  label,
  value,
  icon,
  sub,
  accent = 'bg-amber-500/10 text-amber-400',
}: StatCardProps) {
  const strValue = typeof value === 'number' ? value.toLocaleString() : String(value)
  const valueFontClass =
    strValue.length > 16 ? 'text-xs'   :
    strValue.length > 12 ? 'text-sm'   :
    strValue.length > 8  ? 'text-base' :
    strValue.length > 5  ? 'text-xl'   : 'text-2xl'

  return (
    <div className="card p-4 flex items-start gap-3 hover:border-zinc-700/80 transition-colors duration-200">
      {icon && (
        <div className={`flex-shrink-0 rounded-lg p-2 ${accent}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest truncate">{label}</p>
        <p
          className={`mt-1 font-bold text-zinc-50 font-display leading-snug break-words tabular-nums ${valueFontClass}`}
          title={strValue}
        >
          {strValue}
        </p>
        {sub && <p className="mt-1 text-xs text-zinc-600 truncate">{sub}</p>}
      </div>
    </div>
  )
}
