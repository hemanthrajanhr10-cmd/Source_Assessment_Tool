import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  // On narrow screens collapse middle items to ellipsis
  const renderItems = (): BreadcrumbItem[] => {
    if (items.length <= 3) return items
    return [items[0], { label: '...' }, items[items.length - 1]]
  }

  const displayed = renderItems()

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center h-9 px-4 select-none overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #F5FCFA 0%, #EEF8F6 100%)',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        minHeight: 36,
        borderBottom: '1px solid rgba(168,226,221,0.60)',
      }}
    >
      {displayed.map((item, idx) => {
        const isLast = idx === displayed.length - 1
        const isEllipsis = item.label === '...'

        return (
          <span key={idx} className="flex items-center min-w-0">
            {idx > 0 && (
              <ChevronRight
                className="mx-1 flex-shrink-0"
                size={13}
                style={{ color: '#64748B' }}
                aria-hidden
              />
            )}
            {isLast ? (
              <span
                className="text-sm font-semibold truncate max-w-xs"
                style={{ color: '#1E293B' }}
                aria-current="page"
              >
                {item.label}
              </span>
            ) : isEllipsis ? (
              <span
                className="text-sm px-1"
                style={{ color: '#64748B' }}
                aria-hidden
              >
                …
              </span>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className="text-sm truncate max-w-xs hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-earth-400 rounded"
                style={{
                  color: '#3D8B84',
                  cursor: item.onClick ? 'pointer' : 'default',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
              >
                {item.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
