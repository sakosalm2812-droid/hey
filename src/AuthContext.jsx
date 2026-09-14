import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { resolveAccountPlan } from './lib/accountRecords.js'
import { enablePersistenceSync, disablePersistenceSync, hydrateFromSupabase } from './lib/persistenceSync.js'
import { createAuthLifecycle } from './lib/authLifecycle.js'
import { resetAccountState } from './core/accountState.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, profile: null, loading: true, error: null })
  const lifecycle = useRef(null)

  useEffect(() => {
    const account = createAuthLifecycle({
      client: supabase,
      onState: (changes) => setState((previous) => ({ ...previous, ...changes })),
      resetAccountState,
      hydrate: hydrateFromSupabase,
      enableSync: enablePersistenceSync,
      disableSync: disablePersistenceSync,
    })
    lifecycle.current = account
    account.start()
    return () => {
      lifecycle.current = null
      account.stop()
    }
  }, [])

  const value = useMemo(() => ({
    ...state,
    user: state.session?.user ?? null,
    plan: resolveAccountPlan({ plan: state.profile?.plan, entitlements: state.profile?.entitlements || [] }),
    refreshProfile: (userId) => lifecycle.current?.refreshProfile(userId),
    retryAccount: () => lifecycle.current?.retry(),
    signUp: (email, password, displayName) => supabase.auth.signUp({
      email, password, options: { data: { display_name: displayName } },
    }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    }),
    updatePassword: (password) => supabase.auth.updateUser({ password }),
  }), [state])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
