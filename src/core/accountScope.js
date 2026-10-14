let activeScope = "anonymous";
const listeners = new Set();

export function getAccountScope() {
  return activeScope;
}

export function setAccountScope(accountId) {
  const nextScope = accountId ? `account:${accountId}` : "anonymous";
  if (nextScope === activeScope) return;
  activeScope = nextScope;
  listeners.forEach((listener) => listener());
}

export function subscribeAccountScope(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccountStorageKey(key, scope = activeScope) {
  return `hey_scoped:${encodeURIComponent(scope)}:${key}`;
}
