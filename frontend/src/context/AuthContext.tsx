import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../api/client'
import type { MeResponse } from '../types/api'

interface AuthContextValue {
  user: MeResponse | null
  token: string | null
  isLoading: boolean
  setToken: (token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem('sat_token'),
  )
  const [user, setUser] = useState<MeResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setUser(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    api.me()
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('sat_token')
        setTokenState(null)
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [token])

  function setToken(newToken: string) {
    localStorage.setItem('sat_token', newToken)
    setTokenState(newToken)
  }

  function logout() {
    localStorage.removeItem('sat_token')
    setTokenState(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
