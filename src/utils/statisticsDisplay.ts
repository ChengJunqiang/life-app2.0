import type { MonthlyReport, TotalReport } from '../types';

// Only project the visible series into the view model. Hidden income must not
// affect chart scales, empty states or balances that reveal it indirectly.
export function statisticsDisplay(
  totals: TotalReport | null,
  monthly: MonthlyReport | null,
  monthIndex: number,
  hideIncome = true,
) {
  const monthExpense = totals?.monthTotal || 0;
  const yearExpense = totals?.yearTotal || 0;
  const monthIncome = monthly?.income[monthIndex] || 0;
  const yearIncome = totals?.yearIncomeTotal || 0;
  const trendRows = Array.from({ length: 12 }, (_, index) => ({
    index,
    expense: monthly?.expense[index] || 0,
    ...(!hideIncome ? { income: monthly?.income[index] || 0 } : {}),
  }));
  const visibleAmounts = trendRows.flatMap(row => row.income === undefined
    ? [row.expense] : [row.expense, row.income]);
  return {
    monthExpense,
    yearExpense,
    ...(!hideIncome ? {
      monthIncome,
      monthBalance: monthIncome - monthExpense,
      yearIncome,
      yearBalance: yearIncome - yearExpense,
    } : {}),
    trendRows,
    trendMaximum: Math.max(1, ...visibleAmounts),
    hasYearData: visibleAmounts.some(amount => amount !== 0),
    hasMonthData: monthExpense !== 0 || (!hideIncome && monthIncome !== 0),
  };
}
