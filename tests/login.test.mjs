import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTs } from './load-ts.mjs';

const { createLoginController, createLoginState } = await loadTs('../src/services/login.ts');
const session = { serverUrl: 'https://life.example.test', token: 'session-token', user: { id: 1, account: 'alice', name: 'Alice' } };
const challenge = {
  captchaRequired: true, captchaId: 'a'.repeat(64), image: 'data:image/png;base64,test-image', expiresIn: 120,
};

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(overrides = {}) {
  const state = createLoginState('https://life.example.test');
  Object.assign(state, { username: 'alice', password: 'password' });
  const logins = [], captchaRequests = [], addresses = [], sessions = [];
  const timers = new Map();
  let clock = 1000, timerSequence = 0;
  const controller = createLoginController(state, {
    api(address) {
      addresses.push(address);
      return {
        async login(...args) { logins.push(args); return overrides.login ? overrides.login(...args) : session; },
        async getLoginCaptcha(username) { captchaRequests.push(username); return overrides.captcha ? overrides.captcha(username) : challenge; },
      };
    },
    loggedIn(value) { sessions.push(value); }, now: () => clock,
    setTimer(callback, delay) { const id = ++timerSequence; timers.set(id, { callback, when: clock + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  return {
    state, controller, logins, captchaRequests, addresses, sessions, timers,
    advance(milliseconds, runTimers = true) {
      clock += milliseconds;
      if (runTimers) for (const [id, timer] of timers) {
        if (timer.when <= clock) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('ordinary login requests no captcha and clears the password after success', async () => {
  const h = harness();
  await h.controller.submit();
  assert.deepEqual(h.logins, [['alice', 'password', undefined]]);
  assert.deepEqual(h.captchaRequests, []);
  assert.deepEqual(h.sessions, [session]);
  assert.equal(h.state.loading, false);
  assert.equal(h.state.password, '');
});

test('the server third-failure signal displays captcha without automatically retrying credentials', async () => {
  let attempts = 0;
  const h = harness({ login() {
    attempts++;
    throw Object.assign(new Error('用户名或密码错误'), { captchaRequired: attempts === 3 });
  } });
  for (let attempt = 1; attempt <= 3; attempt++) {
    h.state.password = 'incorrect-password';
    await h.controller.submit();
    assert.equal(h.logins.length, attempt);
    assert.equal(h.state.captchaRequired, attempt === 3);
  }
  assert.equal(h.state.captchaImage, challenge.image);
  assert.equal(h.state.captchaId, challenge.captchaId);
  assert.deepEqual(h.captchaRequests, ['alice']);
  assert.equal(h.state.captchaCode, '');
  assert.equal(h.state.password, '');
});

test('missing answer or expired captcha prevents credential submission', async () => {
  const h = harness();
  h.state.captchaRequired = true;
  await h.controller.refreshCaptcha();
  await h.controller.submit();
  assert.equal(h.logins.length, 0);
  assert.match(h.state.error, /5 位验证码/);
  assert.equal(h.state.captchaId, challenge.captchaId);
  h.state.captchaCode = 'ABC23';
  // A backgrounded WebView can delay timers. The submit-time clock check must
  // still reject the expired image even if its scheduled callback has not run.
  h.advance(120000, false);
  await h.controller.submit();
  assert.equal(h.logins.length, 0);
  assert.equal(h.state.captchaId, '');
  assert.match(h.state.error, /刷新/);
});

test('a submitted challenge is cleared immediately, blocks duplicates and is replaced after rejection', async () => {
  const pending = deferred();
  let issued = 0;
  const h = harness({
    login: () => pending.promise,
    captcha: () => ({ ...challenge, captchaId: (++issued === 1 ? 'a' : 'b').repeat(64) }),
  });
  h.state.captchaRequired = true;
  await h.controller.refreshCaptcha();
  h.state.captchaCode = 'ABC23';
  const completion = h.controller.submit();
  assert.equal(h.state.loading, true);
  assert.equal(h.state.captchaId, '');
  assert.equal(h.state.captchaImage, '');
  assert.equal(h.state.captchaCode, '');
  await h.controller.submit();
  await h.controller.refreshCaptcha();
  assert.equal(h.logins.length, 1);
  assert.equal(h.captchaRequests.length, 1);
  assert.deepEqual(h.logins[0][2], { captchaId: 'a'.repeat(64), captchaCode: 'ABC23' });
  pending.reject(Object.assign(new Error('验证码错误或已过期'), { captchaRequired: true, code: 'CAPTCHA_INVALID' }));
  await completion;
  assert.equal(h.state.captchaId, 'b'.repeat(64));
  assert.equal(h.state.captchaCode, '');
  assert.equal(h.state.password, '');
  assert.equal(h.state.loading, false);
  assert.equal(h.state.captchaLoading, false);
  assert.equal(h.sessions.length, 0);
});

test('captcha loading failure cannot downgrade to a credential-only login and can be retried', async () => {
  let unavailable = true;
  const h = harness({ captcha: () => { if (unavailable) throw new Error('服务暂不可用'); return challenge; } });
  h.state.captchaRequired = true;
  await h.controller.refreshCaptcha();
  assert.match(h.state.captchaError, /服务暂不可用/);
  assert.equal(h.state.captchaRequired, true);
  await h.controller.submit();
  assert.equal(h.logins.length, 0);
  unavailable = false;
  await h.controller.refreshCaptcha();
  assert.equal(h.state.captchaError, '');
  assert.equal(h.state.captchaId, challenge.captchaId);
});

test('an authoritative captcha-not-required response allows the next normal login', async () => {
  const h = harness({ captcha: () => ({ captchaRequired: false }) });
  h.state.captchaRequired = true;
  await h.controller.refreshCaptcha();
  assert.equal(h.state.captchaRequired, false);
  await h.controller.submit();
  assert.equal(h.sessions.length, 1);
});

test('changing account or server invalidates the challenge and ignores an earlier image response', async () => {
  for (const field of ['username', 'serverUrl']) {
    const pending = deferred();
    const h = harness({ captcha: () => pending.promise });
    h.state.captchaRequired = true;
    const completion = h.controller.refreshCaptcha();
    h.state[field] = field === 'username' ? 'bob' : 'https://other.example.test';
    h.controller.identityChanged();
    assert.equal(h.state.password, '');
    assert.equal(h.state.captchaRequired, false);
    assert.equal(h.state.captchaLoading, false);
    pending.resolve(challenge);
    await completion;
    assert.equal(h.state.captchaId, '');
    assert.equal(h.state.captchaImage, '');
    assert.equal(h.timers.size, 0);
  }
});

test('the latest image refresh wins over an earlier slow request', async () => {
  const pending = deferred();
  let requests = 0;
  const h = harness({ captcha: () => ++requests === 1 ? pending.promise : { ...challenge, captchaId: 'b'.repeat(64) } });
  h.state.captchaRequired = true;
  const first = h.controller.refreshCaptcha();
  await h.controller.refreshCaptcha();
  assert.equal(h.state.captchaId, 'b'.repeat(64));
  pending.resolve(challenge);
  await first;
  assert.equal(h.state.captchaId, 'b'.repeat(64));
  assert.equal(h.timers.size, 1);
});

test('expiry clears the one-use answer and image and leaves a refresh prompt', async () => {
  const h = harness();
  h.state.captchaRequired = true;
  await h.controller.refreshCaptcha();
  h.state.captchaCode = 'ABC23';
  h.advance(120000);
  assert.equal(h.state.captchaId, '');
  assert.equal(h.state.captchaImage, '');
  assert.equal(h.state.captchaCode, '');
  assert.match(h.state.captchaError, /已过期/);
  assert.equal(h.state.captchaRequired, true);
});

test('an image decode failure blocks login and stale image failures cannot clear a replacement', async () => {
  let issued = 0;
  const h = harness({ captcha: () => ({ ...challenge, captchaId: (++issued === 1 ? 'a' : 'b').repeat(64) }) });
  h.state.captchaRequired = true;
  await h.controller.refreshCaptcha();
  h.controller.captchaImageFailed('a'.repeat(64));
  assert.equal(h.state.captchaRequired, true);
  assert.equal(h.state.captchaId, '');
  assert.match(h.state.captchaError, /未能显示/);
  await h.controller.submit();
  assert.equal(h.logins.length, 0);
  await h.controller.refreshCaptcha();
  h.controller.captchaImageFailed('a'.repeat(64));
  assert.equal(h.state.captchaId, 'b'.repeat(64));
});

test('network errors after a challenged login require a fresh image without replaying the login', async () => {
  const h = harness({ login: () => { throw new Error('无法连接服务'); } });
  h.state.captchaRequired = true;
  await h.controller.refreshCaptcha();
  h.state.captchaCode = 'ABC23';
  await h.controller.submit();
  assert.equal(h.logins.length, 1);
  assert.equal(h.captchaRequests.length, 2);
  assert.equal(h.state.captchaRequired, true);
  assert.equal(h.state.captchaCode, '');
});

test('leaving the page clears secrets and suppresses late login and image responses', async () => {
  for (const action of ['login', 'captcha']) {
    const pending = deferred();
    const h = harness({ [action]: () => pending.promise });
    h.state.captchaRequired = action === 'captcha';
    const completion = action === 'login' ? h.controller.submit() : h.controller.refreshCaptcha();
    h.state.captchaCode = 'ABC23';
    h.controller.dispose();
    pending.resolve(action === 'login' ? session : challenge);
    await completion;
    assert.equal(h.state.password, '');
    assert.equal(h.state.captchaCode, '');
    assert.equal(h.state.captchaId, '');
    assert.equal(h.state.captchaImage, '');
    assert.equal(h.sessions.length, 0);
    assert.equal(h.timers.size, 0);
    await h.controller.submit();
    await h.controller.refreshCaptcha();
    assert.equal(h.logins.length, action === 'login' ? 1 : 0);
  }
});
