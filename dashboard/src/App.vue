<template>
  <div class="app-shell">
    <nav class="top-nav">
      <div class="nav-brand">
        <span class="brand-icon">&#9760;</span>
        <span class="brand-name">MCP Decoy</span>
        <span class="brand-sub">Forensic Dashboard</span>
      </div>
      <div class="nav-links" v-if="!store.authRequired">
        <router-link to="/" class="nav-link" active-class="nav-link--active" exact>
          Dashboard
        </router-link>
        <router-link to="/logs" class="nav-link" active-class="nav-link--active">
          Logs
        </router-link>
      </div>
      <div class="nav-status">
        <button v-if="store.dashboardToken" class="token-btn" @click="store.clearDashboardToken()">
          Clear token
        </button>
        <span class="status-dot" :class="store.connected ? 'status-dot--live' : 'status-dot--dead'"></span>
        <span class="status-label">{{ store.connected ? 'Live' : 'Offline' }}</span>
      </div>
    </nav>
    <main class="main-content">
      <section v-if="store.authRequired" class="auth-panel">
        <div class="auth-card">
          <div class="auth-icon">&#128272;</div>
          <h1>Dashboard token required</h1>
          <p>
            This instance protects dashboard and API endpoints with
            <code>DASHBOARD_TOKEN</code>. Enter the token to continue.
          </p>
          <form class="auth-form" @submit.prevent="submitToken">
            <input
              v-model="tokenInput"
              type="password"
              autocomplete="current-password"
              placeholder="Dashboard token"
              autofocus
            />
            <button type="submit">Unlock dashboard</button>
          </form>
          <p v-if="store.authError" class="auth-error">{{ store.authError }}</p>
          <p class="auth-hint">
            The MCP decoy endpoints remain unauthenticated; this only gates forensic UI/API access.
          </p>
        </div>
      </section>
      <router-view v-else />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useLogsStore } from './stores/logs.js'
const store = useLogsStore()
const tokenInput = ref(store.dashboardToken || '')

function submitToken() {
  store.setDashboardToken(tokenInput.value)
}
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
  gap: 10px;
  flex-shrink: 0;
  margin-left: auto;
}

.token-btn {
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
}

.token-btn:hover {
  color: var(--text);
  border-color: var(--muted);
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

.auth-panel {
  display: flex;
  min-height: calc(100vh - 104px);
  align-items: center;
  justify-content: center;
}

.auth-card {
  width: min(440px, 100%);
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.auth-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.12);
  color: var(--primary);
  font-size: 22px;
}

.auth-card h1 {
  margin-bottom: 8px;
  font-size: 22px;
}

.auth-card p {
  color: var(--muted);
}

.auth-form {
  display: flex;
  gap: 10px;
  margin: 20px 0 12px;
}

.auth-form input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #0b1220;
  color: var(--text);
}

.auth-form button {
  padding: 10px 14px;
  border: 0;
  border-radius: 8px;
  background: var(--primary);
  color: white;
  font-weight: 600;
}

.auth-error {
  margin-top: 8px;
  color: var(--error) !important;
}

.auth-hint {
  margin-top: 14px;
  font-size: 12px;
}
</style>
