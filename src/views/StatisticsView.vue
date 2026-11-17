<template>
  <section class="statistics-view" aria-labelledby="statistics-title">
    <div class="page-heading statistics-heading">
      <div>
        <p class="section-eyebrow">看见每一笔生活</p>
        <h2 id="statistics-title">收支统计</h2>
      </div>
      <button class="button button-secondary refresh-button" type="button" :disabled="loading" @click="loadReports">
        {{ loading ? '查询中…' : '刷新' }}
      </button>
    </div>

    <div class="period-selector panel">
      <label class="field">
        <span>年份</span>
        <select v-model="selectedYear" aria-label="统计年份">
          <option v-for="year in yearOptions" :key="year" :value="String(year)">{{ year }} 年</option>
        </select>
      </label>
      <label class="field">
        <span>月份</span>
        <select v-model="selectedMonth" aria-label="统计月份">
          <option v-for="month in 12" :key="month" :value="String(month).padStart(2, '0')">{{ month }} 月</option>
        </select>
      </label>
    </div>

    <p class="statistics-note">统计与 Web 版共用云端数据，转入和转出不计入收入、支出及结余。</p>

    <div v-if="loading" class="panel loading-panel" role="status" aria-live="polite">
      <span class="loading-dot" aria-hidden="true"></span>
      正在查询 {{ selectedYear }} 年 {{ Number(selectedMonth) }} 月统计…
    </div>

    <div v-else-if="error" class="panel error-panel" role="alert">
      <p class="error">{{ error }}</p>
      <p class="statistics-note">当前统计尚未加载，请重试。</p>
      <button class="button button-secondary" type="button" @click="loadReports">重新查询</button>
    </div>

    <template v-else-if="totalReport && monthlyReport && categoryReport">
      <section class="month-overview" aria-labelledby="month-overview-title">
        <div class="overview-topline">
          <h3 id="month-overview-title">{{ selectedYear }} 年 {{ Number(selectedMonth) }} 月</h3>
          <span>月度收支</span>
        </div>
        <p class="balance-label">本月结余</p>
        <p class="balance-amount">{{ formatMoney(monthBalance) }}</p>
        <dl class="month-amounts">
          <div>
            <dt><span class="amount-marker income-marker" aria-hidden="true"></span>收入</dt>
            <dd>{{ formatMoney(monthIncome) }}</dd>
          </div>
          <div>
            <dt><span class="amount-marker expense-marker" aria-hidden="true"></span>支出</dt>
            <dd>{{ formatMoney(totalReport.monthTotal) }}</dd>
          </div>
        </dl>
        <p v-if="monthIncome === 0 && totalReport.monthTotal === 0" class="month-empty">本月暂无收入或支出记录</p>
      </section>

      <section class="panel annual-panel" aria-labelledby="annual-title">
        <div class="panel-heading">
          <h3 id="annual-title">{{ selectedYear }} 年概览</h3>
          <span class="subtle-label">整年汇总</span>
        </div>
        <dl class="annual-amounts">
          <div>
            <dt>全年收入</dt>
            <dd class="income-text">{{ formatMoney(totalReport.yearIncomeTotal) }}</dd>
          </div>
          <div>
            <dt>全年支出</dt>
            <dd class="expense-text">{{ formatMoney(totalReport.yearTotal) }}</dd>
          </div>
          <div>
            <dt>全年结余</dt>
            <dd>{{ formatMoney(totalReport.yearIncomeTotal - totalReport.yearTotal) }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel trend-panel" aria-labelledby="trend-title">
        <div class="panel-heading trend-heading">
          <h3 id="trend-title">每月收支</h3>
          <div class="chart-legend" aria-hidden="true">
            <span><i class="legend-dot income-fill"></i>收入</span>
            <span><i class="legend-dot expense-fill"></i>支出</span>
          </div>
        </div>
        <p class="statistics-note chart-description">{{ selectedYear }} 年 12 个月的收入与支出，金额单位：元。</p>
        <div v-if="!hasYearData" class="empty chart-empty">这一年暂无收入或支出记录</div>
        <ol v-else class="trend-list" aria-label="每月收入与支出金额">
          <li v-for="month in trendRows" :key="month.index" class="trend-row" :class="{ 'selected-trend-row': month.index === monthIndex }">
            <span class="trend-month">{{ month.index + 1 }} 月</span>
            <div class="trend-series">
              <div class="bar-line">
                <span class="bar-track" aria-hidden="true"><span class="bar-fill income-fill" :style="{ width: barWidth(month.income) }"></span></span>
                <span class="bar-amount"><span class="visually-hidden">收入 </span>{{ formatMoney(month.income) }}</span>
              </div>
              <div class="bar-line">
                <span class="bar-track" aria-hidden="true"><span class="bar-fill expense-fill" :style="{ width: barWidth(month.expense) }"></span></span>
                <span class="bar-amount"><span class="visually-hidden">支出 </span>{{ formatMoney(month.expense) }}</span>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <section class="panel category-panel" aria-labelledby="category-title">
        <div class="panel-heading">
          <h3 id="category-title">{{ Number(selectedMonth) }} 月支出分类</h3>
          <span class="subtle-label">占本月支出</span>
        </div>
        <div v-if="categories.length === 0" class="empty chart-empty">
          {{ totalReport.monthTotal > 0 ? '本月有支出，但暂无可显示的分类，请检查 Web 版数据字典。' : '本月暂无分类支出' }}
        </div>
        <ul v-else class="category-list" aria-label="支出分类金额与占比">
          <li v-for="(category, index) in categories" :key="`${category.name}-${index}`" class="category-row">
            <div class="category-topline">
              <span class="category-name"><i class="category-dot" :style="{ background: categoryColor(index) }" aria-hidden="true"></i>{{ category.name || '未分类' }}</span>
              <strong>{{ formatMoney(category.amount) }}</strong>
            </div>
            <div class="category-bottomline">
              <span class="category-track" aria-hidden="true"><span :style="{ width: categoryWidth(category.amount), background: categoryColor(index) }"></span></span>
              <span class="category-percentage">{{ categoryPercentage(category.amount) }}%</span>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { LifeApi } from '../services/api';
import { formatMoney, today } from '../utils/time';

const props = defineProps<{ api: LifeApi; revision: number }>();

type TotalReport = Awaited<ReturnType<LifeApi['getTotalReport']>>;
type MonthlyReport = Awaited<ReturnType<LifeApi['getMonthlyReport']>>;
type CategoryReport = Awaited<ReturnType<LifeApi['getCategoryReport']>>;

const initialDay = today();
const currentYear = Number(initialDay.slice(0, 4));
const yearOptions = Array.from({ length: currentYear - 1970 + 2 }, (_, index) => currentYear + 1 - index);
const selectedYear = ref(initialDay.slice(0, 4));
const selectedMonth = ref(initialDay.slice(5, 7));
const loading = ref(false);
const error = ref('');
const totalReport = ref<TotalReport | null>(null);
const monthlyReport = ref<MonthlyReport | null>(null);
const categoryReport = ref<CategoryReport | null>(null);
let requestVersion = 0;

const monthIndex = computed(() => Number(selectedMonth.value) - 1);
const monthIncome = computed(() => monthlyReport.value?.income[monthIndex.value] || 0);
const monthBalance = computed(() => monthIncome.value - (totalReport.value?.monthTotal || 0));
const trendRows = computed(() => Array.from({ length: 12 }, (_, index) => ({
  index,
  income: monthlyReport.value?.income[index] || 0,
  expense: monthlyReport.value?.expense[index] || 0,
})));
const hasYearData = computed(() => trendRows.value.some((month) => month.income !== 0 || month.expense !== 0));
const trendMaximum = computed(() => Math.max(1, ...trendRows.value.flatMap((month) => [month.income, month.expense])));
const categories = computed(() => [...(categoryReport.value || [])].filter((category) => category.amount !== 0).sort((a, b) => b.amount - a.amount));
const categoryPalette = ['#237e6c', '#d08a47', '#679c89', '#a5b58b', '#798daf', '#b78291'];

function barWidth(amount: number) {
  return `${Math.max(0, Math.min(100, amount / trendMaximum.value * 100))}%`;
}

function categoryPercentage(amount: number) {
  const total = totalReport.value?.monthTotal || 0;
  return total > 0 ? (amount / total * 100).toFixed(1) : '0.0';
}

function categoryWidth(amount: number) {
  const total = totalReport.value?.monthTotal || 0;
  return `${total > 0 ? Math.max(0, Math.min(100, amount / total * 100)) : 0}%`;
}

function categoryColor(index: number) {
  return categoryPalette[index % categoryPalette.length];
}

async function loadReports() {
  const version = ++requestVersion;
  const year = selectedYear.value;
  const month = `${year}-${selectedMonth.value}`;
  loading.value = true;
  error.value = '';
  totalReport.value = null;
  monthlyReport.value = null;
  categoryReport.value = null;

  try {
    const [totals, monthly, categoriesResult] = await Promise.all([
      props.api.getTotalReport({ year, month, day: today() }),
      props.api.getMonthlyReport(year),
      props.api.getCategoryReport(month),
    ]);
    if (version !== requestVersion) return;
    totalReport.value = totals;
    monthlyReport.value = monthly;
    categoryReport.value = categoriesResult;
  } catch (cause) {
    if (version !== requestVersion) return;
    error.value = cause instanceof Error ? cause.message : '统计查询失败，请重试';
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

watch([() => props.api, () => props.revision, selectedYear, selectedMonth], loadReports, { immediate: true });
onBeforeUnmount(() => { requestVersion += 1; });
</script>

<style scoped>
.statistics-view { display: grid; gap: 18px; min-width: 0; }
.statistics-heading { margin-bottom: 0; }
.statistics-heading h2 { margin: 4px 0 0; font-size: 26px; letter-spacing: -0.04em; }
.section-eyebrow { margin: 0; color: #74827b; font-size: 12px; }
.refresh-button { flex-shrink: 0; }
.period-selector { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 16px; }
.period-selector .field { display: grid; gap: 7px; min-width: 0; }
.period-selector .field > span { color: #687870; font-size: 12px; }
.period-selector select { width: 100%; min-height: 46px; padding: 10px 12px; border: 1px solid #dce5dd; border-radius: 12px; background: #fffefa; color: #223a30; font: inherit; }
.statistics-note { margin: 0; color: #748078; font-size: 12px; line-height: 1.7; }
.loading-panel { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 180px; padding: 20px; color: #63786b; font-size: 14px; text-align: center; }
.loading-dot { width: 9px; height: 9px; border-radius: 50%; background: #237e6c; flex-shrink: 0; }
.error-panel { display: grid; justify-items: start; gap: 12px; padding: 22px; }
.error-panel .error { margin: 0; overflow-wrap: anywhere; }
.month-overview { padding: 24px; border-radius: 24px; background: linear-gradient(125deg, #22594a, #2e7461); color: #fffdf7; box-shadow: 0 12px 28px #214f3b16; }
.overview-topline { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 25px; }
.overview-topline h3 { margin: 0; font-size: 15px; font-weight: 600; }
.overview-topline > span { color: #ddeddd; font-size: 11px; }
.balance-label { margin: 0 0 7px; color: #d6e5dc; font-size: 13px; }
.balance-amount { margin: 0; font-size: clamp(28px, 8vw, 40px); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; overflow-wrap: anywhere; }
.month-amounts { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 23px 0 0; padding-top: 19px; border-top: 1px solid #ffffff25; }
.month-amounts > div, .annual-amounts > div { min-width: 0; }
.month-amounts dt { display: flex; align-items: center; gap: 6px; color: #e2ece4; font-size: 12px; }
.month-amounts dd { margin: 7px 0 0; font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.amount-marker { width: 6px; height: 6px; border-radius: 50%; }
.income-marker { background: #bbdcb8; }
.expense-marker { background: #f3c59a; }
.month-empty { margin: 18px 0 0; font-size: 12px; color: #d6e5dc; }
.annual-panel, .trend-panel, .category-panel { min-width: 0; padding: 20px; }
.panel-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.panel-heading h3 { margin: 0; color: #2b3c31; font-size: 16px; font-weight: 650; }
.subtle-label { color: #89938b; font-size: 11px; }
.annual-amounts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 13px; margin: 22px 0 2px; }
.annual-amounts dt { color: #7a837b; font-size: 11px; }
.annual-amounts dd { margin: 8px 0 0; color: #33483b; font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.annual-amounts .income-text { color: #287761; }
.annual-amounts .expense-text { color: #b57943; }
.chart-legend { display: flex; gap: 12px; color: #7c847d; font-size: 10px; }
.chart-legend > span { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot { width: 6px; height: 6px; border-radius: 50%; }
.income-fill { background: #367f68; }
.expense-fill { background: #d7aa77; }
.chart-description { margin-top: 10px; }
.chart-empty { padding: 32px 6px; color: #89938b; font-size: 13px; line-height: 1.7; text-align: center; }
.trend-list { display: grid; gap: 4px; margin: 18px -7px 0; padding: 0; list-style: none; }
.trend-row { display: grid; grid-template-columns: 35px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 43px; padding: 6px 7px; border-radius: 9px; }
.selected-trend-row { background: #edf2e9; }
.trend-month { color: #6f7e72; font-size: 11px; }
.selected-trend-row .trend-month { color: #2e6d56; font-weight: 700; }
.trend-series { display: grid; gap: 6px; min-width: 0; }
.bar-line { display: grid; grid-template-columns: minmax(0, 1fr) 6.4rem; align-items: center; gap: 10px; min-width: 0; }
.bar-track { height: 5px; border-radius: 5px; background: #f0f1e9; overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: inherit; }
.bar-amount { color: #657367; font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1.2; text-align: right; overflow-wrap: anywhere; }
.category-list { display: grid; gap: 21px; margin: 25px 0 3px; padding: 0; list-style: none; }
.category-row { min-width: 0; }
.category-topline { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; min-width: 0; }
.category-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; color: #526254; font-size: 13px; overflow-wrap: anywhere; }
.category-dot { flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%; }
.category-topline strong { min-width: 0; color: #3d5141; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
.category-bottomline { display: grid; grid-template-columns: minmax(0, 1fr) 45px; align-items: center; gap: 10px; margin-top: 9px; }
.category-track { height: 5px; border-radius: 5px; background: #f1f0e8; overflow: hidden; }
.category-track > span { display: block; height: 100%; border-radius: inherit; }
.category-percentage { color: #8a948a; font-size: 10px; font-variant-numeric: tabular-nums; text-align: right; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 360px) {
  .statistics-view { gap: 14px; }
  .month-overview { padding: 21px; }
  .annual-panel, .trend-panel, .category-panel { padding: 17px; }
  .annual-amounts { gap: 9px; }
  .annual-amounts dd { font-size: 13px; }
  .month-amounts dd { font-size: 17px; }
  .trend-row { gap: 5px; grid-template-columns: 31px minmax(0, 1fr); }
  .bar-line { grid-template-columns: minmax(0, 1fr) 5.8rem; gap: 7px; }
}
</style>
