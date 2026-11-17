<template>
  <div class="security-check" aria-label="登录安全验证">
    <iframe
      v-if="source" ref="frame" :src="source" title="登录安全验证" class="challenge-frame"
      sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" @error="fail"
    />
    <p :class="{ failed: failed }" :role="failed ? 'alert' : 'status'">{{ message }}</p>
    <button v-if="failed" class="retry-check" type="button" @click="restart">重新验证</button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { challengeFrameUrl, challengeParentOrigin, createChallengeChannel, readChallengeMessage } from '../services/turnstile';

const props = defineProps<{ serverUrl: string }>();
const emit = defineEmits<{ token: [value: string] }>();
const frame = ref<HTMLIFrameElement | null>(null);
const source = ref('');
const failed = ref(false);
const message = ref('正在加载安全验证…');
let channel = '';
let timeout: ReturnType<typeof setTimeout> | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;

function clearTimers() {
  clearTimeout(timeout);
  clearTimeout(expiry);
}

function fail() {
  clearTimers();
  emit('token', '');
  failed.value = true;
  message.value = '安全验证未完成，请检查网络后重新验证。';
}

function restart() {
  clearTimers();
  emit('token', '');
  failed.value = false;
  message.value = '正在加载安全验证…';
  try {
    channel = createChallengeChannel();
    source.value = challengeFrameUrl(props.serverUrl, challengeParentOrigin(window.location), channel, import.meta.env.DEV);
    timeout = setTimeout(fail, 45000);
  } catch (cause) {
    source.value = '';
    failed.value = true;
    message.value = cause instanceof Error ? cause.message : '安全验证初始化失败，请重试。';
  }
}

function receive(event: MessageEvent) {
  const result = readChallengeMessage(event, { origin: new URL(props.serverUrl).origin, source: frame.value?.contentWindow || null, channel });
  if (!result || failed.value) return;
  if (result.status === 'ready') {
    clearTimeout(timeout);
    message.value = '请完成安全验证。';
    timeout = setTimeout(fail, 120000);
  } else if (result.status === 'success') {
    clearTimers();
    emit('token', result.token!);
    message.value = '安全验证已通过';
    // Clear locally even if the hosted page's expiry callback is interrupted.
    expiry = setTimeout(() => {
      emit('token', '');
      failed.value = true;
      message.value = '安全验证已过期，请重新验证。';
    }, 240000);
  } else if (result.status === 'expired') {
    clearTimers();
    emit('token', '');
    failed.value = true;
    message.value = '安全验证已过期，请重新验证。';
  } else fail();
}

onMounted(() => { window.addEventListener('message', receive); restart(); });
onBeforeUnmount(() => { clearTimers(); window.removeEventListener('message', receive); emit('token', ''); });
</script>

<style scoped>
.security-check { min-width: 0; }
.challenge-frame { display: block; width: 100%; height: 190px; border: 0; }
.security-check p { margin: 8px 0 0; color: #73806f; font-size: 12px; line-height: 1.6; }
.security-check p.failed { color: #ad453d; }
.retry-check { margin-top: 8px; padding: 6px 0; color: #536b45; background: transparent; border: 0; text-decoration: underline; cursor: pointer; }
</style>
