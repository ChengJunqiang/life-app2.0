<template>
  <section class="items-page" aria-labelledby="items-title">
    <div class="page-heading ledger-heading">
      <div><p class="eyebrow">YOUR EVERYDAY LEDGER</p><h1 id="items-title">账目明细</h1><p class="heading-copy">把每一笔生活，记得清清楚楚。</p></div>
      <button class="button button-primary add-button" type="button" :disabled="!dictionariesReady" @click="openEditor(null)"><span aria-hidden="true">＋</span> 记一笔</button>
    </div>

    <form class="panel filters" @submit.prevent="applyFilters">
      <div class="filter-top">
        <label class="field"><span>账目月份</span><input v-model="draftFilters.month" name="month" type="month" required /></label>
        <label class="field search-field"><span>搜索名称</span><input v-model="draftFilters.item" type="search" placeholder="搜索一笔账目" /></label>
      </div>
      <div class="filter-bottom">
        <label class="field"><span>账目类型</span><select v-model="draftFilters.type" aria-label="账目类型"><option v-if="!hideIncome" value="">全部类型</option><option :value="0">支出</option><option v-if="!hideIncome" :value="1">收入</option><option :value="99">转出</option><option :value="100">转入</option></select></label>
        <label class="field"><span>账目分类</span><select v-model="draftFilters.itemType" aria-label="账目分类"><option value="">全部分类</option><option v-for="option in itemTypes" :key="option.key" :value="option.key">{{ option.value }}</option></select></label>
        <button class="button button-secondary filter-submit" type="submit">查询</button>
      </div>
    </form>
    <p v-if="hideIncome" class="income-hidden-note">已隐藏收入，默认显示支出；转账可按类型查询。</p>

    <div v-if="dictionaryError" class="error dictionary-error" role="alert"><span>{{ dictionaryError }}</span><button class="button button-secondary" type="button" :disabled="loadingDictionaries" @click="loadDictionaries">{{ loadingDictionaries ? '加载中…' : '重试加载分类' }}</button></div>
    <p v-else-if="loadingDictionaries" class="notice" role="status">正在加载分类和支付方式…</p>
    <p v-if="successMessage" class="notice success-message" role="status">{{ successMessage }}</p>

    <div class="result-heading"><h2>{{ appliedMonthLabel }}</h2><button class="refresh-button" type="button" :disabled="loading" @click="refreshCurrent">{{ loading ? '刷新中…' : '刷新' }}</button></div>
    <p v-if="loading" class="empty" role="status">正在读取云端账目…</p>
    <div v-else-if="listError" class="error" role="alert"><p>{{ listError }}</p><button class="button button-secondary" type="button" @click="loadItems">重试查询</button></div>
    <template v-else-if="result && resultMode === hideIncome">
      <div class="summary-grid" :class="{ 'income-hidden': hideIncome }" aria-label="当前筛选范围合计">
        <div class="summary-box"><span>支出</span><strong>{{ money(result.expense) }}</strong></div>
        <div v-if="!hideIncome" class="summary-box income"><span>收入</span><strong>{{ money(result.income) }}</strong></div>
      </div>
      <div v-if="result.transferOut || result.transferIn" class="transfer-summary">转出 {{ money(result.transferOut) }} <span aria-hidden="true">·</span> 转入 {{ money(result.transferIn) }}<span>转账单独统计</span></div>
      <p class="result-count">共 {{ result.count }} 笔 · 合计覆盖全部查询结果</p>
      <div v-if="visibleItems.length === 0" class="empty"><div class="empty-icon" aria-hidden="true">↗</div><h3>这一页生活，还等你记录</h3><p>当前查询条件下没有账目。</p><button class="button button-primary" type="button" :disabled="!dictionariesReady" @click="openEditor(null)">记下第一笔</button></div>
      <div v-else class="item-list">
        <button v-for="item in visibleItems" :key="item.id" class="item-card" type="button" :aria-label="`${item.item}，${kindLabel(item.type)} ${money(item.money)}，查看详情`" @click="openDetails(item.id)">
          <span :class="['item-kind-icon', { income: item.type === 1 || item.type === 100 }]" aria-hidden="true">{{ item.type === 1 || item.type === 100 ? '↙' : '↗' }}</span>
          <span class="item-main"><strong>{{ item.item }}</strong><span>{{ categoryLabel(item.itemType) }} <span aria-hidden="true">·</span> {{ item.itemDate }}</span><span v-if="item.remark" class="item-remark">{{ item.remark }}</span></span>
          <span class="item-amount"><strong :class="{ income: item.type === 1 || item.type === 100 }">{{ item.type === 1 || item.type === 100 ? '+' : '−' }}{{ money(item.money) }}</strong><span>{{ kindLabel(item.type) }}</span></span>
          <span class="item-chevron" aria-hidden="true">›</span>
        </button>
      </div>
      <nav v-if="totalPages > 1" class="pagination" aria-label="账目分页"><button class="button button-secondary" type="button" :disabled="filters.page <= 1" @click="changePage(-1)">上一页</button><span>第 {{ filters.page }} / {{ totalPages }} 页</span><button class="button button-secondary" type="button" :disabled="filters.page >= totalPages" @click="changePage(1)">下一页</button></nav>
    </template>

    <dialog ref="editorDialog" class="ledger-dialog" aria-label="记账表单" @cancel.prevent="cancelEditor">
      <ItemEditor v-if="editorOpen" :key="editorKey" ref="editorComponent" :api="api" :item="editingItem" :item-types="itemTypes" :pay-types="payTypes" :hide-income="hideIncome" @cancel="cancelEditor" @saved="itemSaved" />
    </dialog>

    <dialog ref="detailsDialog" class="ledger-dialog detail-dialog" aria-labelledby="detail-title" @cancel.prevent="closeDetails">
      <div class="detail-heading"><h2 id="detail-title">账目详情</h2><button class="close-button" type="button" aria-label="关闭账目详情" :disabled="deleting" @click="closeDetails">×</button></div>
      <p v-if="loadingDetails" class="empty" role="status">正在读取详情…</p>
      <p v-if="detailError" class="error" role="alert">{{ detailError }}</p>
      <template v-if="visibleSelectedItem">
        <div class="detail-hero"><span>{{ kindLabel(visibleSelectedItem.type) }}</span><strong>{{ money(visibleSelectedItem.money) }}</strong><h3>{{ visibleSelectedItem.item }}</h3></div>
        <dl class="detail-fields"><div><dt>日期</dt><dd>{{ visibleSelectedItem.itemDate }}</dd></div><div><dt>分类</dt><dd>{{ categoryLabel(visibleSelectedItem.itemType) }}</dd></div><div><dt>支付方式</dt><dd>{{ paymentLabel(visibleSelectedItem.payType) }}</dd></div><div v-if="visibleSelectedItem.remark"><dt>备注</dt><dd>{{ visibleSelectedItem.remark }}</dd></div><div v-if="visibleSelectedItem.address"><dt>地点</dt><dd>{{ visibleSelectedItem.address }}</dd></div><div v-if="visibleSelectedItem.createUser"><dt>记录人</dt><dd>{{ visibleSelectedItem.createUser }}</dd></div><div v-if="visibleSelectedItem.updateTime"><dt>更新于</dt><dd>{{ visibleSelectedItem.updateTime }}</dd></div></dl>
        <div v-if="deletionUncertain" class="detail-actions"><button class="button button-secondary" type="button" @click="closeAndRefresh">关闭并核对账目</button></div>
        <template v-else-if="confirmDelete"><p class="error">确定删除「{{ visibleSelectedItem.item }}」？删除后无法恢复，Web 版也会同时删除。</p><div class="detail-actions"><button class="button button-secondary" type="button" :disabled="deleting" @click="confirmDelete = false">保留账目</button><button class="button button-danger" type="button" :disabled="deleting" @click="deleteSelected">{{ deleting ? '删除中…' : '确定删除' }}</button></div></template>
        <div v-else class="detail-actions"><button class="button button-secondary" type="button" @click="confirmDelete = true">删除账目</button><button class="button button-primary" type="button" :disabled="!dictionariesReady" @click="editSelected">编辑账目</button></div>
      </template>
    </dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import ItemEditor from '../components/ItemEditor.vue';
import { ApiError, type LifeApi } from '../services/api';
import type { DictionaryOption, ItemFilters, ItemKind, ItemList, LifeItem } from '../types';
import { monthRange, today } from '../utils/time';
import { isVisibleItemType, itemFilterType } from '../utils/incomeVisibility';

const props = withDefaults(defineProps<{ api: LifeApi; revision: number; hideIncome?: boolean }>(), { hideIncome: true });
const emit = defineEmits<{ saved: [] }>();
const draftFilters = reactive<{ month: string; item: string; type: ItemKind | ''; itemType: string }>({ month: today().slice(0, 7), item: '', type: itemFilterType('', props.hideIncome), itemType: '' });
const initialRange = monthRange(draftFilters.month);
const filters = reactive<ItemFilters>({ page: 1, limit: 20, type: draftFilters.type, itemDateStart: initialRange.start, itemDateEnd: initialRange.end });
const appliedMonth = ref(draftFilters.month);
const result = ref<ItemList | null>(null);
const resultMode = ref(props.hideIncome);
const loading = ref(false);
const listError = ref('');
const successMessage = ref('');
const itemTypes = ref<DictionaryOption[]>([]);
const payTypes = ref<DictionaryOption[]>([]);
const dictionaryError = ref('');
const loadingDictionaries = ref(false);
const editorDialog = ref<HTMLDialogElement | null>(null);
const detailsDialog = ref<HTMLDialogElement | null>(null);
const editorComponent = ref<InstanceType<typeof ItemEditor> | null>(null);
const editorOpen = ref(false);
const editorKey = ref(0);
const editingItem = ref<LifeItem | null>(null);
const selectedItem = ref<LifeItem | null>(null);
const loadingDetails = ref(false);
const detailError = ref('');
const confirmDelete = ref(false);
const deleting = ref(false);
const deletionUncertain = ref(false);
let listRequest = 0;
let dictionaryRequest = 0;
let detailRequest = 0;
let alive = true;
const dictionariesReady = computed(() => itemTypes.value.length > 0 && payTypes.value.length > 0 && !loadingDictionaries.value && !dictionaryError.value);
const visibleItems = computed(() => (result.value?.items || []).filter(item => isVisibleItemType(item.type, props.hideIncome)));
const visibleSelectedItem = computed(() => selectedItem.value && isVisibleItemType(selectedItem.value.type, props.hideIncome) ? selectedItem.value : null);
const totalPages = computed(() => Math.max(1, Math.ceil((result.value?.count ?? 0) / filters.limit)));
const appliedMonthLabel = computed(() => `${appliedMonth.value.slice(0, 4)} 年 ${Number(appliedMonth.value.slice(5))} 月`);
const money = (value: number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const kindLabel = (kind: ItemKind) => ({ 0: '支出', 1: '收入', 99: '转出', 100: '转入' })[kind];
const categoryLabel = (key: string) => itemTypes.value.find((option) => option.key === key)?.value ?? (key ? `分类 ${key}` : '未分类');
const paymentLabel = (key: string) => payTypes.value.find((option) => option.key === key)?.value ?? (key ? `支付方式 ${key}` : '未填写');
const messageFor = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

async function loadDictionaries() {
  const request = ++dictionaryRequest;
  loadingDictionaries.value = true;
  dictionaryError.value = '';
  try {
    const [categories, payments] = await Promise.all([props.api.getDictionary('item_type'), props.api.getDictionary('pay_type')]);
    if (!alive || request !== dictionaryRequest) return;
    itemTypes.value = categories;
    payTypes.value = payments;
    if (!categories.length || !payments.length) dictionaryError.value = '服务端尚未配置分类或支付方式，请先在 Web 版数据字典中配置后重试。';
  } catch (cause) {
    if (alive && request === dictionaryRequest) dictionaryError.value = `无法加载分类与支付方式：${messageFor(cause, '请检查网络后重试。')}`;
  } finally {
    if (alive && request === dictionaryRequest) loadingDictionaries.value = false;
  }
}

async function loadItems() {
  const request = ++listRequest;
  const api = props.api;
  const hideIncome = props.hideIncome;
  const query = { ...filters, type: itemFilterType(filters.type, hideIncome) };
  loading.value = true;
  listError.value = '';
  result.value = null;
  try {
    const response = await api.listItems(query);
    if (!alive || request !== listRequest || api !== props.api || hideIncome !== props.hideIncome) return;
    if (!response.items.length && response.count > 0 && filters.page > 1) {
      filters.page = Math.max(1, Math.ceil(response.count / filters.limit));
      await loadItems();
      return;
    }
    resultMode.value = hideIncome;
    result.value = response;
  } catch (cause) {
    if (alive && request === listRequest) listError.value = messageFor(cause, '读取失败，请检查网络后重试。');
  } finally {
    if (alive && request === listRequest) loading.value = false;
  }
}

function applyFilters() {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(draftFilters.month)) return;
  const range = monthRange(draftFilters.month);
  draftFilters.type = itemFilterType(draftFilters.type, props.hideIncome);
  Object.assign(filters, { page: 1, item: draftFilters.item.trim(), type: draftFilters.type, itemType: draftFilters.itemType, itemDateStart: range.start, itemDateEnd: range.end });
  appliedMonth.value = draftFilters.month;
  successMessage.value = '';
  void loadItems();
}

function changePage(offset: number) { filters.page += offset; void loadItems(); }
function refreshCurrent() { successMessage.value = ''; void loadItems(); }

async function openEditor(item: LifeItem | null) {
  if (!dictionariesReady.value || (item && !isVisibleItemType(item.type, props.hideIncome))) return;
  editingItem.value = item;
  editorKey.value += 1;
  editorOpen.value = true;
  await nextTick();
  if (alive && !editorDialog.value?.open) editorDialog.value?.showModal();
}

function cancelEditor() {
  if (editorComponent.value?.saving) return;
  const needsVerification = editorComponent.value?.uncertain;
  const submitted = editorComponent.value?.submittedItem;
  editorDialog.value?.close();
  editorOpen.value = false;
  if (needsVerification) {
    if (submitted && !isVisibleItemType(submitted.type, props.hideIncome)) {
      successMessage.value = '保存结果尚未确认，请先在设置中关闭隐藏收入后核对账目，避免重复记账。';
      emit('saved');
      void loadItems();
      return;
    }
    if (submitted) {
      const month = submitted.itemDate.slice(0, 7);
      const range = monthRange(month);
      const type = itemFilterType(submitted.type, props.hideIncome);
      Object.assign(draftFilters, { month, item: submitted.item, type, itemType: '' });
      Object.assign(filters, { page: 1, item: submitted.item, type, itemType: '', itemDateStart: range.start, itemDateEnd: range.end });
      appliedMonth.value = month;
    }
    successMessage.value = '保存结果尚未确认，已按本次日期与名称查询，请核对明细，避免重复记账。';
    emit('saved');
    void loadItems();
  }
}

async function itemSaved() {
  editorDialog.value?.close();
  editorOpen.value = false;
  successMessage.value = '账目已保存到服务器。';
  filters.page = 1;
  emit('saved');
  await loadItems();
  if (listError.value) successMessage.value = '账目已保存到服务器，但列表刷新失败。请重试查询，无需重复记账。';
}

async function openDetails(id: number) {
  const request = ++detailRequest;
  selectedItem.value = null;
  detailError.value = '';
  confirmDelete.value = false;
  deletionUncertain.value = false;
  loadingDetails.value = true;
  detailsDialog.value?.showModal();
  try {
    const item = await props.api.getItem(id);
    if (alive && request === detailRequest) {
      if (isVisibleItemType(item.type, props.hideIncome)) selectedItem.value = item;
      else detailError.value = '当前记录已隐藏，可在设置中关闭隐藏收入后查看。';
    }
  } catch (cause) {
    if (alive && request === detailRequest) detailError.value = messageFor(cause, '详情加载失败，请关闭后重试。');
  } finally {
    if (alive && request === detailRequest) loadingDetails.value = false;
  }
}

function closeDetails() {
  if (deleting.value) return;
  const needsVerification = deletionUncertain.value;
  detailRequest += 1;
  detailsDialog.value?.close();
  selectedItem.value = null;
  confirmDelete.value = false;
  deletionUncertain.value = false;
  if (needsVerification) {
    successMessage.value = '删除结果尚未确认，请核对刷新后的明细。';
    emit('saved');
    void loadItems();
  }
}

function editSelected() {
  if (!visibleSelectedItem.value) return;
  const item = visibleSelectedItem.value;
  closeDetails();
  void openEditor(item);
}

function closeAndRefresh() {
  closeDetails();
}

async function deleteSelected() {
  if (!visibleSelectedItem.value || deleting.value || deletionUncertain.value) return;
  const id = visibleSelectedItem.value.id;
  const api = props.api;
  deleting.value = true;
  detailError.value = '';
  try {
    await api.deleteItem(id);
    if (!alive || api !== props.api) return;
    deleting.value = false;
    closeDetails();
    successMessage.value = '账目已从服务器删除。';
    emit('saved');
    await loadItems();
    if (listError.value) successMessage.value = '账目已删除，但列表刷新失败。请重试查询。';
  } catch (cause) {
    if (alive && api === props.api) {
      deletionUncertain.value = cause instanceof ApiError && cause.uncertain;
      detailError.value = messageFor(cause, '删除失败，请检查网络后重试。');
    }
  } finally {
    if (alive && api === props.api) deleting.value = false;
  }
}

watch(() => props.hideIncome, hideIncome => {
  draftFilters.type = itemFilterType('', hideIncome);
  Object.assign(filters, { page: 1, type: draftFilters.type });
  result.value = null;
  successMessage.value = '';
  if (hideIncome) {
    if (!deleting.value && (loadingDetails.value || (selectedItem.value && !isVisibleItemType(selectedItem.value.type, true)))) {
      detailRequest += 1;
      loadingDetails.value = false;
      detailsDialog.value?.close();
      selectedItem.value = null;
      confirmDelete.value = false;
    }
    if (editingItem.value && !isVisibleItemType(editingItem.value.type, true) && !editorComponent.value?.saving) cancelEditor();
  }
  void loadItems();
}, { flush: 'sync' });
watch(() => props.revision, () => { void loadItems(); });
watch(() => props.api, () => {
  dictionaryRequest += 1;
  detailRequest += 1;
  editorDialog.value?.close();
  detailsDialog.value?.close();
  editorOpen.value = false;
  deleting.value = false;
  confirmDelete.value = false;
  deletionUncertain.value = false;
  selectedItem.value = null;
  itemTypes.value = [];
  payTypes.value = [];
  successMessage.value = '';
  void loadDictionaries();
  void loadItems();
});
onMounted(() => { void loadDictionaries(); void loadItems(); });
onBeforeUnmount(() => { alive = false; listRequest += 1; dictionaryRequest += 1; detailRequest += 1; });
</script>

<style scoped>
.items-page { padding-bottom: 12px; }
.ledger-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 25px; }
.eyebrow { font-size: 10px; letter-spacing: .13em; color: #77846e; margin: 0 0 9px; font-weight: 700; }
.ledger-heading h1 { margin: 0; font-size: 30px; letter-spacing: -.04em; }
.heading-copy { margin: 9px 0 0; color: #7c8479; font-size: 13px; line-height: 1.6; }
.add-button { flex-shrink: 0; white-space: nowrap; min-height: 46px; padding: 0 17px; }
.add-button > span { font-size: 21px; margin-right: 2px; }
.filters { padding: 18px; margin-bottom: 16px; }
.income-hidden-note { margin: 0 0 16px; color: #7c8479; font-size: 12px; line-height: 1.6; }
.filter-top, .filter-bottom { display: grid; gap: 12px; align-items: end; }
.filter-top { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); margin-bottom: 13px; }
.filter-bottom { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
.filter-submit { min-height: 46px; padding-inline: 18px; }
.dictionary-error { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.dictionary-error span { flex: 1 1 200px; }
.result-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 25px 0 15px; }
.result-heading h2 { font-size: 18px; margin: 0; }
.refresh-button { min-width: 60px; min-height: 44px; background: transparent; color: #5b7151; border: 0; font-size: 13px; font-weight: 600; }
.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.summary-grid.income-hidden { grid-template-columns: 1fr; }
.summary-box { padding: 17px 18px; border-radius: 16px; background: #f1e9dd; min-width: 0; }
.summary-box > span { display: block; font-size: 12px; color: #8b6d52; margin-bottom: 9px; }
.summary-box > strong { font-size: clamp(19px, 5.5vw, 27px); font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.summary-box.income { background: #e7eddd; }
.summary-box.income > span { color: #62764e; }
.transfer-summary { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 13px; font-size: 12px; color: #677760; }
.transfer-summary > span:last-child { color: #93998b; }
.result-count { font-size: 11px; color: #8a9182; margin: 16px 0 10px; }
.item-list { border-radius: 17px; background: #fff; border: 1px solid #e7e9df; overflow: hidden; }
.item-card { display: flex; align-items: center; width: 100%; gap: 12px; padding: 18px 15px; min-height: 90px; background: #fff; border: 0; text-align: left; color: inherit; border-bottom: 1px solid #f0f1e9; }
.item-card:last-child { border-bottom: 0; }
.item-card:hover { background: #fafbf7; }
.item-card:focus-visible { outline-offset: -3px; }
.item-kind-icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 40px; border-radius: 13px; background: #f3eadd; color: #9e7d57; font-size: 22px; }
.item-kind-icon.income { background: #eaf0e1; color: #6f8655; }
.item-main { display: grid; gap: 6px; min-width: 0; flex: 1; }
.item-main > strong { font-size: 15px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.item-main > span { color: #8c9485; font-size: 11px; }
.item-main .item-remark { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-amount { display: grid; gap: 6px; text-align: right; flex-shrink: 0; }
.item-amount > strong { font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; }
.item-amount > strong.income { color: #64834d; }
.item-amount > span { font-size: 11px; color: #a0a695; }
.item-chevron { color: #b3b9a9; font-size: 22px; }
.pagination { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 18px; }
.pagination > span { font-size: 12px; color: #7a8771; }
.pagination .button { padding: 0 14px; }
.empty { margin-top: 12px; }
.empty-icon { font-size: 32px; color: #a0ae8e; margin: 8px; }
.empty h3 { font-size: 16px; font-weight: 600; }
.empty p { font-size: 13px; }
.empty .button { margin-top: 15px; }
.ledger-dialog { width: min(100% - 24px, 520px); max-height: min(90dvh, 960px); overflow-y: auto; overscroll-behavior: contain; border: 1px solid #e5e9dd; border-radius: 24px; padding: 0; background: #fffefa; color: #2f3d30; box-shadow: 0 24px 100px #14241638; }
.ledger-dialog::backdrop { background: #17231470; backdrop-filter: blur(4px); }
.detail-dialog { padding: 24px; }
.detail-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.detail-heading h2 { font-size: 20px; margin: 0; }
.close-button { width: 44px; height: 44px; border: 0; border-radius: 50%; background: #f1f3ee; color: #34473a; font-size: 28px; }
.detail-hero { text-align: center; padding: 24px 0; }
.detail-hero > span { display: block; font-size: 12px; color: #7c8b73; }
.detail-hero > strong { display: block; font-size: 38px; font-variant-numeric: tabular-nums; font-weight: 650; margin: 8px 0; overflow-wrap: anywhere; }
.detail-hero > h3 { font-size: 17px; line-height: 1.6; overflow-wrap: anywhere; margin: 0; }
.detail-fields { margin: 0 0 24px; border-top: 1px solid #e8ecdf; }
.detail-fields > div { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 16px; padding: 12px 0; border-bottom: 1px solid #eef0e7; font-size: 13px; line-height: 1.6; }
.detail-fields dt { color: #8b9580; }
.detail-fields dd { margin: 0; text-align: right; white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 380px) { .ledger-heading { align-items: flex-start; } .ledger-heading h1 { font-size: 25px; } .heading-copy { max-width: 170px; } .add-button { padding-inline: 12px; } .filters { padding: 14px; } .filter-bottom { gap: 8px; } .filter-submit { padding-inline: 12px; } .item-card { gap: 8px; padding-inline: 11px; } .item-kind-icon { width: 32px; height: 36px; flex-basis: 32px; } .item-amount > strong { font-size: 14px; } .item-chevron { display: none; } .detail-dialog { padding: 20px 16px; } }
@media (prefers-reduced-motion: reduce) { .ledger-dialog::backdrop { backdrop-filter: none; } }
</style>
