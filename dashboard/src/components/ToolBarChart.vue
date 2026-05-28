<template>
  <div class="chart-card">
    <div class="chart-header">
      <span class="chart-title">Top Tools</span>
      <span class="chart-badge">{{ topTools.length }} tools</span>
    </div>
    <div class="chart-body">
      <div v-if="!topTools.length" class="chart-empty">No tool data yet</div>
      <Bar v-else :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps({
  topTools: { type: Array, default: () => [] },
})

const COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

const chartData = computed(() => ({
  labels: props.topTools.map((t) => t.name),
  datasets: [
    {
      label: 'Calls',
      data: props.topTools.map((t) => t.count),
      backgroundColor: props.topTools.map((_, i) => COLORS[i % COLORS.length] + 'cc'),
      borderColor: props.topTools.map((_, i) => COLORS[i % COLORS.length]),
      borderWidth: 1,
      borderRadius: 4,
      borderSkipped: false,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e293b',
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      borderColor: '#334155',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      grid: { color: '#334155' },
      ticks: { color: '#94a3b8', font: { size: 11 } },
    },
    y: {
      grid: { color: 'transparent' },
      ticks: {
        color: '#e2e8f0',
        font: { size: 11 },
        callback(val, idx) {
          const label = this.getLabelForValue(idx)
          return label.length > 22 ? label.slice(0, 22) + '…' : label
        },
      },
    },
  },
}
</script>

<style scoped>
.chart-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chart-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.chart-badge {
  font-size: 11px;
  color: var(--muted);
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 7px;
}

.chart-body {
  position: relative;
  height: 220px;
}

.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 13px;
}
</style>
