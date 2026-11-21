import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { statisticsDisplay } = await loadTs('../src/utils/statisticsDisplay.ts');
const totals = Object.freeze({ total: 30, yearTotal: 30, monthTotal: 20, dayTotal: 5, yearIncomeTotal: 9876543 });
const monthly = Object.freeze({
  months: Object.freeze(Array.from({ length: 12 }, (_, index) => `${index + 1}月`)),
  expense: Object.freeze([10, 20, ...Array(10).fill(0)]),
  income: Object.freeze([1234567, 7654321, ...Array(10).fill(0)]),
});

test('income is hidden by default, including balances and influence on chart scale', () => {
  const view = statisticsDisplay(totals, monthly, 1);
  for (const field of ['monthIncome', 'monthBalance', 'yearIncome', 'yearBalance']) {
    assert.equal(field in view, false);
  }
  assert.equal(view.trendRows.every(row => !('income' in row)), true);
  assert.equal(view.monthExpense, 20);
  assert.equal(view.yearExpense, 30);
  assert.equal(view.trendMaximum, 20);
  assert.equal(view.hasMonthData, true);
  assert.equal(view.hasYearData, true);
  assert.equal(JSON.stringify(view).includes('7654321'), false);
  assert.equal(JSON.stringify(view).includes('9876543'), false);
});

test('income-only activity does not reveal itself through expense empty states or scale', () => {
  const view = statisticsDisplay({ ...totals, monthTotal: 0, yearTotal: 0 }, {
    ...monthly, expense: Array(12).fill(0),
  }, 1, true);
  assert.equal(view.hasMonthData, false);
  assert.equal(view.hasYearData, false);
  assert.equal(view.trendMaximum, 1);
});

test('turning income display back on restores balances and both series without changing source data', () => {
  const hidden = statisticsDisplay(totals, monthly, 1, true);
  const visible = statisticsDisplay(totals, monthly, 1, false);
  assert.equal(visible.monthIncome, 7654321);
  assert.equal(visible.monthBalance, 7654301);
  assert.equal(visible.yearIncome, 9876543);
  assert.equal(visible.yearBalance, 9876513);
  assert.equal(visible.trendRows[1].income, 7654321);
  assert.equal(visible.trendMaximum, 7654321);
  assert.deepEqual(statisticsDisplay(totals, monthly, 1, true), hidden);
  assert.equal(monthly.income[1], 7654321);
  assert.equal(totals.yearIncomeTotal, 9876543);
});

test('reports that have not loaded project an expense-only empty display', () => {
  const view = statisticsDisplay(null, null, 0);
  assert.equal(view.monthExpense, 0);
  assert.equal(view.yearExpense, 0);
  assert.equal(view.hasMonthData, false);
  assert.equal(view.hasYearData, false);
  assert.equal(view.trendRows.length, 12);
  assert.equal(view.trendRows.every(row => row.expense === 0 && !('income' in row)), true);
});
