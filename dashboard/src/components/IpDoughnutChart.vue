<template>
  <div class="chart-card">
    <div class="chart-header">
      <span class="chart-title">Top IPs</span>
      <span class="chart-badge">{{ topIps.length }} sources</span>
    </div>
    <div class="chart-body">
      <div v-if="!topIps.length" class="chart-empty">
        <span class="empty-icon">&#9673;</span>
        <span>No data</span>
      </div>
      <template v-else>
        <div class="doughnut-wrap">
          <Doughnut :data="chartData" :options="chartOptions" />
          <div class="doughnut-center">
            <span class="center-value">{{ totalRequests }}</span>
            <span class="center-label">total</span>
          </div>
        </div>
        <ul class="ip-legend">
          <li v-for="(item, i) in topIps" :key="item.ip" class="legend-item">
            <span class="legend-dot" :style="{ background: COLORS[i % COLORS.length] }"></span>
            <span class="legend-ip">{{ item.ip }}</span>
            <span class="legend-count">{{ item.count }}</span>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  topIps: { type: Array, default: () => [] },
})

const COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

const totalRequests = computed(() =>
  props.topIps.reduce((s, ip) => s + ip.count, 0)
)

const chartData = computed(() => ({
  labels: props.topIps.map((t) => t.ip),
  datasets: [
    {
      data: props.topIps.map((t) => t.count),
      backgroundColor: props.topIps.map((_, i) => COLORS[i % COLORS.length] + 'cc'),
      borderColor: props.topIps.map((_, i) => COLORS[i % COLORS.length]),
      borderWidth: 1,
      hoverOffset: 6,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 220px;
}

.chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.3;
}

.doughnut-wrap {
  position: relative;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.doughnut-center {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.center-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
}

.center-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ip-legend {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-ip {
  flex: 1;
  font-size: 12px;
  color: var(--text);
  font-family: 'Menlo', 'Monaco', monospace;
}

.legend-count {
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}
</style>
