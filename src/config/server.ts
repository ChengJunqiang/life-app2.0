export const DEFAULT_API_BASE_URL = 'http://123.56.173.230';

// Keep the temporary IP deployment usable without allowing arbitrary HTTP
// servers in release builds. API validation still rejects credentials/queries.
export function resolveServerConfig(value?: string, development = false) {
  const serverUrl = value?.trim() || DEFAULT_API_BASE_URL;
  let allowHttp = false;
  try {
    const url = new URL(serverUrl);
    const plainAddress = !url.username && !url.password && !url.search && !url.hash;
    const cloudAddress = url.origin === DEFAULT_API_BASE_URL;
    const developmentAddress = development && ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname);
    allowHttp = url.protocol === 'http:' && plainAddress && (cloudAddress || developmentAddress);
  } catch { /* The API client reports malformed configuration when used. */ }
  return { serverUrl, allowHttp };
}
