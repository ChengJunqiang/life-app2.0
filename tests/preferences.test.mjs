import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { readHideIncomePreference, saveHideIncomePreference } = await loadTs('../src/services/preferences.ts');
const account = { serverUrl: 'http://123.56.173.230', userId: 42 };

function memoryStorage() {
  const entries = new Map();
  return {
    entries,
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
  };
}

test('income is hidden for a new account and persists explicit visibility changes', () => {
  const storage = memoryStorage();
  assert.equal(readHideIncomePreference(account, storage), true);
  assert.equal(saveHideIncomePreference(account, false, storage), true);
  assert.equal(readHideIncomePreference(account, storage), false);
  assert.equal(saveHideIncomePreference(account, true, storage), true);
  assert.equal(readHideIncomePreference(account, storage), true);
  assert.deepEqual([...storage.entries.values()], ['true']);
});

test('preferences are isolated by account, server and API prefix', () => {
  const storage = memoryStorage();
  saveHideIncomePreference(account, false, storage);
  assert.equal(readHideIncomePreference({ ...account, userId: 43 }, storage), true);
  assert.equal(readHideIncomePreference({ ...account, serverUrl: 'https://other.example.test' }, storage), true);
  assert.equal(readHideIncomePreference({ ...account, serverUrl: 'http://123.56.173.230/prefix' }, storage), true);
  assert.equal(readHideIncomePreference({ ...account, serverUrl: 'http://123.56.173.230:80/' }, storage), false);
});

test('invalid stored values and unavailable storage retain the private default', () => {
  for (const stored of [null, '', 'FALSE', '0', 'null', '{}', 'true']) {
    assert.equal(readHideIncomePreference(account, { getItem: () => stored }), true);
  }
  const broken = { getItem() { throw new Error('Read blocked'); }, setItem() { throw new Error('Write blocked'); } };
  assert.equal(readHideIncomePreference(account, broken), true);
  assert.equal(saveHideIncomePreference(account, false, broken), false);
});

test('invalid account scopes cannot read or write another preference', () => {
  let reads = 0;
  let writes = 0;
  const storage = { getItem() { reads++; return 'false'; }, setItem() { writes++; } };
  for (const scope of [
    { ...account, userId: 0 }, { ...account, userId: 1.5 },
    { ...account, serverUrl: 'not-a-url' }, { ...account, serverUrl: 'http://user:password@example.test' },
    { ...account, serverUrl: 'http://123.56.173.230?token=private' },
  ]) {
    assert.equal(readHideIncomePreference(scope, storage), true);
    assert.equal(saveHideIncomePreference(scope, false, storage), false);
  }
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test('browser storage access restrictions do not prevent applying the in-memory preference', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    get localStorage() { throw new Error('Browser storage unavailable'); },
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  });
  assert.equal(readHideIncomePreference(account), true);
  assert.equal(saveHideIncomePreference(account, false), false);
});
