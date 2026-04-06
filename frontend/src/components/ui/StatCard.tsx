interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  sub?: string
  accent?: string
}

export default function StatCard({ label, value, icon, sub, accent = 'bg-brand-50 text-brand-600' }: StatCardProps) {
  return (
    <div className="card p-5 flex items-start gap-4">
      {icon && (
        <div className={`flex-shrink-0 rounded-xl p-2.5 ${accent}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 leading-none">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {sub && <p className="mt-1 text-xs text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}
