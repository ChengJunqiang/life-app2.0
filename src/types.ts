export interface ServerUser {
  id: number;
  account: string;
  name: string;
  isAdmin?: number;
  roles?: string[];
  menuPermissions?: string[];
}

export interface AppSession {
  serverUrl: string;
  token: string;
  user: ServerUser;
}

export type ItemKind = 0 | 1 | 99 | 100;

export interface ItemDraft {
  id?: number;
  item: string;
  itemType: string;
  money: number;
  type: ItemKind;
  itemDate: string;
  remark: string;
  payType: string;
  address: string;
  imageUrl: string;
}

export interface LifeItem extends ItemDraft {
  id: number;
  createId?: number;
  createUser?: string;
  createTime?: string;
  updateTime?: string;
}

export interface DictionaryOption {
  key: string;
  value: string;
}

export interface ItemFilters {
  page: number;
  limit: number;
  item?: string;
  type?: ItemKind | '';
  itemType?: string;
  payType?: string;
  itemDateStart?: string;
  itemDateEnd?: string;
  remark?: string;
}

export interface ItemList {
  items: LifeItem[];
  count: number;
  expense: number;
  income: number;
  transferOut: number;
  transferIn: number;
}

export interface TotalReport {
  total: number;
  yearTotal: number;
  monthTotal: number;
  dayTotal: number;
  yearIncomeTotal: number;
}

export interface MonthlyReport {
  months: string[];
  expense: number[];
  income: number[];
}

export interface CategoryReport {
  name: string;
  amount: number;
}
