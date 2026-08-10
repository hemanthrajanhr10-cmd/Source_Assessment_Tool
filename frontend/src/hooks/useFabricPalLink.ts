import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiErrorMessage } from '../api/client'
import type { PalFailureReason, PalLinkSessionStatus } from '../types/api'

const FAILURE_COPY: Record<PalFailureReason, string> = {
  access_not_granted: 'UBTI doesn’t have access to this Azure tenant yet. Ask your Azure admin to grant UBTI a guest role, service principal, or Lighthouse delegation before connecting.',
  auth_error: 'The Microsoft sign-in didn’t complete successfully. Please try again.',
  wrong_tenant: 'The signed-in account belongs to a different Azure tenant than this assessment. Sign in with an account in the client’s tenant.',
  unknown: 'PAL connection isn’t available right now. Please try again shortly.',
}

const TERMINAL_STATES = new Set(['linked', 'failed'])

/**
 * Single source of truth for Fabric PAL link state — used by the start-screen
 * toggle's intent, the report-gating modal (device-code flow), and the status badge.
 */
export function useFabricPalLink(sessionId: string | undefined) {
  const queryClient = useQueryClient()
  const [psAuthId, setPsAuthId] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const statusQuery = useQuery({
    queryKey: ['fabric-pal-status', sessionId],
    queryFn: () => api.getFabricPalStatus(sessionId!).then(r => r.data),
    enabled: !!sessionId,
    refetchInterval: q => (q.state.data?.status === 'linking' ? 3000 : false),
  })

  const configQuery = useQuery({
    queryKey: ['fabric-pal-config'],
    queryFn: () => api.getFabricPalConfig().then(r => r.data),
    staleTime: Infinity,
  })

  const sessionQuery = useQuery({
    queryKey: ['fabric-pal-link-session', sessionId, psAuthId],
    queryFn: () => api.getFabricPalLinkStatus(sessionId!, psAuthId!).then(r => r.data),
    enabled: !!sessionId && !!psAuthId,
    refetchInterval: q => (q.state.data && TERMINAL_STATES.has(q.state.data.status) ? false : 2000),
  })

  const start = useCallback(async () => {
    if (!sessionId) return
    setStartError(null)
    try {
      const { data } = await api.startFabricPalLink(sessionId)
      setPsAuthId(data.ps_auth_id)
      if (TERMINAL_STATES.has(data.status)) {
        await queryClient.invalidateQueries({ queryKey: ['fabric-pal-status', sessionId] })
      }
    } catch (err) {
      setStartError(getApiErrorMessage(err))
    }
  }, [sessionId, queryClient])

  const cancel = useCallback(async () => {
    if (!sessionId || !psAuthId) return
    try {
      await api.cancelFabricPalLink(sessionId, psAuthId)
    } finally {
      setPsAuthId(null)
      await queryClient.invalidateQueries({ queryKey: ['fabric-pal-status', sessionId] })
    }
  }, [sessionId, psAuthId, queryClient])

  // Once the device-code session reaches a terminal state, refresh the
  // persisted status so the badge / gate everywhere else picks it up.
  const sessionStatus = sessionQuery.data?.status
  if (sessionId && sessionStatus && TERMINAL_STATES.has(sessionStatus)) {
    const cacheKey = ['fabric-pal-status', sessionId]
    const cached = queryClient.getQueryData<{ status?: string }>(cacheKey)
    if (cached?.status !== 'linked' && sessionStatus === 'linked') {
      queryClient.invalidateQueries({ queryKey: cacheKey })
    }
  }

  const status = statusQuery.data?.status ?? 'not_linked'
  const failureReason = statusQuery.data?.failure_reason ?? sessionQuery.data?.failure_reason ?? null
  const failureMessage = startError ?? (failureReason ? FAILURE_COPY[failureReason] : null)

  const linkStage: PalLinkSessionStatus | 'idle' = sessionQuery.data?.status ?? (psAuthId ? 'starting' : 'idle')

  const deviceCode = sessionQuery.data?.user_code && sessionQuery.data?.verification_url
    ? {
        userCode: sessionQuery.data.user_code,
        verificationUrl: sessionQuery.data.verification_url,
        expiresAt: sessionQuery.data.expires_at ?? null,
      }
    : null

  return {
    status,
    failureReason,
    failureMessage,
    linkedAt: statusQuery.data?.linked_at ?? null,
    linkStage,
    deviceCode,
    isLoadingStatus: statusQuery.isLoading,
    organizationName: configQuery.data?.organization_name,
    docsUrl: configQuery.data?.docs_url ?? 'https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/link-partner-id',
    start,
    cancel,
    refresh: () => statusQuery.refetch(),
  }
}
