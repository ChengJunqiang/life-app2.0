<template>
  <div class="app-shell">
    <header class="app-header">
      <a class="brand" href="#" aria-label="Life 首页" @click.prevent="activeTab = 'items'">
        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M9 6v20h15M16 6v13h8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span>life<span class="brand-dot">.</span></span>
      </a>
      <div v-if="session" class="account-menu">
        <span class="account-name">{{ session.user.name }}</span>
        <button class="logout-button" type="button" @click="logout">退出</button>
      </div>
      <span v-else class="header-caption">好好生活，慢慢记录</span>
    </header>

    <p v-if="!online" class="offline-banner" role="status">当前无网络，请保留表单，联网后重试。</p>

    <main v-if="session && api" :key="sessionGeneration" class="app-content">
      <p v-if="!canUseItems" class="notice" role="alert">当前账号没有财务管理权限，请联系管理员授权后重新登录。</p>
      <template v-else>
      <p v-if="session.user.isAdmin === 0" class="scope-note">管理员视图 · 明细与统计包含全部用户的数据，与 Web 版范围一致。</p>
      <ItemsView v-show="activeTab === 'items'" :api="api" :revision="0" :hide-income="hideIncome" @saved="revision += 1" />
      <StatisticsView v-if="statisticsVisited" v-show="activeTab === 'statistics'" :api="api" :revision="revision" :hide-income="hideIncome" />
      <SettingsView v-if="activeTab === 'settings'" :hide-income="hideIncome" :save-notice="preferenceSaveNotice" @update:hide-income="setHideIncome" />
      </template>
    </main>
    <main v-else class="login-content">
      <LoginView :server-url="serverUrl" :notice="loginNotice" @logged-in="startSession" />
    </main>

    <nav v-if="session && canUseItems" class="bottom-navigation" aria-label="主导航">
      <button type="button" :class="{ active: activeTab === 'items' }" :aria-current="activeTab === 'items' ? 'page' : undefined" @click="activeTab = 'items'">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>
        <span>账目</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'statistics' }" :aria-current="activeTab === 'statistics' ? 'page' : undefined" @click="showStatistics">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7M3 21h18"/></svg>
        <span>统计</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'settings' }" :aria-current="activeTab === 'settings' ? 'page' : undefined" @click="activeTab = 'settings'">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg>
        <span>设置</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import LoginView from './views/LoginView.vue';
import ItemsView from './views/ItemsView.vue';
import StatisticsView from './views/StatisticsView.vue';
import SettingsView from './views/SettingsView.vue';
import { createLifeApi, type LifeApi } from './services/api';
import { readHideIncomePreference, saveHideIncomePreference } from './services/preferences';
import { resolveServerConfig } from './config/server';
import type { AppSession } from './types';

// Session and business data stay in memory. Cold starts require a fresh login.
const session = shallowRef<AppSession | null>(null);
const api = shallowRef<LifeApi | null>(null);
const serverUrl = ref(resolveServerConfig(import.meta.env.VITE_API_BASE_URL, import.meta.env.DEV).serverUrl);
const sessionGeneration = ref(0);
const loginNotice = ref('');
const activeTab = ref<'items' | 'statistics' | 'settings'>('items');
const hideIncome = ref(true);
const preferenceSaveNotice = ref('');
const statisticsVisited = ref(false);
const revision = ref(0);
const online = ref(navigator.onLine);
const canUseItems = computed(() => session.value?.user.isAdmin === 0 || session.value?.user.menuPermissions?.includes('item') === true);

function clearSession(message: string) {
  sessionGeneration.value += 1;
  session.value = null;
  api.value = null;
  loginNotice.value = message;
  activeTab.value = 'items';
  statisticsVisited.value = false;
  revision.value = 0;
  hideIncome.value = true;
  preferenceSaveNotice.value = '';
}

function startSession(next: AppSession) {
  const generation = ++sessionGeneration.value;
  hideIncome.value = readHideIncomePreference({ serverUrl: next.serverUrl, userId: next.user.id });
  preferenceSaveNotice.value = '';
  serverUrl.value = next.serverUrl;
  api.value = createLifeApi({
    ...resolveServerConfig(next.serverUrl, import.meta.env.DEV), token: next.token,
    onUnauthorized: () => {
      // Late responses from a previous account must not clear a newer session.
      if (session.value && sessionGeneration.value === generation) clearSession('登录已过期，请重新登录。');
    },
  });
  session.value = next;
  loginNotice.value = '';
}

function logout() {
  const previousApi = api.value;
  clearSession('已退出登录。');
  const generation = sessionGeneration.value;
  void previousApi?.logout().catch(() => {
    if (!session.value && sessionGeneration.value === generation) {
      loginNotice.value = '已退出本机登录。服务器暂未确认退出，原会话将按服务端规则到期。';
    }
  });
}

function showStatistics() {
  statisticsVisited.value = true;
  activeTab.value = 'statistics';
}

function setHideIncome(value: boolean) {
  const current = session.value;
  if (!current) return;
  hideIncome.value = value;
  const saved = saveHideIncomePreference({ serverUrl: current.serverUrl, userId: current.user.id }, value);
  preferenceSaveNotice.value = saved ? '' : '本次更改已生效，暂时无法保存到本机。';
}

function updateConnection() { online.value = navigator.onLine; }
onMounted(() => {
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', updateConnection);
  window.removeEventListener('offline', updateConnection);
});
</script>
