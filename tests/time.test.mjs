import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadTs } from './load-ts.mjs';

const { today, monthRange, formatMoney, itemTypeLabel } = await loadTs('../src/utils/time.ts');

function inTimezone(timezone, callback) {
  const original = process.env.TZ;
  process.env.TZ = timezone;
  try { callback(); }
  finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe('local calendar dates', { concurrency: false }, () => {
  test('uses the phone local day in Asia/Shanghai before UTC midnight', () => {
    inTimezone('Asia/Shanghai', () => {
      const date = new Date('2026-11-16T16:15:00Z');
      assert.equal(date.getDate(), 17);
      assert.equal(today(date), '2026-11-17');
      assert.notEqual(today(date), date.toISOString().slice(0, 10));
    });
  });

  test('uses the local previous day west of UTC rather than the ISO date', () => {
    inTimezone('America/Los_Angeles', () => {
      const date = new Date('2026-11-17T01:15:00Z');
      assert.equal(date.getDate(), 16);
      assert.equal(today(date), '2026-11-16');
    });
  });

  test('pads single-digit months and days', () => {
    assert.equal(today(new Date(2026, 0, 2, 12)), '2026-01-02');
  });

  test('handles leap-year and non-leap-year February', () => {
    assert.deepEqual(monthRange('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
    assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
    assert.deepEqual(monthRange('2000-02'), { start: '2000-02-01', end: '2000-02-29' });
    assert.deepEqual(monthRange('2100-02'), { start: '2100-02-01', end: '2100-02-28' });
  });

  test('handles year boundaries and short months', () => {
    assert.deepEqual(monthRange('2026-12'), { start: '2026-12-01', end: '2026-12-31' });
    assert.deepEqual(monthRange('2027-01'), { start: '2027-01-01', end: '2027-01-31' });
    assert.deepEqual(monthRange('2026-11'), { start: '2026-11-01', end: '2026-11-30' });
  });

  test('rejects malformed months instead of silently rolling over', () => {
    for (const month of ['', '2026-0', '2026-1', '2026-00', '2026-13', '26-11', '2026-11-17']) {
      assert.throws(() => monthRange(month), /有效月份/, month);
    }
  });
});

describe('money and transaction labels', () => {
  test('formats amounts with grouping and exactly two decimal places', () => {
    assert.equal(formatMoney(0), '0.00');
    assert.equal(formatMoney(1234.5), '1,234.50');
    assert.equal(formatMoney(12.345), '12.35');
    assert.equal(formatMoney(-1234.5), '-1,234.50');
  });

  test('distinguishes transfers from income and expense', () => {
    assert.equal(itemTypeLabel(0), '支出');
    assert.equal(itemTypeLabel(1), '收入');
    assert.equal(itemTypeLabel(99), '转出');
    assert.equal(itemTypeLabel(100), '转入');
    assert.equal(itemTypeLabel(999), '其他');
  });
});
