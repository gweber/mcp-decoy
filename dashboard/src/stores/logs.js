import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLogsStore = defineStore('logs', () => {
  const logs = ref([])
  const stats = ref(null)
  const timeline = ref([])
  const tools = ref([])
  const connected = ref(false)

  let eventSource = null
  let reconnectTimer = null
  let eventCountSinceLastStatsFetch = 0

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      stats.value = await res.json()
    } catch (err) {
      console.error('[store] fetchStats error:', err)
    }
  }

  async function fetchLogs(params = {}) {
    try {
      const query = new URLSearchParams()
      if (params.limit !== undefined) query.set('limit', params.limit)
      if (params.offset !== undefined) query.set('offset', params.offset)
      if (params.ip) query.set('ip', params.ip)
      if (params.tool) query.set('tool', params.tool)
      if (params.mcp_method) query.set('mcp_method', params.mcp_method)
      if (params.from) query.set('from', params.from)
      if (params.to) query.set('to', params.to)

      const res = await fetch(`/api/logs?${query.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data
    } catch (err) {
      console.error('[store] fetchLogs error:', err)
      return { total: 0, logs: [] }
    }
  }

  async function fetchTimeline(minutes = 60) {
    try {
      const res = await fetch(`/api/timeline?minutes=${minutes}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      timeline.value = await res.json()
    } catch (err) {
      console.error('[store] fetchTimeline error:', err)
    }
  }

  async function fetchTools() {
    try {
      const res = await fetch('/api/tools')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      tools.value = data.tools || []
    } catch (err) {
      console.error('[store] fetchTools error:', err)
    }
  }

  function startEventStream() {
    if (eventSource) return

    function connect() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }

      eventSource = new EventSource('/api/events')

      eventSource.addEventListener('log', (e) => {
        try {
          const entry = JSON.parse(e.data)
          logs.value.unshift(entry)
          // Trim to avoid unbounded memory growth
          if (logs.value.length > 500) {
            logs.value = logs.value.slice(0, 500)
          }
          eventCountSinceLastStatsFetch++
          if (eventCountSinceLastStatsFetch >= 30) {
            eventCountSinceLastStatsFetch = 0
            fetchStats()
            fetchTimeline(60)
          }
        } catch (err) {
          console.error('[store] SSE parse error:', err)
        }
      })

      eventSource.onopen = () => {
        connected.value = true
      }

      eventSource.onerror = () => {
        connected.value = false
        eventSource.close()
        eventSource = null
        reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()
  }

  function stopEventStream() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connected.value = false
  }

  return {
    logs,
    stats,
    timeline,
    tools,
    connected,
    fetchStats,
    fetchLogs,
    fetchTimeline,
    fetchTools,
    startEventStream,
    stopEventStream,
  }
})
