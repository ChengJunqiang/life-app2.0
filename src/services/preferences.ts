interface PreferenceScope {
  serverUrl: string;
  userId: number;
}

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function localPreferenceStorage(): PreferenceStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}

function incomePreferenceKey(scope: PreferenceScope) {
  if (!Number.isSafeInteger(scope.userId) || scope.userId <= 0) return;
  try {
    const url = new URL(scope.serverUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return;
    const server = url.href.replace(/\/+$/, '');
    return `life:display:hide-income:v1:${encodeURIComponent(server)}:${scope.userId}`;
  } catch { return; }
}

// Persist only a display preference. Sessions, credentials and amounts remain
// in memory, and a different account/server starts with income hidden.
export function readHideIncomePreference(scope: PreferenceScope, storage = localPreferenceStorage()) {
  try {
    const key = incomePreferenceKey(scope);
    return !key || !storage || storage.getItem(key) !== 'false';
  } catch { return true; }
}

export function saveHideIncomePreference(scope: PreferenceScope, hideIncome: boolean, storage = localPreferenceStorage()) {
  try {
    const key = incomePreferenceKey(scope);
    if (!key || !storage || typeof hideIncome !== 'boolean') return false;
    storage.setItem(key, String(hideIncome));
    return true;
  } catch { return false; }
}
