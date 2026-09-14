// Supabase holds an auth lock while notifying subscribers. The callback must
// finish synchronously; profile and hydration work starts on the next task.
export function createAuthLifecycle({ client, onState, resetAccountState, hydrate, enableSync, disableSync, defer = setTimeout }) {
  let disposed = false;
  let revision = 0;
  let currentSession = null;
  let accountId;
  let subscription;
  let authEvents = 0;

  const active = (version) => !disposed && revision === version;
  const reportFailure = (error, version) => {
    if (!active(version)) return;
    disableSync();
    onState({ loading: false, error: error?.message || 'Your account could not be loaded.' });
  };

  async function readProfile(userId) {
    const { data, error } = await client.from('profiles')
      .select('id, display_name, plan, entitlements, hey_score, created_at, updated_at')
      .eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Your account profile is unavailable. Please try again.');
    return data;
  }

  function applySession(nextSession, force = false) {
    if (disposed) return;
    currentSession = nextSession;
    const nextId = nextSession?.user?.id || null;
    onState({ session: nextSession });
    if (nextId === accountId && !force) return;
    accountId = nextId;
    const version = ++revision;
    disableSync();
    resetAccountState();
    onState({ profile: null, error: null, loading: Boolean(nextId) });
    if (!nextId) return;
    defer(() => {
      if (!active(version)) return;
      void (async () => {
        const profile = await readProfile(nextId);
        if (!active(version)) return;
        await hydrate({ userId: nextId, isCurrent: () => active(version) });
        if (!active(version)) return;
        enableSync(nextId);
        onState({ profile, loading: false, error: null });
      })().catch((error) => reportFailure(error, version));
    }, 0);
  }

  return {
    start() {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        authEvents += 1;
        applySession(session);
      });
      subscription = data.subscription;
      const eventCount = authEvents;
      void client.auth.getSession().then(({ data, error }) => {
        if (disposed || eventCount !== authEvents) return;
        if (error) throw error;
        applySession(data.session);
      }).catch((error) => reportFailure(error, revision));
    },
    retry() { applySession(currentSession, true); },
    async refreshProfile(userId = accountId) {
      const version = revision;
      if (!userId || userId !== accountId) return null;
      const profile = await readProfile(userId);
      if (!active(version)) return null;
      onState({ profile });
      return profile;
    },
    stop() {
      disposed = true;
      revision += 1;
      subscription?.unsubscribe();
      disableSync();
      resetAccountState();
    },
  };
}
