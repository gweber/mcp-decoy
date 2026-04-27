<template>
  <teleport to="body">
    <transition name="drawer">
      <div v-if="log" class="drawer-overlay" @click.self="$emit('close')">
        <div class="drawer">
          <div class="drawer-header">
            <div class="drawer-title">
              <span class="drawer-icon">&#128269;</span>
              Log Entry Detail
            </div>
            <button class="close-btn" @click="$emit('close')" aria-label="Close">
              &#10005;
            </button>
          </div>

          <div class="drawer-body">
            <div class="detail-section">
              <div class="section-label">Identity</div>
              <dl class="detail-list">
                <div class="detail-row">
                  <dt>ID</dt>
                  <dd class="mono">{{ log.id }}</dd>
                </div>
                <div class="detail-row">
                  <dt>Time</dt>
                  <dd>{{ formatTime(log.time) }}</dd>
                </div>
                <div class="detail-row">
                  <dt>IP Address</dt>
                  <dd class="mono highlight-ip">{{ log.ip }}</dd>
                </div>
                <div class="detail-row">
                  <dt>Session ID</dt>
                  <dd class="mono">{{ log.session_id || 'null' }}</dd>
                </div>
              </dl>
            </div>

            <div class="detail-section">
              <div class="section-label">Request</div>
              <dl class="detail-list">
                <div class="detail-row">
                  <dt>HTTP Method</dt>
                  <dd>
                    <span class="method-badge" :class="`method--${(log.method || '').toLowerCase()}`">
                      {{ log.method }}
                    </span>
                  </dd>
                </div>
                <div class="detail-row">
                  <dt>Path</dt>
                  <dd class="mono">{{ log.path }}</dd>
                </div>
                <div class="detail-row">
                  <dt>Transport</dt>
                  <dd>{{ log.transport || '—' }}</dd>
                </div>
                <div class="detail-row">
                  <dt>User-Agent</dt>
                  <dd class="ua-text">{{ log.ua || '—' }}</dd>
                </div>
              </dl>
            </div>

            <div class="detail-section">
              <div class="section-label">MCP</div>
              <dl class="detail-list">
                <div class="detail-row">
                  <dt>MCP Method</dt>
                  <dd class="mono highlight-warn">{{ log.mcp_method || '—' }}</dd>
                </div>
                <div class="detail-row">
                  <dt>Tool Called</dt>
                  <dd class="mono highlight-success">{{ log.tool || '—' }}</dd>
                </div>
              </dl>
            </div>

            <div v-if="log.args !== null && log.args !== undefined" class="detail-section">
              <div class="section-label">Arguments</div>
              <pre class="args-block"><code>{{ formatArgs(log.args) }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
defineProps({
  log: { type: Object, default: null },
})

defineEmits(['close'])

function formatTime(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatArgs(args) {
  if (args === null || args === undefined) return 'null'
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}
</script>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: 480px;
  max-width: 95vw;
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.drawer-icon {
  font-size: 16px;
}

.close-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--muted);
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--error);
  border-color: var(--error);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
  align-items: baseline;
}

dt {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}

dd {
  font-size: 13px;
  color: var(--text);
  word-break: break-all;
}

.mono {
  font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
}

.highlight-ip {
  color: #60a5fa;
}

.highlight-warn {
  color: var(--warn);
}

.highlight-success {
  color: var(--success);
}

.ua-text {
  font-size: 12px;
  color: var(--muted);
  word-break: break-word;
}

.method-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
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

.args-block {
  background: #0f172a;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  overflow-x: auto;
  font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #a5f3fc;
  white-space: pre;
}

/* Slide-in transition */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(100%);
}
</style>
