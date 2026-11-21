<template>
  <section class="settings-view" aria-labelledby="settings-title">
    <div class="page-heading">
      <div><p class="eyebrow">按自己的习惯记录</p><h2 id="settings-title">设置</h2></div>
    </div>
    <section class="panel settings-panel" aria-labelledby="display-settings-title">
      <h3 id="display-settings-title">显示偏好</h3>
      <label class="setting-row" for="hide-income-setting">
        <span class="setting-copy">
          <span class="setting-title">隐藏收入</span>
          <span id="hide-income-description" class="setting-description">默认开启，隐藏收入明细、收入统计及结余，支出和转账照常显示。关闭后可查看和记录收入。</span>
        </span>
        <span class="switch-control">
          <input id="hide-income-setting" type="checkbox" role="switch" :checked="hideIncome" aria-describedby="hide-income-description" @change="updateHideIncome" />
          <span class="switch-track" aria-hidden="true"></span>
        </span>
      </label>
      <p class="setting-note">此设置只影响当前账号在这台设备上的显示，不会修改或删除云端数据。</p>
    </section>
    <p v-if="saveNotice" class="notice" role="status">{{ saveNotice }}</p>
  </section>
</template>

<script setup lang="ts">
defineProps<{ hideIncome: boolean; saveNotice: string }>();
const emit = defineEmits<{ 'update:hideIncome': [value: boolean] }>();
function updateHideIncome(event: Event) {
  emit('update:hideIncome', (event.target as HTMLInputElement).checked);
}
</script>

<style scoped>
.settings-view { display: grid; gap: 18px; }
.settings-view .page-heading { margin-bottom: 2px; }
.settings-panel { padding: 22px; }
.settings-panel h3 { margin: 0 0 8px; font-size: 16px; font-weight: 650; }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 80px; padding: 14px 0; cursor: pointer; }
.setting-copy { display: grid; gap: 8px; min-width: 0; }
.setting-title { font-size: 15px; font-weight: 600; }
.setting-description, .setting-note { color: #74816d; font-size: 12px; line-height: 1.7; }
.setting-note { margin: 12px 0 0; padding-top: 16px; border-top: 1px solid var(--line); }
.switch-control { position: relative; display: inline-flex; flex: 0 0 48px; width: 48px; height: 32px; align-items: center; }
.switch-control input { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.switch-track { display: block; width: 48px; height: 28px; border-radius: 18px; background: #c9d0c2; transition: background-color .15s; }
.switch-track::after { content: ''; position: absolute; left: 3px; top: 5px; width: 22px; height: 22px; border-radius: 50%; background: #fffefa; transition: transform .15s; }
.switch-control input:checked + .switch-track { background: #526d4e; }
.switch-control input:checked + .switch-track::after { transform: translateX(20px); }
.switch-control input:focus-visible + .switch-track { outline: 3px solid #789265; outline-offset: 3px; }
</style>
