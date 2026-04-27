'use strict';

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class LogStore extends EventEmitter {
  constructor(maxSize = 10_000) {
    super();
    this.setMaxListeners(50);
    this.maxSize = maxSize;
    this._logs = [];
  }

  add(fields) {
    const record = { id: uuidv4(), time: new Date().toISOString(), ...fields };
    this._logs.push(record);
    if (this._logs.length > this.maxSize) this._logs.shift();
    this.emit('log', record);
    return record;
  }

  query({ limit = 100, offset = 0, ip, tool, mcp_method, from, to } = {}) {
    let results = this._logs;
    if (ip)         results = results.filter(l => l.ip === ip);
    if (tool)       results = results.filter(l => l.tool === tool);
    if (mcp_method) results = results.filter(l => l.mcp_method === mcp_method);
    if (from)       results = results.filter(l => l.time >= from);
    if (to)         results = results.filter(l => l.time <= to);
    const total = results.length;
    const logs  = results.slice().reverse().slice(Number(offset), Number(offset) + Number(limit));
    return { total, logs };
  }

  stats() {
    const logs = this._logs;
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

    const toolCounts   = {};
    const methodCounts = {};
    const ipCounts     = {};
    let errors = 0;
    let recentCount = 0;

    for (const l of logs) {
      if (l.tool)       toolCounts[l.tool]         = (toolCounts[l.tool]         || 0) + 1;
      if (l.mcp_method) methodCounts[l.mcp_method] = (methodCounts[l.mcp_method] || 0) + 1;
      if (l.ip)         ipCounts[l.ip]             = (ipCounts[l.ip]             || 0) + 1;
      if (l.isError)    errors++;
      if (l.time >= hourAgo) recentCount++;
    }

    return {
      total:       logs.length,
      uniqueIps:   Object.keys(ipCounts).length,
      topTools:    Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
      topIps:      Object.entries(ipCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count })),
      methods:     methodCounts,
      errors,
      recentCount,
      firstSeen:   logs[0]?.time ?? null,
      lastSeen:    logs[logs.length - 1]?.time ?? null,
    };
  }

  // Returns a timeline of request counts grouped by minute (last N minutes)
  timeline(minutes = 60) {
    const now = Date.now();
    const buckets = {};
    for (let i = 0; i < minutes; i++) {
      const key = new Date(now - i * 60_000).toISOString().slice(0, 16);
      buckets[key] = 0;
    }
    for (const l of this._logs) {
      const key = l.time.slice(0, 16);
      if (key in buckets) buckets[key]++;
    }
    return Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([minute, count]) => ({ minute, count }));
  }

  clear() {
    this._logs = [];
  }

  get size() {
    return this._logs.length;
  }
}

// Export a singleton — tests can import and reset via store.clear()
module.exports = new LogStore();
