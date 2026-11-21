<template>
  <section class="login-page" aria-labelledby="login-title">
    <div class="login-intro">
      <p class="eyebrow">留一点心意，给每天的生活</p>
      <h1 id="login-title">每一笔，<br />都算数<span>。</span></h1>
      <p>记录日常开销，也看见生活的方向。</p>
      <div class="intro-decoration" aria-hidden="true"><span>日常</span><span>计划</span><span>生活</span></div>
    </div>
    <form class="login-form panel" @submit.prevent="controller.submit">
      <div class="login-heading"><h2>欢迎回来</h2><p>使用现有 Life 账号登录</p></div>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <label class="field"><span>账号</span><input v-model.trim="form.username" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" placeholder="请输入账号" :disabled="form.loading" required /></label>
      <label class="field"><span>密码</span><input v-model="form.password" name="password" type="password" autocomplete="current-password" placeholder="请输入密码" :disabled="form.loading" required /></label>
      <section v-if="form.captchaRequired" class="captcha-section" aria-label="登录图形验证码">
        <p class="captcha-notice">登录尝试较多，请填写图形验证码。</p>
        <div class="captcha-image-row">
          <img v-if="form.captchaImage" :key="form.captchaId" :src="form.captchaImage" :data-captcha-id="form.captchaId" alt="登录图形验证码" class="captcha-image" @error="onCaptchaImageError" />
          <p v-else class="captcha-placeholder" role="status">{{ form.captchaLoading ? '正在加载验证码…' : '请刷新验证码' }}</p>
          <button class="captcha-refresh" type="button" :disabled="form.loading || form.captchaLoading" @click="controller.refreshCaptcha">刷新验证码</button>
        </div>
        <label class="field"><span>图形验证码</span><input v-model.trim="form.captchaCode" name="captchaCode" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="5" placeholder="请输入图片中的 5 位字符" :disabled="form.loading || form.captchaLoading || !form.captchaId" /></label>
        <p v-if="form.captchaError" class="error" role="alert">{{ form.captchaError }}</p>
        <p class="captcha-notice">验证码 2 分钟内有效，每次提交后需重新获取。</p>
      </section>
      <p v-if="form.error" class="error" role="alert">{{ form.error }}</p>
      <button class="button button-primary login-submit" type="submit" :disabled="form.loading || form.captchaLoading || (form.captchaRequired && !form.captchaId)">{{ form.loading ? '正在登录…' : '登录 Life' }}<span aria-hidden="true">↗</span></button>
      <p class="login-footnote">电脑与手机，共享同一份生活记录。</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from 'vue';
import { createLifeApi } from '../services/api';
import { createLoginController, createLoginState } from '../services/login';
import { resolveServerConfig } from '../config/server';
import type { AppSession } from '../types';

const props = defineProps<{ serverUrl: string; notice: string }>();
const emit = defineEmits<{ loggedIn: [session: AppSession] }>();
const form = reactive(createLoginState(props.serverUrl));
const controller = createLoginController(form, {
  api: serverUrl => createLifeApi(resolveServerConfig(serverUrl, import.meta.env.DEV)),
  loggedIn: session => emit('loggedIn', session),
});
watch(() => [form.serverUrl, form.username], controller.identityChanged, { flush: 'sync' });
function onCaptchaImageError(event: Event) {
  controller.captchaImageFailed((event.currentTarget as HTMLImageElement).dataset.captchaId);
}
onBeforeUnmount(controller.dispose);
</script>

<style scoped>
.login-page { display: grid; gap: 36px; }
.login-intro { position: relative; padding: 20px 6px 6px; overflow: hidden; }
.eyebrow { color: #6c7a68; font-size: 12px; letter-spacing: .12em; }
.login-intro h1 { margin: 18px 0; font-size: clamp(44px, 9vw, 70px); line-height: 1.15; font-weight: 650; letter-spacing: -.05em; }
.login-intro h1 span { color: #8c9c67; }
.login-intro > p:last-of-type { color: #73806f; font-size: 14px; }
.intro-decoration { display: flex; gap: 10px; margin-top: 27px; }
.intro-decoration span { padding: 8px 18px; border: 1px solid #d9dfcd; border-radius: 40px; color: #728263; background: #edf0e6; font-size: 12px; }
.intro-decoration span:nth-child(2) { transform: rotate(-7deg); }
.login-form { display: grid; gap: 20px; padding: 28px 24px; }
.login-heading h2 { margin: 0 0 8px; font-size: 23px; }
.login-heading p { color: #7b8476; margin: 0; font-size: 13px; }
.captcha-section { display: grid; gap: 12px; min-width: 0; }
.captcha-notice { margin: 0; color: #73806f; font-size: 12px; line-height: 1.6; }
.captcha-image-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.captcha-image { display: block; width: 180px; max-width: 100%; height: 64px; object-fit: contain; border: 1px solid #d9dfcd; border-radius: 8px; }
.captcha-placeholder { min-height: 44px; display: flex; align-items: center; margin: 0; color: #73806f; font-size: 13px; }
.captcha-refresh { min-height: 44px; padding: 8px 0; border: 0; background: transparent; color: #536b45; text-decoration: underline; cursor: pointer; }
.captcha-refresh:disabled { opacity: .5; cursor: default; }
.login-submit { display: flex; justify-content: space-between; width: 100%; min-height: 52px; }
.login-submit span { font-size: 20px; }
.login-footnote { margin: 0; text-align: center; font-size: 12px; color: #7c8775; }
@media (min-width: 700px) { .login-page { grid-template-columns: 1fr 1fr; align-items: center; gap: 70px; } .login-intro { padding-bottom: 40px; } }
@media (max-width: 360px) { .login-form { padding: 24px 18px; } }
</style>
