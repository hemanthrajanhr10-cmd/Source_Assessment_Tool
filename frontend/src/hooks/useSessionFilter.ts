import { useState, useMemo } from 'react'

export interface FilterState {
  search: string
  status: string
  dateFrom: string
  dateTo: string
  label: string
}

const INITIAL_FILTER: FilterState = {
  search: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
  label: '',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getField(record: any, key: string): unknown {
  return record[key]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchRecord(record: any, filter: FilterState): boolean {
  if (filter.status !== 'all') {
    const recordStatus = (getField(record, 'status') as string | undefined) ?? ''
    if (recordStatus !== filter.status) return false
  }

  const createdAt = (
    getField(record, 'created_at') ??
    getField(record, 'started_at') ??
    getField(record, 'assessed_at') ??
    ''
  ) as string
  if (createdAt) {
    const d = new Date(createdAt)
    if (filter.dateFrom) {
      const from = new Date(filter.dateFrom)
      from.setHours(0, 0, 0, 0)
      if (d < from) return false
    }
    if (filter.dateTo) {
      const to = new Date(filter.dateTo)
      to.setHours(23, 59, 59, 999)
      if (d > to) return false
    }
  }

  if (filter.label.trim()) {
    const label = (
      (getField(record, 'label') ?? getField(record, 'workspace_name') ?? '') as string
    ).toLowerCase()
    if (!label.includes(filter.label.toLowerCase().trim())) return false
  }

  if (filter.search.trim()) {
    const q = filter.search.toLowerCase().trim()
    const candidates = [
      'session_id', 'job_id', 'id', 'label', 'workspace_name', 'workspace_url',
      'host', 'server', 'site_name', 'server_url', 'tenant_id', 'environment_url',
      'login_url', 'organization_url', 'database_name', 'site_url', 'company_name',
    ].map(k => getField(record, k)).filter(Boolean)
    const haystack = candidates.map(v => String(v).toLowerCase()).join(' ')
    if (!haystack.includes(q)) return false
  }

  return true
}

export function useSessionFilter<T>(sessions: T[]) {
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER)

  const filtered = useMemo(
    () => sessions.filter(s => matchRecord(s, filter)),
    [sessions, filter]
  )

  const setField = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setFilter(prev => ({ ...prev, [key]: value }))

  const reset = () => setFilter(INITIAL_FILTER)

  const isActive =
    filter.search !== '' ||
    filter.status !== 'all' ||
    filter.dateFrom !== '' ||
    filter.dateTo !== '' ||
    filter.label !== ''

  return { filter, filtered, setField, reset, isActive }
}
