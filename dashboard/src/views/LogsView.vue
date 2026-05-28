<template>
  <div class="logs-view">
    <div class="view-header">
      <h1 class="view-title">Log Explorer</h1>
      <div class="header-meta">
        <span class="result-count" v-if="total > 0">
          {{ total.toLocaleString() }} entries
        </span>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-group">
        <label class="filter-label">IP Address</label>
        <input
          v-model="filters.ip"
          class="filter-input"
          placeholder="192.168.1.1"
          @keydown.enter="applyFilters"
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">Tool</label>
        <select v-model="filters.tool" class="filter-select">
          <option value="">All tools</option>
          <option v-for="t in store.tools" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>

      <div class="filter-group">
        <label class="filter-label">MCP Method</label>
        <select v-model="filters.mcp_method" class="filter-select">
          <option value="">All methods</option>
          <option value="tools/call">tools/call</option>
          <option value="tools/list">tools/list</option>
          <option value="initialize">initialize</option>
          <option value="resources/list">resources/list</option>
          <option value="resources/read">resources/read</option>
          <option value="prompts/list">prompts/list</option>
          <option value="prompts/get">prompts/get</option>
        </select>
      </div>

      <div class="filter-group">
        <label class="filter-label">From</label>
        <input
          v-model="filters.from"
          type="datetime-local"
          class="filter-input"
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">To</label>
        <input
          v-model="filters.to"
          type="datetime-local"
          class="filter-input"
        />
      </div>

      <div class="filter-actions">
        <button class="btn-apply" @click="applyFilters">Apply</button>
        <button class="btn-clear" @click="clearFilters">Clear</button>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading-bar">
        <div class="loading-inner"></div>
      </div>
      <LogTable
        :logs="logs"
        :total="total"
        :limit="LIMIT"
        :offset="offset"
        :show-pagination="true"
        @update:offset="onPageChange"
        @row-click="openDetail"
      />
    </div>

    <LogDetail :log="selectedLog" @close="selectedLog = null" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useLogsStore } from '../stores/logs.js'
import LogTable from '../components/LogTable.vue'
import LogDetail from '../components/LogDetail.vue'

const store = useLogsStore()

const LIMIT = 100
const offset = ref(0)
const total = ref(0)
const logs = ref([])
const loading = ref(false)
const selectedLog = ref(null)

const filters = reactive({
  ip: '',
  tool: '',
  mcp_method: '',
  from: '',
  to: '',
})

function buildParams() {
  const params = { limit: LIMIT, offset: offset.value }
  if (filters.ip) params.ip = filters.ip.trim()
  if (filters.tool) params.tool = filters.tool
  if (filters.mcp_method) params.mcp_method = filters.mcp_method
  if (filters.from) params.from = new Date(filters.from).toISOString()
  if (filters.to) params.to = new Date(filters.to).toISOString()
  return params
}

async function loadLogs() {
  loading.value = true
  try {
    const result = await store.fetchLogs(buildParams())
    logs.value = result.logs || []
    total.value = result.total || 0
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  offset.value = 0
  loadLogs()
}

function clearFilters() {
  filters.ip = ''
  filters.tool = ''
  filters.mcp_method = ''
  filters.from = ''
  filters.to = ''
  offset.value = 0
  loadLogs()
}

function onPageChange(newOffset) {
  offset.value = newOffset
  loadLogs()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function openDetail(log) {
  selectedLog.value = log
}

onMounted(async () => {
  await Promise.all([store.fetchTools(), loadLogs()])
})
</script>

<style scoped>
.logs-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.result-count {
  font-size: 13px;
  color: var(--muted);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 6px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 20px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted);
}

.filter-input,
.filter-select {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  min-width: 160px;
}

.filter-input::placeholder {
  color: var(--muted);
}

.filter-input:focus,
.filter-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.filter-select option {
  background: var(--surface);
  color: var(--text);
}

input[type="datetime-local"] {
  color-scheme: dark;
}

.filter-actions {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding-bottom: 0;
}

.btn-apply {
  background: var(--primary);
  color: white;
  border: none;
  padding: 7px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s;
}

.btn-apply:hover {
  background: #2563eb;
}

.btn-clear {
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--border);
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  transition: color 0.15s, border-color 0.15s;
}

.btn-clear:hover {
  color: var(--text);
  border-color: var(--muted);
}

.table-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.loading-bar {
  height: 2px;
  background: var(--border);
  overflow: hidden;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
}

.loading-inner {
  height: 100%;
  width: 40%;
  background: var(--primary);
  border-radius: 2px;
  animation: loadslide 1s ease-in-out infinite;
}

@keyframes loadslide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
</style>
