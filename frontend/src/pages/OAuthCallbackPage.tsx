/**
 * OAuthCallbackPage — receives the JWT token that the backend passes after
 * completing the Microsoft / Google OAuth flow.
 *
 * Flow:
 *  1. Backend OAuth callback → RedirectResponse to /auth/callback?token=xxx
 *  2. This page reads ?token, stores it via AuthContext.setToken(), navigates to /
 *  3. On error (?oauth_error=...) → redirect to /login with an error message
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SplashScreen from '../components/ui/SplashScreen'

export default function OAuthCallbackPage() {
  const { setToken } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const oauthError = params.get('oauth_error')

    if (token) {
      setToken(token)
      navigate('/', { replace: true })
    } else {
      const msg = oauthError
        ? `OAuth sign-in failed: ${oauthError.replace(/_/g, ' ')}`
        : 'oauth_failed'
      navigate(`/login?oauth_error=${encodeURIComponent(msg)}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <SplashScreen message="Completing sign-in…" />
}
