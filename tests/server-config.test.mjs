import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { DEFAULT_API_BASE_URL, resolveServerConfig } = await loadTs('../src/config/server.ts');
const { createLifeApi } = await loadTs('../src/services/api.ts');

test('default cloud API is usable by both login and authenticated clients in release mode', () => {
  for (const value of [undefined, '', '   ']) {
    const config = resolveServerConfig(value);
    assert.deepEqual(config, { serverUrl: 'http://123.56.173.230', allowHttp: true });
    assert.doesNotThrow(() => createLifeApi(config));
    assert.doesNotThrow(() => createLifeApi({ ...resolveServerConfig(DEFAULT_API_BASE_URL), token: 'test-session' }));
  }
});

test('HTTPS build overrides are supported without permitting arbitrary release HTTP destinations', () => {
  assert.deepEqual(resolveServerConfig(' https://api.example.test/gateway '), {
    serverUrl: 'https://api.example.test/gateway', allowHttp: false,
  });
  for (const value of ['http://example.test', 'http://123.56.173.230:3000', 'http://123.56.173.230.example.test', 'http://127.0.0.1:3002']) {
    assert.throws(() => createLifeApi(resolveServerConfig(value)), /HTTPS/);
  }
});

test('only local development HTTP overrides are enabled in development mode', () => {
  for (const value of ['http://localhost:3002', 'http://127.0.0.1:3002', 'http://[::1]:3002', 'http://10.0.2.2:3002']) {
    assert.doesNotThrow(() => createLifeApi(resolveServerConfig(value, true)));
  }
  assert.throws(() => createLifeApi(resolveServerConfig('http://external.example.test', true)), /HTTPS/);
});

test('cloud configuration never allows embedded credentials, queries or fragments', () => {
  for (const value of ['http://user:password@123.56.173.230', 'http://123.56.173.230?token=private', 'http://123.56.173.230#private']) {
    assert.equal(resolveServerConfig(value).allowHttp, false);
    assert.throws(() => createLifeApi(resolveServerConfig(value)));
  }
});
