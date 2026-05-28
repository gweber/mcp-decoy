<template>
  <div class="dashboard">
    <div class="view-header">
      <h1 class="view-title">Overview</h1>
      <div class="header-meta">
        <span v-if="store.stats?.lastSeen" class="last-seen">
          Last activity: {{ relativeTime(store.stats.lastSeen) }}
        </span>
        <button class="refresh-btn" @click="refresh" :disabled="refreshing">
          <span :class="{ spinning: refreshing }">&#8635;</span>
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="stats-grid">
      <StatsCard
        title="Total Requests"
        :value="store.stats?.total ?? 0"
        :sub="store.stats?.firstSeen ? 'since ' + formatDate(store.stats.firstSeen) : ''"
        color="--primary"
      />
      <StatsCard
        title="Unique IPs"
        :value="store.stats?.uniqueIps ?? 0"
        sub="distinct source addresses"
        color="--warn"
      />
      <StatsCard
        title="Recent (1h)"
        :value="store.stats?.recentCount ?? 0"
        sub="requests in last hour"
        color="--success"
      />
      <StatsCard
        title="Detections"
        :value="store.stats?.detections?.total ?? 0"
        sub="security findings"
        color="--error"
      />
    </div>

    <!-- Charts Row -->
    <div class="charts-grid">
      <ToolBarChart :top-tools="store.stats?.topTools ?? []" />
      <IpDoughnutChart :top-ips="store.stats?.topIps ?? []" />
      <TimelineChart :timeline="store.timeline" />
    </div>

    <!-- Recent Detections -->
    <div class="recent-section">
      <div class="section-header">
        <h2 class="section-title">Recent Detections</h2>
        <span class="section-hint">deduplicated 5-minute buckets</span>
      </div>
      <div class="detections-card">
        <div v-if="recentDetections.length === 0" class="empty-state">
          No detections yet. Suspicious MCP activity will appear here.
        </div>
        <div v-for="det in recentDetections" :key="det.id" class="detection-row">
          <span class="severity-pill" :class="`severity-pill--${det.severity}`">{{ det.severity }}</span>
          <div class="detection-main">
            <div class="detection-title">{{ det.rule_id }}</div>
            <div class="detection-summary">{{ det.summary }}</div>
            <div class="detection-meta">
              {{ relativeTime(det.time) }} · {{ det.source_ip || 'unknown IP' }} · {{ det.confidence }} confidence
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Logs -->
    <div class="recent-section">
      <div class="section-header">
        <h2 class="section-title">Recent Activity</h2>
        <router-link to="/logs" class="view-all-link">View all logs &rarr;</router-link>
      </div>
      <div class="table-card">
        <LogTable
          :logs="recentLogs"
          :total="recentLogs.length"
          :limit="20"
          :show-pagination="false"
          @row-click="openDetail"
        />
      </div>
    </div>

    <LogDetail :log="selectedLog" @close="selectedLog = null" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useLogsStore } from '../stores/logs.js'
import StatsCard from '../components/StatsCard.vue'
import ToolBarChart from '../components/ToolBarChart.vue'
import IpDoughnutChart from '../components/IpDoughnutChart.vue'
import TimelineChart from '../components/TimelineChart.vue'
import LogTable from '../components/LogTable.vue'
import LogDetail from '../components/LogDetail.vue'

const store = useLogsStore()
const selectedLog = ref(null)
const refreshing = ref(false)

const recentLogs = computed(() => store.logs.slice(0, 20))
const recentDetections = computed(() => store.detections.slice(0, 8))

function openDetail(log) {
  selectedLog.value = log
}

function relativeTime(isoString) {
  if (!isoString) return '—'
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDate(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

async function refresh() {
  refreshing.value = true
  await Promise.all([
    store.fetchStats(),
    store.fetchDetections({ limit: 8 }),
    store.fetchTimeline(60),
    store.fetchTools(),
  ])
  refreshing.value = false
}

onMounted(async () => {
  await Promise.all([
    store.fetchStats(),
    store.fetchDetections({ limit: 8 }),
    store.fetchTimeline(60),
    store.fetchTools(),
  ])
  store.startEventStream()
})

onUnmounted(() => {
  store.stopEventStream()
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.view-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.last-seen {
  font-size: 12px;
  color: var(--muted);
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.15s, border-color 0.15s;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--primary);
  color: var(--primary);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinning {
  display: inline-block;
  animation: spin 0.7s linear infinite;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 520px) {
  .stats-grid { grid-template-columns: 1fr; }
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 1100px) {
  .charts-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 700px) {
  .charts-grid { grid-template-columns: 1fr; }
}

.recent-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.section-hint {
  font-size: 12px;
  color: var(--muted);
}

.detections-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.empty-state {
  padding: 18px;
  color: var(--muted);
  font-size: 13px;
}

.detection-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.detection-row:last-child {
  border-bottom: 0;
}

.severity-pill {
  min-width: 64px;
  text-align: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.severity-pill--high { background: rgba(239, 68, 68, 0.15); color: var(--error); }
.severity-pill--medium { background: rgba(245, 158, 11, 0.15); color: var(--warn); }
.severity-pill--low { background: rgba(59, 130, 246, 0.15); color: var(--primary); }

.detection-main {
  min-width: 0;
}

.detection-title {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.detection-summary {
  color: var(--text);
  font-size: 13px;
  margin-top: 2px;
}

.detection-meta {
  color: var(--muted);
  font-size: 12px;
  margin-top: 4px;
}

.view-all-link {
  font-size: 13px;
  color: var(--primary);
  transition: opacity 0.15s;
}

.view-all-link:hover {
  opacity: 0.75;
}

.table-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
</style>
