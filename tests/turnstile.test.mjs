import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTs } from './load-ts.mjs';

const { challengeFrameUrl, challengeParentOrigin, createChallengeChannel, readChallengeMessage } = await loadTs('../src/services/turnstile.ts');
const channel = 'a'.repeat(32);
const origin = 'https://api.example.test';
const frame = {};
const expected = { origin, source: frame, channel };
const message = { type: 'life-turnstile', channel, status: 'success', token: 'verified-token' };

test('challenge metadata stays in the fragment and preserves gateway prefixes', () => {
  const url = new URL(challengeFrameUrl(`${origin}/gateway`, 'capacitor://localhost', channel));
  assert.equal(url.pathname, '/gateway/life/auth/challenge');
  assert.equal(url.search, '');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(url.hash.slice(1))), { channel, parentOrigin: 'capacitor://localhost' });
});

test('challenge URLs fail closed for non-HTTPS, credentials and malformed channels', () => {
  for (const server of ['http://api.example.test', 'https://user:secret@api.example.test', 'https://api.example.test#other', 'https://api.example.test?token=secret', 'javascript:alert(1)']) {
    assert.throws(() => challengeFrameUrl(server, 'https://app.example.test', channel));
  }
  assert.throws(() => challengeFrameUrl(origin, 'https://app.example.test', 'bad-channel'));
  assert.equal(new URL(challengeFrameUrl('http://127.0.0.1:3000', 'http://localhost:5174', channel, true)).protocol, 'http:');
});

test('only an explicit packaged iOS origin can recover from opaque origin serialization', () => {
  assert.equal(challengeParentOrigin({ protocol: 'capacitor:', host: 'localhost', origin: 'null' }), 'capacitor://localhost');
  assert.equal(challengeParentOrigin({ protocol: 'https:', host: 'localhost', origin: 'https://localhost' }), 'https://localhost');
  for (const location of [
    { protocol: 'file:', host: '', origin: 'null' },
    { protocol: 'capacitor:', host: 'attacker.example', origin: 'null' },
    { protocol: 'https:', host: 'api.example.test', origin: 'null' },
  ]) assert.throws(() => challengeParentOrigin(location), /不支持安全验证/);
});

test('challenge channel uses cryptographic bytes rather than clock or Math.random', () => {
  const calls = [];
  const result = createChallengeChannel({ getRandomValues(bytes) { calls.push(bytes.length); return bytes.fill(1); } });
  assert.deepEqual(calls, [16]);
  assert.equal(result, '01'.repeat(16));
});

test('a token is accepted only from the current frame, expected API origin and current channel', () => {
  assert.deepEqual(readChallengeMessage({ origin, source: frame, data: message }, expected), message);
  const invalidEvents = [
    { origin: 'https://attacker.example', source: frame, data: message },
    { origin: 'null', source: frame, data: message },
    { origin, source: {}, data: message },
    { origin, source: null, data: message },
    { origin, source: frame, data: { ...message, channel: 'b'.repeat(32) } },
    { origin, source: frame, data: { ...message, type: 'other' } },
    { origin, source: frame, data: { ...message, status: 'unknown' } },
    { origin, source: frame, data: { ...message, token: '' } },
    { origin, source: frame, data: { ...message, token: 'x'.repeat(2049) } },
    { origin, source: frame, data: null },
    { origin, source: frame, data: 'verified-token' },
  ];
  for (const event of invalidEvents) assert.equal(readChallengeMessage(event, expected), undefined);
  assert.equal(readChallengeMessage({ origin, source: null, data: message }, { ...expected, source: null }), undefined);
});

test('expired and error messages never carry an accepted token', () => {
  for (const status of ['ready', 'expired', 'error']) {
    const result = readChallengeMessage({ origin, source: frame, data: { ...message, status } }, expected);
    assert.deepEqual(result, { type: 'life-turnstile', channel, status });
  }
});
