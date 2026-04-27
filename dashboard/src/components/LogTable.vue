<template>
  <div class="log-table-wrap">
    <div v-if="!logs.length" class="empty-state">
      <div class="empty-icon">&#128203;</div>
      <div class="empty-title">No log entries</div>
      <div class="empty-sub">Waiting for MCP requests to arrive…</div>
    </div>
    <table v-else class="log-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>IP</th>
          <th>Method</th>
          <th>MCP Method</th>
          <th>Tool</th>
          <th>User-Agent</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="log in logs"
          :key="log.id"
          class="log-row"
          @click="$emit('row-click', log)"
        >
          <td class="col-time">
            <span class="time-rel">{{ relativeTime(log.time) }}</span>
          </td>
          <td class="col-ip">
            <span class="ip-badge">{{ log.ip }}</span>
          </td>
          <td class="col-method">
            <span class="method-badge" :class="`method--${(log.method || '').toLowerCase()}`">
              {{ log.method || '—' }}
            </span>
          </td>
          <td class="col-mcp">
            <span class="mcp-tag">{{ log.mcp_method || '—' }}</span>
          </td>
          <td class="col-tool">
            <span v-if="log.tool" class="tool-name">{{ log.tool }}</span>
            <span v-else class="muted">—</span>
          </td>
          <td class="col-ua">
            <span class="ua-text" :title="log.ua">{{ truncate(log.ua, 45) }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="showPagination && total > limit" class="pagination">
      <button
        class="page-btn"
        :disabled="offset === 0"
        @click="$emit('update:offset', Math.max(0, offset - limit))"
      >
        &larr; Prev
      </button>
      <span class="page-info">
        {{ offset + 1 }}–{{ Math.min(offset + limit, total) }} of {{ total.toLocaleString() }}
      </span>
      <button
        class="page-btn"
        :disabled="offset + limit >= total"
        @click="$emit('update:offset', offset + limit)"
      >
        Next &rarr;
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  logs: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  limit: { type: Number, default: 100 },
  offset: { type: Number, default: 0 },
  showPagination: { type: Boolean, default: true },
})

defineEmits(['update:offset', 'row-click'])

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
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function truncate(str, max) {
  if (!str) return '—'
  return str.length > max ? str.slice(0, max) + '…' : str
}
</script>

<style scoped>
.log-table-wrap {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  gap: 8px;
}

.empty-icon {
  font-size: 40px;
  opacity: 0.3;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--muted);
}

.empty-sub {
  font-size: 13px;
  color: var(--muted);
  opacity: 0.7;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.log-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface);
}

.log-table th {
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.log-table td {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
  vertical-align: middle;
}

.log-row {
  cursor: pointer;
  transition: background 0.12s;
}

.log-row:hover {
  background: rgba(59, 130, 246, 0.07);
}

.log-row:hover .time-rel {
  color: var(--primary);
}

.col-time { white-space: nowrap; }

.time-rel {
  font-size: 12px;
  color: var(--muted);
  transition: color 0.12s;
}

.col-ip { white-space: nowrap; }

.ip-badge {
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 12px;
  color: var(--text);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
}

.method-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.method--post {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.method--get {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.method--delete {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.method--put,
.method--patch {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.mcp-tag {
  font-size: 12px;
  color: var(--warn);
  font-family: 'Menlo', 'Monaco', monospace;
}

.col-tool .tool-name {
  font-size: 12px;
  color: var(--success);
  font-weight: 500;
}

.muted {
  color: var(--muted);
}

.col-ua { max-width: 260px; }

.ua-text {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px 0 4px;
}

.page-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.15s, border-color 0.15s;
}

.page-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--primary);
  color: var(--primary);
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--muted);
  min-width: 160px;
  text-align: center;
}
</style>
