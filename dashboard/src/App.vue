<template>
  <div class="app-shell">
    <nav class="top-nav">
      <div class="nav-brand">
        <span class="brand-icon">&#9760;</span>
        <span class="brand-name">MCP Decoy</span>
        <span class="brand-sub">Forensic Dashboard</span>
      </div>
      <div class="nav-links">
        <router-link to="/" class="nav-link" active-class="nav-link--active" exact>
          Dashboard
        </router-link>
        <router-link to="/logs" class="nav-link" active-class="nav-link--active">
          Logs
        </router-link>
      </div>
      <div class="nav-status">
        <span class="status-dot" :class="store.connected ? 'status-dot--live' : 'status-dot--dead'"></span>
        <span class="status-label">{{ store.connected ? 'Live' : 'Offline' }}</span>
      </div>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useLogsStore } from './stores/logs.js'
const store = useLogsStore()
</script>

<style>
:root {
  --bg:      #0f172a;
  --surface: #1e293b;
  --border:  #334155;
  --primary: #3b82f6;
  --success: #22c55e;
  --warn:    #f59e0b;
  --error:   #ef4444;
  --text:    #e2e8f0;
  --muted:   #94a3b8;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

a { color: inherit; text-decoration: none; }

button {
  cursor: pointer;
  font-family: inherit;
}

input, select {
  font-family: inherit;
  font-size: inherit;
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }
</style>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
}

.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.brand-icon {
  font-size: 20px;
  color: var(--error);
}

.brand-name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.02em;
  color: var(--text);
}

.brand-sub {
  font-size: 11px;
  color: var(--muted);
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.nav-link {
  padding: 6px 14px;
  border-radius: 6px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  transition: color 0.15s, background 0.15s;
}

.nav-link:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.nav-link--active {
  color: var(--primary);
  background: rgba(59, 130, 246, 0.1);
}

.nav-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background 0.3s;
}

.status-dot--live {
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
  animation: pulse 2s infinite;
}

.status-dot--dead {
  background: var(--error);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}

.main-content {
  flex: 1;
  margin-top: 56px;
  padding: 24px;
}
</style>
