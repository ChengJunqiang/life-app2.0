<template>
  <form ref="formElement" class="editor" novalidate @submit.prevent="save">
    <div class="editor-heading">
      <div>
        <p class="eyebrow">记录生活的每一笔</p>
        <h2>{{ item ? '编辑账目' : '记一笔' }}</h2>
      </div>
      <button class="close-button" type="button" aria-label="关闭记账表单" :disabled="saving" @click="emit('cancel')">×</button>
    </div>

    <fieldset class="kind-field" :disabled="saving">
      <legend>收支类型</legend>
      <div class="kind-options">
        <label v-for="kind in kinds" :key="kind.value" :class="['kind-option', { selected: draft.type === kind.value }]">
          <input v-model="draft.type" type="radio" name="type" :value="kind.value" />
          {{ kind.label }}
        </label>
      </div>
    </fieldset>

    <label class="amount-field">
      <span>金额（元）</span>
      <div class="amount-input"><span aria-hidden="true">¥</span><input v-model="amount" name="money" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" :disabled="saving" :aria-describedby="error ? errorId : undefined" /></div>
    </label>

    <div class="editor-grid">
      <label class="field full-width">
        <span>名称 <span aria-hidden="true">*</span></span>
        <input v-model="draft.item" name="item" placeholder="例如：午餐、工资" autocomplete="off" :disabled="saving" autofocus />
      </label>
      <label class="field">
        <span>日期 <span aria-hidden="true">*</span></span>
        <input v-model="draft.itemDate" name="itemDate" type="date" :disabled="saving" />
      </label>
      <label class="field">
        <span>分类 <span aria-hidden="true">*</span></span>
        <select v-model="draft.itemType" name="itemType" :disabled="saving || !itemTypes.length">
          <option value="" disabled>请选择分类</option>
          <option v-if="draft.itemType && !hasCategory" :value="draft.itemType" disabled>{{ draft.itemType }}（分类已停用）</option>
          <option v-for="option in itemTypes" :key="option.key" :value="option.key">{{ option.value }}</option>
        </select>
      </label>
      <label class="field full-width">
        <span>支付方式 <span aria-hidden="true">*</span></span>
        <select v-model="draft.payType" name="payType" :disabled="saving || !payTypes.length">
          <option value="" disabled>请选择支付方式</option>
          <option v-if="draft.payType && !hasPayment" :value="draft.payType" disabled>{{ draft.payType }}（支付方式已停用）</option>
          <option v-for="option in payTypes" :key="option.key" :value="option.key">{{ option.value }}</option>
        </select>
      </label>
      <label class="field full-width">
        <span>备注</span>
        <textarea v-model="draft.remark" name="remark" rows="3" placeholder="补充一点细节（选填）" :disabled="saving"></textarea>
      </label>
      <label class="field full-width">
        <span>地点</span>
        <input v-model="draft.address" name="address" placeholder="选填" :disabled="saving" />
      </label>
    </div>

    <p v-if="!itemTypes.length || !payTypes.length" class="error" role="alert">分类或支付方式尚未加载。请关闭表单，在账目页重试加载后再记账。</p>
    <p v-if="error" :id="errorId" class="error" role="alert">{{ error }}</p>
    <p class="save-hint">联网提交，保存成功后会显示在 Web 版中。</p>
    <div class="editor-actions">
      <button class="button button-secondary" type="button" :disabled="saving" @click="emit('cancel')">取消</button>
      <button class="button button-primary" type="submit" :disabled="saving || uncertain || !itemTypes.length || !payTypes.length">{{ saving ? '正在保存…' : uncertain ? '请先核对账目' : '保存账目' }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue';
import { ApiError, type LifeApi } from '../services/api';
import type { DictionaryOption, ItemDraft, ItemKind, LifeItem } from '../types';
import { today } from '../utils/time';

const props = defineProps<{ api: LifeApi; item: LifeItem | null; itemTypes: DictionaryOption[]; payTypes: DictionaryOption[] }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();
const formElement = ref<HTMLFormElement | null>(null);
const errorId = useId();
const error = ref('');
const saving = ref(false);
const uncertain = ref(false);
const submittedItem = ref<ItemDraft | null>(null);
const amount = ref(props.item ? Number(props.item.money).toFixed(2) : '');
const kinds: Array<{ value: ItemKind; label: string }> = [{ value: 0, label: '支出' }, { value: 1, label: '收入' }, { value: 99, label: '转出' }, { value: 100, label: '转入' }];
const draft = reactive<ItemDraft>({
  ...(props.item ? { id: props.item.id } : {}),
  item: props.item?.item ?? '',
  itemType: props.item?.itemType ?? '',
  money: props.item?.money ?? 0,
  type: props.item?.type ?? 0,
  itemDate: props.item?.itemDate ?? today(),
  remark: props.item?.remark ?? '',
  payType: props.item?.payType ?? '',
  address: props.item?.address ?? '',
  imageUrl: props.item?.imageUrl ?? '',
});
const hasCategory = computed(() => props.itemTypes.some((option) => option.key === draft.itemType));
const hasPayment = computed(() => props.payTypes.some((option) => option.key === draft.payType));

function invalid(message: string, field: string) {
  error.value = message;
  formElement.value?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
}

async function save() {
  if (saving.value || uncertain.value) return;
  error.value = '';
  const moneyText = amount.value.trim();
  const money = Number(moneyText);
  if (!/^\d+(?:\.\d{1,2})?$/.test(moneyText) || !Number.isFinite(money) || money <= 0 || !Number.isSafeInteger(Math.round(money * 100))) {
    invalid('请输入大于 0 的金额，最多保留两位小数。', 'money');
    return;
  }
  if (!draft.item.trim()) { invalid('请填写账目名称。', 'item'); return; }
  const date = new Date(`${draft.itemDate}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.itemDate) || Number.isNaN(date.getTime()) || today(date) !== draft.itemDate) { invalid('请选择有效日期。', 'itemDate'); return; }
  if (!hasCategory.value) { invalid('请选择有效分类。', 'itemType'); return; }
  if (!hasPayment.value) { invalid('请选择有效支付方式。', 'payType'); return; }
  saving.value = true;
  submittedItem.value = { ...draft, item: draft.item.trim(), money, remark: draft.remark.trim(), address: draft.address.trim() };
  try {
    await props.api.saveItem(submittedItem.value);
    emit('saved');
  } catch (cause) {
    uncertain.value = cause instanceof ApiError && cause.uncertain;
    error.value = cause instanceof Error ? cause.message : '保存失败，请检查网络后重试。';
  } finally {
    saving.value = false;
  }
}

defineExpose({ saving, uncertain, submittedItem });
</script>

<style scoped>
.editor { padding: 24px; }
.editor-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; }
.editor-heading h2 { font-size: 26px; margin: 5px 0 0; }
.eyebrow { margin: 0; font-size: 12px; color: #6b786c; }
.close-button { width: 44px; height: 44px; border: 0; border-radius: 50%; background: #f1f3ee; color: #34473a; font-size: 28px; }
.kind-field { padding: 0; margin: 0 0 22px; border: 0; }
.kind-field legend { font-size: 13px; margin-bottom: 10px; color: #627065; }
.kind-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.kind-option { position: relative; display: flex; align-items: center; justify-content: center; min-height: 46px; border: 1px solid #dde3d8; border-radius: 12px; color: #58645b; font-size: 14px; cursor: pointer; }
.kind-option input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.kind-option:focus-within { outline: 2px solid #526d4e; outline-offset: 2px; }
.kind-option.selected { background: #e7eddd; border-color: #a9bc99; color: #344f2b; font-weight: 700; }
.amount-field { display: block; margin-bottom: 24px; }
.amount-field > span { display: block; font-size: 13px; color: #627065; margin-bottom: 9px; }
.amount-input { display: flex; align-items: baseline; gap: 8px; border-bottom: 2px solid #b5c0a8; padding: 5px 0 12px; }
.amount-input > span { font-size: 24px; color: #60714f; }
.amount-input input { min-width: 0; width: 100%; min-height: 48px; border: 0; box-shadow: none; background: transparent; padding: 0; border-radius: 0; font-size: 38px; font-weight: 650; font-variant-numeric: tabular-nums; color: #263c2c; outline-offset: 5px; }
.amount-input:focus-within { border-color: #526d4e; }
.editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.full-width { grid-column: 1 / -1; }
.editor-grid textarea { resize: vertical; min-height: 84px; }
.save-hint { color: #72816f; font-size: 12px; line-height: 1.6; margin: 20px 0 16px; }
.editor-actions { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
.editor-actions .button { min-height: 48px; }
@media (max-width: 380px) { .editor { padding: 20px 16px; } .editor-grid { grid-template-columns: 1fr; } .kind-option { font-size: 13px; } }
</style>
