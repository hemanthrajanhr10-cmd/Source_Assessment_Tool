/**
 * Date/time formatting helpers.
 *
 * The backend stores all timestamps in UTC but returns ISO strings without a
 * timezone suffix (e.g. "2026-04-20T16:52:38.379901"). JavaScript's Date
 * constructor treats suffix-less strings as LOCAL time, which gives wrong
 * results for users in any timezone.
 *
 * toUtcDate() appends "Z" when missing so JS always parses as UTC.
 * All formatters below convert UTC → the browser's local timezone automatically.
 */

/** Parse an ISO string (with or without timezone suffix) as UTC. */
function toUtcDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  // If already has timezone info (+HH:MM or Z), use as-is; otherwise append Z
  const normalized = /[Z+\-]\d*$/.test(iso.trim()) ? iso : iso + 'Z'
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? null : d
}

/** Full date + time in browser local timezone, e.g. "21 Apr 2026, 10:35:47 AM" */
export function formatDateTime(iso: string | null | undefined): string {
  const d = toUtcDate(iso)
  if (!d) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/** Date only in browser local timezone, e.g. "21 Apr 2026" */
export function formatDate(iso: string | null | undefined): string {
  const d = toUtcDate(iso)
  if (!d) return '—'
  return d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

/** Time only in browser local timezone, e.g. "10:35:47 AM" */
export function formatTime(iso: string | null | undefined): string {
  const d = toUtcDate(iso)
  if (!d) return '—'
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/** Elapsed duration between two ISO timestamps (or now if end is null). */
export function elapsed(startIso: string | null | undefined, endIso?: string | null): string {
  const start = toUtcDate(startIso)
  if (!start) return '—'
  const end = toUtcDate(endIso) ?? new Date()
  const ms = end.getTime() - start.getTime()
  if (ms < 0) return '<1s'
  if (ms < 1000) return '<1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** "X ago" relative time (e.g. for gateway last-seen). Falls back to formatDate for old dates. */
export function timeAgo(iso: string | null | undefined): string {
  const d = toUtcDate(iso)
  if (!d) return 'Never'
  const diff = Date.now() - d.getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60)  return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return formatDate(iso)
}
