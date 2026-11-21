<template>
  <section class="login-page" aria-labelledby="login-title">
    <div class="login-intro">
      <p class="eyebrow">留一点心意，给每天的生活</p>
      <h1 id="login-title">每一笔，<br />都算数<span>。</span></h1>
      <p>记录日常开销，也看见生活的方向。</p>
      <div class="intro-decoration" aria-hidden="true"><span>日常</span><span>计划</span><span>生活</span></div>
    </div>
    <form class="login-form panel" @submit.prevent="submit">
      <div class="login-heading"><h2>欢迎回来</h2><p>使用现有 Life 账号登录</p></div>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <label class="field"><span>账号</span><input v-model.trim="username" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" placeholder="请输入账号" :disabled="loading" required /></label>
      <label class="field"><span>密码</span><input v-model="password" name="password" type="password" autocomplete="current-password" placeholder="请输入密码" :disabled="loading" required /></label>
      <details class="connection-settings" :open="!serverUrl">
        <summary>连接设置</summary>
        <label class="field"><span>服务地址</span><input v-model.trim="address" name="serverUrl" type="url" inputmode="url" autocomplete="url" autocapitalize="none" autocorrect="off" placeholder="https://api.example.com" :disabled="loading" /></label>
        <p>填写 Life 服务的 HTTPS 地址。</p>
      </details>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="button button-primary login-submit" type="submit" :disabled="loading">{{ loading ? '正在登录…' : '登录 Life' }}<span aria-hidden="true">↗</span></button>
      <p class="login-footnote">电脑与手机，共享同一份生活记录。</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { createLifeApi } from '../services/api';
import type { AppSession } from '../types';

const props = defineProps<{ serverUrl: string; notice: string }>();
const emit = defineEmits<{ loggedIn: [session: AppSession] }>();
const address = ref(props.serverUrl);
const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  if (loading.value) return;
  error.value = '';
  if (!username.value || !password.value) { error.value = '请填写账号和密码。'; return; }
  loading.value = true;
  try {
    const api = createLifeApi({ serverUrl: address.value, allowHttp: import.meta.env.DEV });
    emit('loggedIn', await api.login(username.value, password.value));
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录失败，请稍后重试。';
  } finally {
    password.value = '';
    loading.value = false;
  }
}
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
.connection-settings { min-width: 0; font-size: 13px; color: #66765d; }
.connection-settings summary { cursor: pointer; padding: 10px 0; }
.connection-settings .field { margin-top: 10px; }
.connection-settings p { font-size: 12px; color: #7c8775; line-height: 1.6; }
.login-submit { display: flex; justify-content: space-between; width: 100%; min-height: 52px; }
.login-submit span { font-size: 20px; }
.login-footnote { margin: 0; text-align: center; font-size: 12px; color: #7c8775; }
@media (min-width: 700px) { .login-page { grid-template-columns: 1fr 1fr; align-items: center; gap: 70px; } .login-intro { padding-bottom: 40px; } }
@media (max-width: 360px) { .login-form { padding: 24px 18px; } }
</style>
