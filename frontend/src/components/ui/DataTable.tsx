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
    return <span className="text-zinc-700">—</span>
  }
  if (typeof value === 'boolean') {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        value ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
      }`}>
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
    header: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
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

  const uniqueColumnValues = useMemo(() => {
    const result: Record<string, string[] | null> = {}
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
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Spinner size="lg" className="text-amber-500" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Global search + clear filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {searchable && data.length > 0 && (
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={handleSearch}
              className="form-input pl-9 py-1.5 text-sm"
            />
          </div>
        )}
        {hasColumnFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 border border-zinc-800 rounded-lg px-2.5 py-1.5 hover:border-red-500/30 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
        {filtered.length !== data.length && (
          <span className="text-xs text-zinc-500">
            {filtered.length.toLocaleString()} of {data.length.toLocaleString()} rows
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800/70 scrollbar-thin">
        <table className="min-w-full divide-y divide-zinc-800/50 text-sm">
          <thead className="bg-zinc-900/80">
            <tr>
              {cols.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                  className={`px-4 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest whitespace-nowrap ${
                    col.align === 'right'  ? 'text-right'  :
                    col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
            {data.length > 0 && (
              <tr className="bg-zinc-950/40 border-t border-zinc-800/40">
                {cols.map((col) => {
                  const activeVal = columnFilters[col.key] ?? ''
                  const options = uniqueColumnValues[col.key]
                  const isActive = Boolean(activeVal)
                  return (
                    <td key={col.key} className="px-2 py-1">
                      <div className="flex items-center gap-0.5">
                        {options !== null ? (
                          <select
                            value={activeVal}
                            onChange={(e) => setColFilter(col.key, e.target.value)}
                            className={`flex-1 min-w-0 text-xs rounded border py-0.5 px-1 focus:outline-none focus:ring-1 focus:ring-amber-500/40 bg-zinc-900 ${
                              isActive
                                ? 'border-amber-500/40 text-amber-400 font-medium'
                                : 'border-zinc-800 text-zinc-500'
                            }`}
                          >
                            <option value="">All</option>
                            {(options ?? []).map((v) => (
                              <option key={v} value={v}>{v.length > 28 ? v.slice(0, 28) + '…' : v}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="Filter…"
                            value={activeVal}
                            onChange={(e) => setColFilter(col.key, e.target.value)}
                            className={`flex-1 min-w-0 text-xs rounded border py-0.5 px-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/40 bg-zinc-900 ${
                              isActive
                                ? 'border-amber-500/40 text-amber-400'
                                : 'border-zinc-800 text-zinc-500'
                            }`}
                          />
                        )}
                        {isActive && (
                          <button
                            onClick={() => setColFilter(col.key, '')}
                            className="shrink-0 p-0.5 rounded text-zinc-600 hover:text-red-400 transition-colors"
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
          <tbody className="divide-y divide-zinc-800/40 bg-zinc-900/30">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-12 text-center text-zinc-600 text-sm">
                  {search || hasColumnFilters ? 'No results match your filters.' : emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={i} className="hover:bg-zinc-800/30 transition-colors duration-75">
                  {cols.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-sm text-zinc-300 whitespace-nowrap ${
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
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
            {filtered.length.toLocaleString()} rows
            {(search || hasColumnFilters) && ` (filtered from ${data.length.toLocaleString()})`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-medium text-zinc-400">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
