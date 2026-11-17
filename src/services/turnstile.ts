export interface ChallengeMessage {
  type: 'life-turnstile';
  channel: string;
  status: 'ready' | 'success' | 'expired' | 'error';
  token?: string;
}

// A fresh channel binds messages to one iframe, including when an old iframe
// finishes after the user has changed the API address or retried verification.
export function createChallengeChannel(cryptoApi: Pick<Crypto, 'getRandomValues'> = crypto) {
  return Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function challengeParentOrigin(location: Pick<Location, 'origin' | 'protocol' | 'host'>) {
  // URL.origin may serialize a custom scheme as "null". Use the explicit
  // packaged iOS origin, rather than accepting arbitrary opaque origins.
  if (location.protocol === 'capacitor:' && location.host === 'localhost') return 'capacitor://localhost';
  if ((location.protocol === 'https:' || location.protocol === 'http:') && location.origin !== 'null') return location.origin;
  throw new Error('当前页面来源不支持安全验证，请通过 Life App 或 HTTPS 网站打开。');
}

export function challengeFrameUrl(serverUrl: string, parentOrigin: string, channel: string, allowHttp = false) {
  if (!/^[a-f0-9]{32}$/.test(channel)) throw new Error('安全验证初始化失败，请重试。');
  const url = new URL(`${serverUrl}/life/auth/challenge`);
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new Error('安全验证地址必须使用 HTTPS。');
  if (url.username || url.password || url.search || url.hash) throw new Error('安全验证地址无效。');
  // Communication metadata goes into the fragment, so it is not sent in HTTP
  // requests or server access logs. No credentials are placed in this URL.
  url.hash = new URLSearchParams({ channel, parentOrigin }).toString();
  return url.href;
}

export function readChallengeMessage(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  expected: { origin: string; source: MessageEventSource | null; channel: string },
): ChallengeMessage | undefined {
  if (!expected.source || event.source !== expected.source || event.origin !== expected.origin) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== 'life-turnstile' || data.channel !== expected.channel) return;
  if (!['ready', 'success', 'expired', 'error'].includes(data.status)) return;
  if (data.status === 'success' && (typeof data.token !== 'string' || !data.token || data.token.length > 2048)) return;
  return { type: 'life-turnstile', channel: data.channel, status: data.status, ...(data.status === 'success' ? { token: data.token } : {}) };
}
