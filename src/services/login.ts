import type { AppSession } from '../types';
import type { LifeApi } from './api';

export function createLoginState(serverUrl: string) {
  return {
    serverUrl, username: '', password: '', loading: false, error: '',
    captchaRequired: false, captchaId: '', captchaImage: '', captchaCode: '',
    captchaLoading: false, captchaError: '', captchaExpiresAt: 0,
  };
}

type LoginState = ReturnType<typeof createLoginState>;
interface LoginDependencies {
  api: (serverUrl: string) => Pick<LifeApi, 'login' | 'getLoginCaptcha'>;
  loggedIn: (session: AppSession) => void;
  now?: () => number;
  setTimer?: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

// The view passes its reactive state here. Keeping the request lifecycle together
// makes a challenge belong to exactly one account/server and one login attempt.
export function createLoginController(state: LoginState, dependencies: LoginDependencies) {
  const now = dependencies.now || Date.now;
  const setTimer = dependencies.setTimer || setTimeout;
  const clearTimer = dependencies.clearTimer || clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let disposed = false;

  function clearChallenge() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    state.captchaId = '';
    state.captchaImage = '';
    state.captchaCode = '';
    state.captchaExpiresAt = 0;
  }

  function identityChanged() {
    generation += 1;
    clearChallenge();
    state.captchaRequired = false;
    state.captchaLoading = false;
    state.captchaError = '';
    state.error = '';
    state.password = '';
    state.loading = false;
  }

  async function refreshCaptcha() {
    if (disposed || state.loading) return;
    const current = ++generation;
    clearChallenge();
    state.captchaError = '';
    state.captchaLoading = true;
    try {
      if (!state.username.trim()) throw new Error('请先填写账号。');
      const result = await dependencies.api(state.serverUrl).getLoginCaptcha(state.username.trim());
      if (disposed || generation !== current) return;
      state.captchaRequired = result.captchaRequired;
      if (!result.captchaRequired) return;
      state.captchaId = result.captchaId;
      state.captchaImage = result.image;
      state.captchaExpiresAt = now() + result.expiresIn * 1000;
      timer = setTimer(() => {
        if (disposed || generation !== current) return;
        clearChallenge();
        state.captchaError = '验证码已过期，请刷新后重试。';
      }, result.expiresIn * 1000);
    } catch (cause) {
      if (!disposed && generation === current) {
        state.captchaError = cause instanceof Error ? cause.message : '无法加载图形验证码，请重试。';
      }
    } finally {
      if (!disposed && generation === current) state.captchaLoading = false;
    }
  }

  async function submit() {
    if (disposed || state.loading || state.captchaLoading) return;
    state.error = '';
    const username = state.username.trim();
    if (!username || !state.password) { state.error = '请填写账号和密码。'; return; }
    if (state.captchaRequired) {
      if (!state.captchaId || !state.captchaImage || state.captchaExpiresAt <= now()) {
        clearChallenge();
        state.error = '请刷新图形验证码后重试。';
        return;
      }
      if (!/^[a-z0-9]{5}$/i.test(state.captchaCode.trim())) {
        state.error = '请输入图片中的 5 位验证码。';
        return;
      }
    }
    const captcha = state.captchaRequired
      ? { captchaId: state.captchaId, captchaCode: state.captchaCode.trim() } : undefined;
    const current = ++generation;
    state.loading = true;
    let needsCaptcha = state.captchaRequired;
    // The server consumes a challenge on submission even when its answer is
    // wrong. Never retain a submitted image/code for a second attempt.
    clearChallenge();
    state.captchaError = '';
    try {
      const session = await dependencies.api(state.serverUrl).login(username, state.password, captcha);
      if (disposed || generation !== current) return;
      needsCaptcha = false;
      state.captchaRequired = false;
      dependencies.loggedIn(session);
    } catch (cause) {
      if (disposed || generation !== current) return;
      state.error = cause instanceof Error ? cause.message : '登录失败，请稍后重试。';
      needsCaptcha = needsCaptcha || !!(cause && typeof cause === 'object' &&
        'captchaRequired' in cause && cause.captchaRequired === true);
      state.captchaRequired = needsCaptcha;
    } finally {
      if (!disposed && generation === current) {
        state.password = '';
        state.loading = false;
        if (needsCaptcha) await refreshCaptcha();
      }
    }
  }

  function captchaImageFailed(captchaId: string | undefined) {
    if (disposed || !captchaId || captchaId !== state.captchaId) return;
    generation += 1;
    clearChallenge();
    state.captchaError = '验证码图片未能显示，请刷新后重试。';
  }

  function dispose() {
    disposed = true;
    generation += 1;
    clearChallenge();
    state.password = '';
    state.loading = false;
    state.captchaLoading = false;
  }

  return { submit, refreshCaptcha, identityChanged, captchaImageFailed, dispose };
}
