import type {
  AppSession, CategoryReport, DictionaryOption, ItemDraft, ItemFilters,
  ItemKind, ItemList, LifeItem, MonthlyReport, ServerUser, TotalReport,
} from '../types';

interface ErrorMetadata { captchaRequired?: unknown; code?: unknown }

export class ApiError extends Error {
  status: number;
  uncertain: boolean;
  captchaRequired: boolean;
  code: string;

  constructor(message: string, status = 0, uncertain = false, metadata: ErrorMetadata = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.uncertain = uncertain;
    this.captchaRequired = metadata.captchaRequired === true;
    this.code = metadata.code === 'CAPTCHA_REQUIRED' || metadata.code === 'CAPTCHA_INVALID' ? metadata.code : '';
  }
}

export type LoginCaptcha = { captchaRequired: false } | {
  captchaRequired: true; captchaId: string; image: string; expiresIn: number;
};

export interface CaptchaAnswer { captchaId: string; captchaCode: string }

interface ApiOptions {
  serverUrl: string;
  token?: string;
  allowHttp?: boolean;
  timeoutMs?: number;
  onUnauthorized?: () => void;
}

type JsonBody = Record<string, unknown>;
const uncertainMessage = '提交结果尚未确认，请先刷新账目明细核对，勿重复提交。';

export function normalizeServerUrl(value: string, allowHttp = false) {
  if (!value.trim()) throw new ApiError('请先填写服务地址。');
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new ApiError('服务地址格式不正确，请填写完整的 HTTPS 地址。'); }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new ApiError('请使用 HTTPS 服务地址；HTTP 仅限本地开发。');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiError('服务地址不能包含账号、密码、查询参数或锚点。');
  }
  return url.href.replace(/\/+$/, '').replace(/\/life$/, '');
}

function amount(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new ApiError('服务端返回了无效金额，请稍后重试。');
  return number;
}

function object(value: unknown): JsonBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('服务响应格式不正确，请检查 API 地址。');
  }
  return value as JsonBody;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ApiError('服务响应缺少列表数据，请检查 API 版本。');
  return value;
}

function mapUser(value: unknown): ServerUser {
  const row = object(value);
  if (!Number.isInteger(Number(row.id)) || Number(row.id) <= 0 || !row.account) {
    throw new ApiError('登录用户信息不完整，请重新登录。');
  }
  return {
    id: Number(row.id), account: String(row.account), name: String(row.name || row.account),
    isAdmin: row.isAdmin == null ? undefined : Number(row.isAdmin),
    roles: Array.isArray(row.roles) ? row.roles.map(String) : undefined,
    ...(Array.isArray(row.menuPermissions) ? { menuPermissions: row.menuPermissions.map(String) } : {}),
  };
}

function mapItem(value: unknown): LifeItem {
  const row = object(value);
  if (!Number.isInteger(Number(row.id)) || Number(row.id) <= 0) throw new ApiError('服务端返回的账目编号无效。');
  return {
    id: Number(row.id), item: String(row.item ?? ''), itemType: String(row.itemType ?? ''),
    money: amount(row.money), type: Number(row.type) as ItemKind,
    itemDate: String(row.itemDate ?? '').slice(0, 10), remark: String(row.remark ?? ''),
    payType: String(row.payType ?? ''), address: String(row.address ?? ''), imageUrl: String(row.imageUrl ?? ''),
    createId: row.createId == null ? undefined : Number(row.createId),
    createUser: String(row.createUser ?? ''), createTime: String(row.createTime ?? ''), updateTime: String(row.updateTime ?? ''),
  };
}

function withQuery(path: string, params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export function createLifeApi(options: ApiOptions) {
  const serverUrl = normalizeServerUrl(options.serverUrl, options.allowHttp);
  const token = options.token || '';

  async function request(path: string, init: RequestInit = {}, bearerToken = token): Promise<JsonBody> {
    const mutation = path.startsWith('/items/') && !!init.method && init.method !== 'GET';
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    if (bearerToken) headers.set('Authorization', `Bearer ${bearerToken}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
    try {
      const response = await fetch(`${serverUrl}/life${path}`, { ...init, headers, signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401 && bearerToken) options.onUnauthorized?.();
        const uncertain = mutation && response.status >= 500;
        let reason = '';
        let metadata: ErrorMetadata = {};
        try {
          const problem = object(await response.json());
          if (typeof problem.message === 'string') reason = problem.message;
          metadata = { captchaRequired: problem.captchaRequired, code: problem.code };
        } catch { /* Gateways may return HTML errors. Use safe status fallbacks. */ }
        const fallback = response.status === 401 ? (bearerToken ? '登录已过期，请重新登录。' : '用户名或密码错误。')
          : response.status === 403 ? '没有此操作的权限。'
            : response.status === 429 ? '请求过于频繁，请稍后重试。'
              : response.status === 503 ? '服务暂不可用，请稍后重试。'
                : `请求失败（${response.status}），请稍后重试。`;
        throw new ApiError(
          response.status === 401 && bearerToken ? fallback : `${reason || fallback}${uncertain ? ` ${uncertainMessage}` : ''}`,
          response.status, uncertain, metadata,
        );
      }
      let body: JsonBody;
      try { body = object(await response.json()); }
      catch {
        throw new ApiError(
          mutation ? `服务响应格式不正确。${uncertainMessage}` : '服务响应格式不正确，请检查地址是否指向 life-api。',
          0, mutation,
        );
      }
      // Existing life-api reports application errors in JSON, often with HTTP 200.
      if (body.status !== undefined && Number(body.status) !== 200) {
        const status = Number(body.status);
        if (status === 401 && bearerToken) options.onUnauthorized?.();
        const uncertain = mutation && status >= 500;
        throw new ApiError(
          status === 401 ? (bearerToken ? '登录已过期，请重新登录。' : '用户名或密码错误。')
            : `${String(body.message || '请求失败。')}${uncertain ? ` ${uncertainMessage}` : ''}`,
          status, uncertain, body,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const message = controller.signal.aborted ? '请求超时。' : '无法连接服务，请检查网络和服务地址。';
      throw new ApiError(`${message}${mutation ? uncertainMessage : ''}`, 0, mutation);
    } finally { clearTimeout(timer); }
  }

  async function write(path: string, method: string, data: unknown) {
    const result = await request(path, { method, body: JSON.stringify(data) });
    if (Number(result.status) !== 200) {
      const uncertain = path.startsWith('/items/');
      throw new ApiError(`未收到服务端的操作确认。${uncertain ? uncertainMessage : '请稍后重试。'}`, 0, uncertain);
    }
  }

  return {
    async getLoginCaptcha(username: string): Promise<LoginCaptcha> {
      const result = await request('/auth/captcha', { method: 'POST', body: JSON.stringify({ username }) }, '');
      if (Number(result.status) !== 200) throw new ApiError('无法读取图形验证码，请重试。');
      const data = object(result.data);
      if (data.captchaRequired === false) return { captchaRequired: false };
      if (data.captchaRequired !== true || typeof data.captchaId !== 'string' || !/^[a-f0-9]{64}$/.test(data.captchaId) ||
          typeof data.image !== 'string' || data.image.length > 262144 ||
          !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/.test(data.image) ||
          typeof data.expiresIn !== 'number' || !Number.isInteger(data.expiresIn) || data.expiresIn < 1 || data.expiresIn > 120) {
        throw new ApiError('图形验证码响应不完整，请刷新后重试。');
      }
      return { captchaRequired: true, captchaId: data.captchaId, image: data.image, expiresIn: data.expiresIn };
    },
    async login(username: string, password: string, captcha?: CaptchaAnswer): Promise<AppSession> {
      const result = await request('/auth/login', {
        method: 'POST', body: JSON.stringify({ username, password, ...(captcha ? {
          captchaId: captcha.captchaId, captchaCode: captcha.captchaCode,
        } : {}) }),
      }, '');
      if (result.data !== true || typeof result.message !== 'string' || !result.message) {
        throw new ApiError(result.data === false ? '用户名或密码错误。' : '登录响应格式不正确。', result.data === false ? 401 : 0, false, result);
      }
      const info = await request('/auth/info', {}, result.message);
      return { serverUrl, token: result.message, user: mapUser(info.data) };
    },
    async getCurrentUser() { return mapUser((await request('/auth/info')).data); },
    async logout() { await write('/auth/logout', 'POST', {}); },
    async listItems(filters: ItemFilters): Promise<ItemList> {
      const result = await request(withQuery('/items/query', { ...filters }));
      return {
        items: array(result.data).map(mapItem), count: amount(result.count),
        expense: amount(result.sum), income: amount(result.sumIncome),
        transferOut: amount(result.sumTransferOut), transferIn: amount(result.sumTransferIn),
      };
    },
    async getItem(id: number) { return mapItem((await request(`/items/query/${id}`)).data); },
    async saveItem(draft: ItemDraft) {
      const data = {
        ...(draft.id !== undefined ? { id: draft.id } : {}), item: draft.item.trim(), itemType: draft.itemType,
        money: draft.money, type: draft.type, itemDate: draft.itemDate, remark: draft.remark,
        payType: draft.payType, address: draft.address, imageUrl: draft.imageUrl,
      };
      await write(draft.id === undefined ? '/items/create' : '/items/update', draft.id === undefined ? 'POST' : 'PUT', data);
    },
    async deleteItem(id: number) { await write('/items/delete', 'DELETE', { id: String(id) }); },
    async getDictionary(type: 'item_type' | 'pay_type'): Promise<DictionaryOption[]> {
      const result = await request(withQuery('/dictionaries/options/query', { type }));
      return array(result.data).map((value) => {
        const row = object(value);
        return { key: String(row.key ?? ''), value: String(row.value ?? '') };
      }).filter((row) => row.key !== '');
    },
    async getTotalReport(params: { year: string; month: string; day: string }): Promise<TotalReport> {
      const result = await request(withQuery('/items/reports/total/query', params));
      return {
        total: amount(result.total), yearTotal: amount(result.yearTotal), monthTotal: amount(result.monthTotal),
        dayTotal: amount(result.dayTotal), yearIncomeTotal: amount(result.yearIncomeTotal),
      };
    },
    async getMonthlyReport(year: string): Promise<MonthlyReport> {
      const result = await request(withQuery('/items/reports/monthly/query', { year }));
      return { months: array(result.key).map(String), expense: array(result.value).map(amount), income: array(result.value2).map(amount) };
    },
    async getCategoryReport(month: string): Promise<CategoryReport[]> {
      const result = await request(withQuery('/items/reports/by-type/query', { month }));
      return array(result.data).map((value) => {
        const row = object(value);
        return { name: String(row.key ?? '未分类'), amount: amount(row.value) };
      });
    },
  };
}

export type LifeApi = ReturnType<typeof createLifeApi>;
