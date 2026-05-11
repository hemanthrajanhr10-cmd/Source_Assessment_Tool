/**
 * Connects to the Fabric assessment progress stream via fetch-based SSE
 * (fetch supports Authorization headers; native EventSource does not).
 * Falls back to polling every 2s if SSE is unavailable.
 * Auto-reconnects up to MAX_RETRIES times on connection drop.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssessmentProgressState } from '../types/api'

const POLL_INTERVAL = 2000
const MAX_RETRIES = 3
const BASE_URL = import.meta.env.VITE_API_URL || ''

function getToken(): string | null {
  return localStorage.getItem('sat_token')
}

export function useAssessmentProgress(sessionId: string | null) {
  const [progress, setProgress] = useState<AssessmentProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const retryCount = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(true)

  const isTerminal = (status?: string) =>
    status === 'completed' || status === 'failed' || status === 'cancelled'

  const poll = useCallback(async () => {
    if (!sessionId || !activeRef.current) return
    try {
      const token = getToken()
      const res = await fetch(`${BASE_URL}/api/v1/fabric/sessions/${sessionId}/progress`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AssessmentProgressState = await res.json()
      setProgress(data)
      setError(null)
      if (!isTerminal(data.status) && activeRef.current) {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL)
      }
    } catch (e) {
      setError((e as Error).message)
      if (activeRef.current) {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL)
      }
    }
  }, [sessionId])

  const connectSSE = useCallback(() => {
    if (!sessionId || !activeRef.current) return
    const token = getToken()
    if (!token) { poll(); return }

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const url = `${BASE_URL}/api/v1/fabric/sessions/${sessionId}/progress/stream?token=${encodeURIComponent(token)}`

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (activeRef.current) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data:')) {
              const raw = line.slice(5).trim()
              if (!raw) continue
              try {
                const data: AssessmentProgressState = JSON.parse(raw)
                setProgress(data)
                setError(null)
                retryCount.current = 0
                if (isTerminal(data.status)) return
              } catch { /* ignore parse errors */ }
            }
          }
        }
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return
        // SSE failed — fall back to polling or retry
        if (retryCount.current < MAX_RETRIES && activeRef.current) {
          retryCount.current += 1
          const delay = 1000 * retryCount.current
          pollTimerRef.current = setTimeout(connectSSE, delay)
        } else {
          // Give up SSE, fall back to polling indefinitely
          poll()
        }
      })
  }, [sessionId, poll])

  useEffect(() => {
    if (!sessionId) return
    activeRef.current = true
    retryCount.current = 0

    connectSSE()

    return () => {
      activeRef.current = false
      abortRef.current?.abort()
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [sessionId, connectSSE])

  return { progress, error }
}
