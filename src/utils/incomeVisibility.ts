import type { ItemKind } from '../types';

export function isVisibleItemType(type: ItemKind, hideIncome = true) {
  return !hideIncome || type !== 1;
}

// The deployed API supports one type per query. Expense-only is the default
// hidden view; transfers remain available through their existing exact filters.
export function itemFilterType(type: ItemKind | '' | undefined, hideIncome = true): ItemKind | '' {
  return hideIncome && (type === '' || type === 1 || type === undefined) ? 0 : (type ?? '');
}
