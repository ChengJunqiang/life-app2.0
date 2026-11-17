import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadTs } from './load-ts.mjs';

const { createLifeApi, normalizeServerUrl, ApiError } = await loadTs('../src/services/api.ts');
const serverUrl = 'https://life.example.test';
const user = { id: 7, account: 'johnson', name: 'Johnson', isAdmin: 1, roles: ['user'] };
const item = {
  id: '42', item: '早餐', itemType: 1, money: '12.30', type: '0', itemDate: '2026-11-17',
  remark: null, payType: 2, address: null, imageUrl: null,
  createId: '7', createUser: 'Johnson', createTime: '2026-11-17 08:00:00', updateTime: '2026-11-17 08:00:00',
};
const draft = {
  item: '  早餐  ', itemType: '1', money: 12.3, type: 0, itemDate: '2026-11-17',
  remark: '咖啡', payType: '2', address: '', imageUrl: '',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function withFetch(handler, callback) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: new URL(String(url)), init, headers: new Headers(init.headers) };
    calls.push(call);
    return handler(call, calls.length);
  };
  try { await callback(calls); }
  finally { globalThis.fetch = original; }
}

function expectError(check) {
  return (error) => {
    assert.ok(error instanceof ApiError);
    check(error);
    return true;
  };
}

describe('life-api contract', { concurrency: false }, () => {
  test('loads login security configuration without exposing an existing session token', async () => {
    const configuration = { turnstile: { enabled: true, siteKey: 'public-site-key' } };
    await withFetch(() => json({ status: 200, data: configuration }), async (calls) => {
      assert.deepEqual(await createLifeApi({ serverUrl, token: 'old-session' }).getLoginConfiguration(), configuration);
      assert.equal(calls[0].url.pathname, '/life/auth/config');
      assert.equal(calls[0].url.search, '');
      assert.equal(calls[0].headers.get('Authorization'), null);
    });
  });

  test('missing or malformed security configuration never silently disables verification', async () => {
    for (const body of [
      {}, { status: 200 }, { status: 200, data: {} },
      { status: 200, data: { turnstile: { enabled: 'false', siteKey: '' } } },
      { status: 200, data: { turnstile: { enabled: true, siteKey: '' } } },
    ]) {
      await withFetch(() => json(body), async () => {
        await assert.rejects(createLifeApi({ serverUrl }).getLoginConfiguration(), ApiError);
      });
    }
    await withFetch(() => json({ status: 200, data: { turnstile: { enabled: false, siteKey: '' } } }), async () => {
      assert.deepEqual(await createLifeApi({ serverUrl }).getLoginConfiguration(), { turnstile: { enabled: false, siteKey: '' } });
    });
  });

  test('login sends the challenge token in JSON and retains current menu permissions', async () => {
    const permitted = { ...user, menuPermissions: ['item'] };
    await withFetch((call, index) => index === 1
      ? json({ status: 200, data: true, message: 'session-token' })
      : json({ status: 200, data: permitted }), async (calls) => {
      const session = await createLifeApi({ serverUrl }).login('johnson', 'example-password', 'challenge-token');
      assert.deepEqual(JSON.parse(calls[0].init.body), { username: 'johnson', password: 'example-password', turnstileToken: 'challenge-token' });
      assert.equal(calls[0].url.search, '');
      assert.deepEqual(session.user.menuPermissions, ['item']);
    });
  });

  for (const status of [401, 403, 429, 503]) {
    test(`HTTP ${status} login failure is useful and does not expire another session`, async () => {
      let expired = 0;
      const message = status === 401 ? '用户名或密码错误' : status === 403 ? '安全验证未通过' : status === 429 ? '请求过于频繁，请稍后重试' : '服务暂不可用';
      await withFetch(() => json({ status, message }, status), async (calls) => {
        await assert.rejects(createLifeApi({ serverUrl, token: 'another-session', onUnauthorized: () => { expired += 1; } }).login('johnson', 'password', 'challenge'), expectError((error) => {
          assert.equal(error.status, status);
          assert.equal(error.uncertain, false);
          assert.equal(error.message, message);
          assert.doesNotMatch(error.message, /登录已过期|账目|核对/);
        }));
        assert.equal(calls.length, 1);
        assert.equal(expired, 0);
      });
    });
  }

  test('query parameters still work on iOS without URLSearchParams.size', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'size');
    try {
      delete URLSearchParams.prototype.size;
      await withFetch(() => json({ data: [{ key: 1, value: '餐饮' }] }), async (calls) => {
        await createLifeApi({ serverUrl }).getDictionary('item_type');
        assert.equal(calls[0].url.searchParams.get('type'), 'item_type');
      });
    } finally {
      if (descriptor) Object.defineProperty(URLSearchParams.prototype, 'size', descriptor);
    }
  });
  test('login reads the token from message, then verifies the user with Bearer auth', async () => {
    await withFetch((call, index) => index === 1
      ? json({ status: 200, data: true, message: 'new-session-token' })
      : json({ status: 200, data: user }), async (calls) => {
      const session = await createLifeApi({ serverUrl: `${serverUrl}/life/`, token: 'old-token' }).login('johnson', 'example-password');
      assert.deepEqual(session, { serverUrl, token: 'new-session-token', user });
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url.pathname, '/life/auth/login');
      assert.equal(calls[0].init.method, 'POST');
      assert.equal(calls[0].headers.get('Authorization'), null);
      assert.deepEqual(JSON.parse(calls[0].init.body), { username: 'johnson', password: 'example-password' });
      assert.equal(calls[1].url.pathname, '/life/auth/info');
      assert.equal(calls[1].headers.get('Authorization'), 'Bearer new-session-token');
      assert.equal(calls[1].url.search, '');
    });
  });

  test('incorrect credentials never become a session and do not request user info', async () => {
    await withFetch(() => json({ status: 200, data: false, message: '用户名或密码错误' }), async (calls) => {
      await assert.rejects(createLifeApi({ serverUrl }).login('johnson', 'wrong-password'), expectError((error) => {
        assert.match(error.message, /用户名或密码错误/);
        assert.equal(error.uncertain, false);
      }));
      assert.equal(calls.length, 1);
    });
  });

  test('a malformed login token is rejected before user-info lookup', async () => {
    await withFetch(() => json({ status: 200, data: true, message: '' }), async (calls) => {
      await assert.rejects(createLifeApi({ serverUrl }).login('johnson', 'password'), /登录响应格式/);
      assert.equal(calls.length, 1);
    });
  });

  test('a login network failure does not show an uncertain ledger-write warning', async () => {
    await withFetch(() => { throw new TypeError('Failed to fetch'); }, async (calls) => {
      await assert.rejects(createLifeApi({ serverUrl }).login('johnson', 'password'), expectError((error) => {
        assert.equal(error.uncertain, false);
        assert.match(error.message, /无法连接服务/);
        assert.doesNotMatch(error.message, /账目|核对|勿重复提交/);
      }));
      assert.equal(calls.length, 1);
    });
  });

  for (const transportStatus of [200, 401]) {
    test(`HTTP ${transportStatus} authentication expiry invokes onUnauthorized once`, async () => {
      let expired = 0;
      await withFetch(() => json({ status: 401, message: 'expired' }, transportStatus), async (calls) => {
        const api = createLifeApi({ serverUrl, token: 'expired-session', onUnauthorized: () => { expired += 1; } });
        await assert.rejects(api.getCurrentUser(), expectError((error) => {
          assert.equal(error.status, 401);
          assert.equal(error.uncertain, false);
          assert.match(error.message, /登录已过期/);
        }));
        assert.equal(expired, 1);
        assert.equal(calls.length, 1);
      });
    });
  }

  test('HTTP 403 does not expire an otherwise valid session', async () => {
    let expired = 0;
    await withFetch(() => json({ status: 403 }, 403), async () => {
      const api = createLifeApi({ serverUrl, token: 'valid-session', onUnauthorized: () => { expired += 1; } });
      await assert.rejects(api.getCurrentUser(), expectError((error) => assert.equal(error.status, 403)));
      assert.equal(expired, 0);
    });
  });

  test('list query keeps zero-valued expense type, filters and pagination without leaking the token into the URL', async () => {
    await withFetch(() => json({ status: 200, data: [], count: 0 }), async (calls) => {
      await createLifeApi({ serverUrl, token: 'session' }).listItems({
        page: 2, limit: 20, type: 0, item: '早餐 & 午餐', itemType: '1', payType: '2',
        itemDateStart: '2026-11-01', itemDateEnd: '2026-11-30', remark: '出差/餐饮',
      });
      assert.equal(calls.length, 1);
      const { url, headers } = calls[0];
      assert.equal(url.pathname, '/life/items/query');
      assert.deepEqual(Object.fromEntries(url.searchParams), {
        page: '2', limit: '20', type: '0', item: '早餐 & 午餐', itemType: '1', payType: '2',
        itemDateStart: '2026-11-01', itemDateEnd: '2026-11-30', remark: '出差/餐饮',
      });
      assert.equal(headers.get('Authorization'), 'Bearer session');
      assert.equal(url.searchParams.has('token'), false);
    });
  });

  test('transfer types survive query serialization and empty filters are omitted', async () => {
    await withFetch(() => json({ data: [], count: 0 }), async (calls) => {
      const api = createLifeApi({ serverUrl });
      await api.listItems({ page: 1, limit: 20, type: 99, item: '', itemType: undefined });
      await api.listItems({ page: 1, limit: 20, type: 100 });
      assert.equal(calls[0].url.searchParams.get('type'), '99');
      assert.equal(calls[1].url.searchParams.get('type'), '100');
      assert.equal(calls[0].url.searchParams.has('item'), false);
      assert.equal(calls[0].url.searchParams.has('itemType'), false);
    });
  });

  test('MySQL decimal strings and numeric identifiers become numbers while transfer totals remain separate', async () => {
    await withFetch(() => json({
      status: 200, data: [item], count: '11', sum: '12.30', sumIncome: '1000.90',
      sumTransferOut: '2500.00', sumTransferIn: '4000.00',
    }), async () => {
      const result = await createLifeApi({ serverUrl }).listItems({ page: 1, limit: 20 });
      assert.equal(result.items[0].id, 42);
      assert.equal(result.items[0].createId, 7);
      assert.equal(result.items[0].money, 12.3);
      assert.equal(result.items[0].type, 0);
      assert.equal(result.items[0].itemType, '1');
      assert.equal(result.items[0].payType, '2');
      assert.equal(result.items[0].remark, '');
      assert.equal(result.count, 11);
      assert.equal(result.expense, 12.3);
      assert.equal(result.income, 1000.9);
      assert.equal(result.transferOut, 2500);
      assert.equal(result.transferIn, 4000);
    });
  });

  test('a malformed amount fails loudly instead of rendering NaN', async () => {
    await withFetch(() => json({ data: [{ ...item, money: 'not-a-number' }], count: 1 }), async () => {
      await assert.rejects(createLifeApi({ serverUrl }).listItems({ page: 1, limit: 20 }), /无效金额/);
    });
  });

  test('item details use the existing ID-based route', async () => {
    await withFetch(() => json({ status: 200, data: item }), async (calls) => {
      const result = await createLifeApi({ serverUrl, token: 'session' }).getItem(42);
      assert.equal(calls[0].url.pathname, '/life/items/query/42');
      assert.equal(result.id, 42);
      assert.equal(result.money, 12.3);
    });
  });

  test('create and update send only existing business fields, without offline sync or client-supplied ownership', async () => {
    await withFetch(() => json({ status: 200, message: '保存成功' }), async (calls) => {
      const api = createLifeApi({ serverUrl, token: 'session' });
      const untrusted = { ...draft, syncId: 'old-local-id', syncVersion: 9, localStatus: 'pending', createId: 999, createUser: 'admin' };
      await api.saveItem(untrusted);
      await api.saveItem({ ...untrusted, id: 42 });
      assert.equal(calls.length, 2);
      for (const [index, call] of calls.entries()) {
        assert.equal(call.url.pathname, index === 0 ? '/life/items/create' : '/life/items/update');
        assert.equal(call.init.method, index === 0 ? 'POST' : 'PUT');
        assert.equal(call.headers.get('Content-Type'), 'application/json');
        assert.equal(call.headers.get('Authorization'), 'Bearer session');
        assert.equal(call.url.pathname.includes('/sync'), false);
        assert.deepEqual(JSON.parse(call.init.body), { ...(index === 1 ? { id: 42 } : {}), ...draft, item: '早餐' });
      }
    });
  });

  test('delete sends a string ID in a JSON DELETE body accepted by the existing API', async () => {
    await withFetch(() => json({ status: 200 }), async (calls) => {
      await createLifeApi({ serverUrl, token: 'session' }).deleteItem(42);
      assert.equal(calls[0].url.pathname, '/life/items/delete');
      assert.equal(calls[0].init.method, 'DELETE');
      assert.deepEqual(JSON.parse(calls[0].init.body), { id: '42' });
    });
  });

  test('logout invalidates the server session using Bearer authorization', async () => {
    await withFetch(() => json({ status: 200 }), async (calls) => {
      await createLifeApi({ serverUrl, token: 'session' }).logout();
      assert.equal(calls[0].url.pathname, '/life/auth/logout');
      assert.equal(calls[0].init.method, 'POST');
      assert.deepEqual(JSON.parse(calls[0].init.body), {});
      assert.equal(calls[0].headers.get('Authorization'), 'Bearer session');
    });
  });

  test('dictionary response supports the existing missing-status shape and preserves zero keys', async () => {
    await withFetch(() => json({ data: [{ key: 1, value: '餐饮' }, { key: 0, value: '其他' }, { key: '', value: '无效' }] }), async (calls) => {
      const result = await createLifeApi({ serverUrl }).getDictionary('item_type');
      assert.deepEqual(result, [{ key: '1', value: '餐饮' }, { key: '0', value: '其他' }]);
      assert.equal(calls[0].url.pathname, '/life/dictionaries/options/query');
      assert.equal(calls[0].url.searchParams.get('type'), 'item_type');
    });
  });

  test('total report maps server fields directly and passes selected dates', async () => {
    await withFetch(() => json({ status: 200, total: '9999.99', yearTotal: '1234.56', monthTotal: '100.05', dayTotal: null, yearIncomeTotal: '4500.50' }), async (calls) => {
      const result = await createLifeApi({ serverUrl }).getTotalReport({ year: '2026', month: '2026-11', day: '2026-11-17' });
      assert.deepEqual(result, { total: 9999.99, yearTotal: 1234.56, monthTotal: 100.05, dayTotal: 0, yearIncomeTotal: 4500.5 });
      assert.equal(calls[0].url.pathname, '/life/items/reports/total/query');
      assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), { year: '2026', month: '2026-11', day: '2026-11-17' });
    });
  });

  test('monthly report maps expense value and income value2 without recomputing either', async () => {
    await withFetch(() => json({ status: 200, key: ['一月', '二月'], value: ['12.30', null], value2: ['100.50', '20.20'] }), async (calls) => {
      const result = await createLifeApi({ serverUrl }).getMonthlyReport('2026');
      assert.deepEqual(result, { months: ['一月', '二月'], expense: [12.3, 0], income: [100.5, 20.2] });
      assert.equal(calls[0].url.pathname, '/life/items/reports/monthly/query');
      assert.equal(calls[0].url.searchParams.get('year'), '2026');
    });
  });

  test('category report maps dictionary names and decimal totals from server data', async () => {
    await withFetch(() => json({ status: 200, key: ['餐饮'], value: ['12.30'], data: [{ key: '餐饮', value: '12.30' }] }), async (calls) => {
      assert.deepEqual(await createLifeApi({ serverUrl }).getCategoryReport('2026-11'), [{ name: '餐饮', amount: 12.3 }]);
      assert.equal(calls[0].url.pathname, '/life/items/reports/by-type/query');
      assert.equal(calls[0].url.searchParams.get('month'), '2026-11');
    });
  });

  test('a failed POST has an uncertain outcome and is not automatically retried', async () => {
    await withFetch(() => { throw new TypeError('Failed to fetch'); }, async (calls) => {
      await assert.rejects(createLifeApi({ serverUrl }).saveItem(draft), expectError((error) => {
        assert.equal(error.uncertain, true);
        assert.match(error.message, /核对，勿重复提交/);
      }));
      assert.equal(calls.length, 1);
    });
  });

  test('HTTP 200 without an explicit mutation acknowledgement is not treated as a saved item', async () => {
    await withFetch(() => json({}), async (calls) => {
      await assert.rejects(createLifeApi({ serverUrl }).saveItem(draft), expectError((error) => {
        assert.equal(error.uncertain, true);
        assert.match(error.message, /未收到服务端的操作确认/);
      }));
      assert.equal(calls.length, 1);
    });
  });

  test('failed GETs do not claim an uncertain write outcome', async () => {
    await withFetch(() => { throw new TypeError('Failed to fetch'); }, async (calls) => {
      await assert.rejects(createLifeApi({ serverUrl }).getCurrentUser(), expectError((error) => {
        assert.equal(error.uncertain, false);
        assert.match(error.message, /无法连接服务/);
      }));
      assert.equal(calls.length, 1);
    });
  });

  for (const transportStatus of [200, 500]) {
    test(`HTTP ${transportStatus} server failure after mutation is uncertain and never retried`, async () => {
      await withFetch(() => json({ status: 500, message: '数据库异常' }, transportStatus), async (calls) => {
        await assert.rejects(createLifeApi({ serverUrl }).saveItem(draft), expectError((error) => {
          assert.equal(error.status, 500);
          assert.equal(error.uncertain, true);
        }));
        assert.equal(calls.length, 1);
      });
    });
  }

  test('an HTML response reports a configuration error rather than pretending to be API data', async () => {
    await withFetch(() => new Response('<!doctype html><html>proxy page</html>', { headers: { 'Content-Type': 'text/html' } }), async () => {
      await assert.rejects(createLifeApi({ serverUrl }).getCurrentUser(), expectError((error) => {
        assert.equal(error.uncertain, false);
        assert.match(error.message, /life-api/);
      }));
    });
  });

  test('an unreadable mutation response is uncertain because the server may already have committed', async () => {
    await withFetch(() => new Response('<html>proxy error</html>'), async (calls) => {
      await assert.rejects(createLifeApi({ serverUrl }).saveItem(draft), expectError((error) => assert.equal(error.uncertain, true)));
      assert.equal(calls.length, 1);
    });
  });

  test('timeout aborts the request and does not retry a potentially committed POST', async () => {
    let signal;
    await withFetch((call) => new Promise((resolve, reject) => {
      signal = call.init.signal;
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }), async (calls) => {
      await assert.rejects(createLifeApi({ serverUrl, timeoutMs: 10 }).saveItem(draft), expectError((error) => {
        assert.equal(error.uncertain, true);
        assert.match(error.message, /请求超时/);
      }));
      assert.equal(signal.aborted, true);
      assert.equal(calls.length, 1);
    });
  });
});

describe('API address configuration', { concurrency: false }, () => {
  test('normalizes trailing slashes and a single existing /life prefix', () => {
    assert.equal(normalizeServerUrl('  https://life.example.test/life/  '), serverUrl);
    assert.equal(normalizeServerUrl('https://life.example.test/gateway/life'), `${serverUrl}/gateway`);
    assert.equal(normalizeServerUrl('https://life.example.test///'), serverUrl);
  });

  test('rejects plain HTTP by default, even for localhost', () => {
    assert.throws(() => createLifeApi({ serverUrl: 'http://127.0.0.1:3000' }), /HTTPS/);
    assert.throws(() => normalizeServerUrl('http://life.example.test'), /HTTPS/);
  });

  test('permits local-development HTTP only when explicitly enabled', async () => {
    await withFetch(() => json({ status: 200, data: user }), async (calls) => {
      await createLifeApi({ serverUrl: 'http://127.0.0.1:3000/life/', allowHttp: true }).getCurrentUser();
      assert.equal(calls[0].url.href, 'http://127.0.0.1:3000/life/auth/info');
    });
  });

  test('rejects credentials, query parameters, fragments and non-HTTP protocols', () => {
    for (const value of [
      'https://user:password@life.example.test',
      'https://life.example.test?token=secret',
      'https://life.example.test#token',
      'file:///tmp/life',
      'javascript:alert(1)',
      '/relative-path',
      '',
    ]) {
      assert.throws(() => normalizeServerUrl(value), ApiError, value);
    }
  });
});
