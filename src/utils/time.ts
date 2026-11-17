import type { ItemKind } from '../types';

const pad = (value: number) => String(value).padStart(2, '0');

export function today(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('请选择有效月份。');
  const [year, number] = month.split('-').map(Number);
  return { start: `${month}-01`, end: `${month}-${pad(new Date(year, number, 0).getDate())}` };
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function itemTypeLabel(type: ItemKind) {
  return ({ 0: '支出', 1: '收入', 99: '转出', 100: '转入' })[type] || '其他';
}
