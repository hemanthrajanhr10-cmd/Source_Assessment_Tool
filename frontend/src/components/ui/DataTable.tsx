import { useState, useMemo } from 'react'
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react'
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
const FILTER_MAX_UNIQUE = 50

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
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})

  const cols = useMemo(() => columns ?? buildAutoColumns(data), [columns, data])

  // For each column: collect unique values (capped at FILTER_MAX_UNIQUE for select dropdown).
  // Columns with more unique values get a text-input filter instead.
  const uniqueColumnValues = useMemo(() => {
    const result: Record<string, string[] | null> = {}  // null = use text input
    cols.forEach((col) => {
      const vals = new Set<string>()
      let overflow = false
      for (const row of data) {
        const v = row[col.key]
        if (v !== null && v !== undefined) vals.add(String(v))
        if (vals.size > FILTER_MAX_UNIQUE) { overflow = true; break }
      }
      result[col.key] = overflow ? null : Array.from(vals).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    })
    return result
  }, [cols, data])

  const hasColumnFilters = Object.values(columnFilters).some(Boolean)

  const filtered = useMemo(() => {
    let rows = data
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((row) =>
        Object.values(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)),
      )
    }
    Object.entries(columnFilters).forEach(([key, val]) => {
      if (!val) return
      const isSelect = Array.isArray(uniqueColumnValues[key])
      rows = rows.filter((row) => {
        const v = row[key]
        if (v === null || v === undefined) return false
        const str = String(v)
        return isSelect ? str === val : str.toLowerCase().includes(val.toLowerCase())
      })
    })
    return rows
  }, [data, search, columnFilters, uniqueColumnValues])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const setColFilter = (key: string, val: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }))
    setPage(1)
  }

  const clearFilters = () => {
    setColumnFilters({})
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
      {/* Global search + clear filters */}
      <div className="flex items-center gap-3 flex-wrap">
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
        {hasColumnFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-red-300 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear column filters
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            {/* Column headers */}
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
            {/* Column filter row — always shown when data is present */}
            {data.length > 0 && (
              <tr className="bg-white border-t border-slate-100">
                {cols.map((col) => {
                  const activeVal = columnFilters[col.key] ?? ''
                  const options = uniqueColumnValues[col.key]   // string[] = select, null = text input
                  const isActive = Boolean(activeVal)
                  return (
                    <td key={col.key} className="px-2 py-1">
                      <div className="flex items-center gap-0.5">
                        {options !== null ? (
                          /* Select dropdown for low-cardinality columns */
                          <select
                            value={activeVal}
                            onChange={(e) => setColFilter(col.key, e.target.value)}
                            className={`flex-1 min-w-0 text-xs rounded border py-0.5 px-1 focus:outline-none focus:ring-1 focus:ring-brand-400 ${
                              isActive
                                ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium'
                                : 'border-slate-200 bg-white text-slate-500'
                            }`}
                          >
                            <option value="">All</option>
                            {(options ?? []).map((v) => (
                              <option key={v} value={v}>{v.length > 28 ? v.slice(0, 28) + '…' : v}</option>
                            ))}
                          </select>
                        ) : (
                          /* Text input for high-cardinality columns */
                          <input
                            type="text"
                            placeholder="Filter…"
                            value={activeVal}
                            onChange={(e) => setColFilter(col.key, e.target.value)}
                            className={`flex-1 min-w-0 text-xs rounded border py-0.5 px-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 ${
                              isActive
                                ? 'border-brand-400 bg-brand-50 text-brand-700'
                                : 'border-slate-200 bg-white text-slate-500'
                            }`}
                          />
                        )}
                        {/* Per-filter clear button */}
                        {isActive && (
                          <button
                            onClick={() => setColFilter(col.key, '')}
                            className="shrink-0 p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title={`Clear filter on ${col.header}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-12 text-center text-slate-400 text-sm">
                  {search || hasColumnFilters ? 'No results match your filters.' : emptyMessage}
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
            {(search || hasColumnFilters) && ` (filtered from ${data.length.toLocaleString()})`}
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
