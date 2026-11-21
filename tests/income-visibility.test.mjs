import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { isVisibleItemType, itemFilterType } = await loadTs('../src/utils/incomeVisibility.ts');

test('income is hidden by default while expense and both transfer kinds stay visible', () => {
  const rows = [{ id: 1, type: 0 }, { id: 2, type: 1 }, { id: 3, type: 99 }, { id: 4, type: 100 }];
  assert.deepEqual(rows.filter(row => isVisibleItemType(row.type)).map(row => row.id), [1, 3, 4]);
  assert.deepEqual(rows.filter(row => isVisibleItemType(row.type, false)), rows);
});

test('hidden-mode queries use a server-supported filter instead of filtering paginated income locally', () => {
  for (const filter of [undefined, '', 1]) assert.equal(itemFilterType(filter), 0);
  for (const filter of [0, 99, 100]) assert.equal(itemFilterType(filter), filter);
});

test('showing income restores all-type and income-only queries without changing transfer filters', () => {
  assert.equal(itemFilterType(undefined, false), '');
  for (const filter of ['', 0, 1, 99, 100]) assert.equal(itemFilterType(filter, false), filter);
});
