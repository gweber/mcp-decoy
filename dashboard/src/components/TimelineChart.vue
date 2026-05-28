<template>
  <div class="chart-card">
    <div class="chart-header">
      <span class="chart-title">Request Timeline</span>
      <span class="chart-badge">last 60 min</span>
    </div>
    <div class="chart-body">
      <div v-if="!timeline.length" class="chart-empty">No timeline data yet</div>
      <Line v-else :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler)

const props = defineProps({
  timeline: { type: Array, default: () => [] },
})

function formatMinute(isoMinute) {
  // isoMinute: "2026-04-22T14:30"
  const d = new Date(isoMinute + ':00Z')
  if (isNaN(d)) return isoMinute.slice(-5)
  return d.toISOString().slice(11, 16)
}

const chartData = computed(() => ({
  labels: props.timeline.map((p) => formatMinute(p.minute)),
  datasets: [
    {
      label: 'Requests',
      data: props.timeline.map((p) => p.count),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.15)',
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      pointBackgroundColor: '#3b82f6',
      tension: 0.4,
      fill: true,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e293b',
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      borderColor: '#334155',
      borderWidth: 1,
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    x: {
      grid: { color: '#334155' },
      ticks: {
        color: '#94a3b8',
        font: { size: 10 },
        maxTicksLimit: 12,
        maxRotation: 0,
      },
    },
    y: {
      grid: { color: '#334155' },
      ticks: {
        color: '#94a3b8',
        font: { size: 11 },
        stepSize: 1,
        precision: 0,
      },
      beginAtZero: true,
    },
  },
  interaction: {
    mode: 'index',
    intersect: false,
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
