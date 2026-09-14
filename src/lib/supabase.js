import { createClient } from '@supabase/supabase-js'

const isNodeTest = typeof process !== 'undefined' && process?.env && process.env.NODE_ENV === 'test'

const supabaseUrl = isNodeTest ? (process?.env?.VITE_SUPABASE_URL || '') : (import.meta.env?.VITE_SUPABASE_URL || '')
const supabaseAnonKey = isNodeTest ? (process?.env?.VITE_SUPABASE_ANON_KEY || '') : (import.meta.env?.VITE_SUPABASE_ANON_KEY || '')

const createUnavailableClient = () => {
  const unavailable = { data: null, error: { message: 'HEY needs its Supabase connection configured.' } };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return Promise.resolve(unavailable).then.bind(Promise.resolve(unavailable));
      return () => query;
    },
  });
  return {
    from: () => query,
    rpc: async () => unavailable,
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => unavailable,
      signUp: async () => unavailable,
      resetPasswordForEmail: async () => unavailable,
      updateUser: async () => unavailable,
      signOut: async () => ({ error: null }),
    },
  };
};

const supabaseClient = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createUnavailableClient()

export const supabase = supabaseClient
export { supabaseClient as default }
export { supabaseClient }