import { useState, useMemo } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import Spinner from './Spinner'

export interface ColumnDef {
  key: string
  header: string
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  minWidth?: string
}

interface DataTableProps {
  data: Record<string, unknown>[]
  columns?: ColumnDef[]
  loading?: boolean
  emptyMessage?: string
  searchable?: boolean
  pageSize?: number
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-slate-300">—</span>
  }
  if (typeof value === 'boolean') {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    )
  }
  if (typeof value === 'number') {
    return <span className="tabular-nums">{value.toLocaleString()}</span>
  }
  const str = String(value)
  if (str.length > 120) {
    return <span title={str}>{str.slice(0, 120)}…</span>
  }
  return str
}

function buildAutoColumns(data: Record<string, unknown>[]): ColumnDef[] {
  if (!data.length) return []
  return Object.keys(data[0]).map((key) => ({
    key,
    header: key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    align: typeof data[0][key] === 'number' ? 'right' : 'left',
  }))
}

const PAGE_SIZE_DEFAULT = 50

export default function DataTable({
  data,
  columns,
  loading,
  emptyMessage = 'No data available.',
  searchable = true,
  pageSize = PAGE_SIZE_DEFAULT,
}: DataTableProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const cols = useMemo(() => columns ?? buildAutoColumns(data), [columns, data])

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter((row) =>
      Object.values(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)),
    )
  }, [data, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Spinner size="lg" className="text-brand-500" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {searchable && data.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={handleSearch}
            className="form-input pl-9 py-2 text-sm"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {cols.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                  className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${
                    col.align === 'right'  ? 'text-right'  :
                    col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-12 text-center text-slate-400 text-sm">
                  {search ? 'No results match your search.' : emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors duration-75">
                  {cols.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap ${
                        col.align === 'right'  ? 'text-right'  :
                        col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {col.render ? col.render(row[col.key], row) : formatValue(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
            {filtered.length.toLocaleString()} rows
            {search && ` (filtered from ${data.length.toLocaleString()})`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-medium text-slate-700">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
