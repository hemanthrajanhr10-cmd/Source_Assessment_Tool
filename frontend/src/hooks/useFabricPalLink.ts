import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiErrorMessage } from '../api/client'
import { acquirePalToken, PalAuthError } from '../utils/palAuth'
import type { PalFailureReason } from '../types/api'

const FAILURE_COPY: Record<PalFailureReason, string> = {
  access_not_granted: 'UBTI doesn’t have access to this Azure tenant yet. Ask your Azure admin to grant UBTI a guest role, service principal, or Lighthouse delegation before connecting.',
  auth_error: 'The Microsoft sign-in didn’t produce a usable token. Please try signing in again.',
  wrong_tenant: 'The signed-in account belongs to a different Azure tenant than this assessment. Sign in with an account in the client’s tenant.',
  unknown: 'PAL connection isn’t available right now. Please try again shortly.',
}

/**
 * Single source of truth for Fabric PAL link state — used by the start-screen
 * toggle, the report-gating modal, and the status badge.
 */
export function useFabricPalLink(sessionId: string | undefined) {
  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

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

  const connect = useCallback(async () => {
    if (!sessionId) return
    setAuthError(null)
    setConnecting(true)
    try {
      const config = configQuery.data ?? await api.getFabricPalConfig().then(r => r.data)
      if (!config) throw new Error('PAL configuration could not be loaded')
      const token = await acquirePalToken(config.client_id, config.tenant_id)
      const { data } = await api.linkFabricPal(sessionId, token)
      queryClient.setQueryData(['fabric-pal-status', sessionId], data)
      await queryClient.invalidateQueries({ queryKey: ['fabric-pal-status', sessionId] })
    } catch (err) {
      if (err instanceof PalAuthError) {
        setAuthError(err.message)
      } else {
        setAuthError(getApiErrorMessage(err))
      }
    } finally {
      setConnecting(false)
    }
  }, [sessionId, configQuery.data, queryClient])

  const status = statusQuery.data?.status ?? 'not_linked'
  const failureReason = statusQuery.data?.failure_reason ?? null
  const failureMessage = authError ?? (failureReason ? FAILURE_COPY[failureReason] : null)

  return {
    status,
    failureReason,
    failureMessage,
    linkedAt: statusQuery.data?.linked_at ?? null,
    connecting,
    isLoadingStatus: statusQuery.isLoading,
    organizationName: configQuery.data?.organization_name,
    docsUrl: configQuery.data?.docs_url ?? 'https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/link-partner-id',
    connect,
    refresh: () => statusQuery.refetch(),
  }
}
