import { PublicClientApplication, InteractionRequiredAuthError, type Configuration } from '@azure/msal-browser'

const ARM_SCOPE = 'https://management.azure.com/user_impersonation'

export type PalAuthErrorKind = 'not_configured' | 'popup_blocked' | 'consent_required' | 'unknown'

export class PalAuthError extends Error {
  kind: PalAuthErrorKind
  constructor(kind: PalAuthErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

let msalInstance: PublicClientApplication | null = null
let msalClientId: string | null = null

async function getMsalInstance(clientId: string, tenantId: string): Promise<PublicClientApplication> {
  if (msalInstance && msalClientId === clientId) return msalInstance

  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    },
    cache: { cacheLocation: 'sessionStorage' },
  }
  const instance = new PublicClientApplication(config)
  await instance.initialize()
  msalInstance = instance
  msalClientId = clientId
  return instance
}

/**
 * Acquires an Azure AD access token scoped to Azure Resource Manager, from an
 * account with RBAC access in the client's tenant. Uses a popup so the caller
 * never leaves the report page (no full-page redirect / blocking spinner).
 */
export async function acquirePalToken(clientId: string, tenantId: string): Promise<string> {
  if (!clientId) {
    throw new PalAuthError('not_configured', 'PAL sign-in isn’t configured yet — the Azure AD app registration is missing.')
  }

  try {
    const instance = await getMsalInstance(clientId, tenantId)
    const accounts = instance.getAllAccounts()
    const request = { scopes: [ARM_SCOPE] }

    if (accounts.length > 0) {
      try {
        const result = await instance.acquireTokenSilent({ ...request, account: accounts[0] })
        return result.accessToken
      } catch (silentErr) {
        if (!(silentErr instanceof InteractionRequiredAuthError)) throw silentErr
      }
    }

    const result = await instance.acquireTokenPopup(request)
    return result.accessToken
  } catch (err: any) {
    const message = String(err?.errorCode || err?.message || '')
    if (message.includes('popup_window_error') || message.includes('user_cancelled')) {
      throw new PalAuthError('popup_blocked', 'The Microsoft sign-in popup was blocked or closed before completing. Allow popups for this site and try again.')
    }
    if (message.includes('consent_required') || message.includes('interaction_required')) {
      throw new PalAuthError('consent_required', 'Microsoft requires additional consent to continue. Please try again and approve the permissions requested.')
    }
    throw new PalAuthError('unknown', err?.message || 'Could not sign in with Microsoft.')
  }
}
