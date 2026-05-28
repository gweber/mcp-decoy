'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_MAX_SIZE = 10_000;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_SQLITE_PATH = path.join(process.cwd(), 'data', 'mcp-decoy.db');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envOptions(env = process.env) {
  const backend = (env.STORE_BACKEND || env.LOG_STORE_BACKEND || 'sqlite').toLowerCase();
  return {
    backend,
    maxSize: parsePositiveInt(env.LOG_MAX_SIZE, DEFAULT_MAX_SIZE),
    retentionDays: parsePositiveInt(env.LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    sqlitePath: env.SQLITE_PATH || env.LOG_SQLITE_PATH || DEFAULT_SQLITE_PATH,
  };
}

class LogStore extends EventEmitter {
  constructor(options = DEFAULT_MAX_SIZE) {
    super();
    this.setMaxListeners(50);

    const normalized = typeof options === 'number' ? { maxSize: options } : options;
    this.backend = normalized.backend || 'memory';
    this.maxSize = normalized.maxSize ?? DEFAULT_MAX_SIZE;
    this.retentionDays = normalized.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.sqlitePath = normalized.sqlitePath ?? DEFAULT_SQLITE_PATH;
    this._logs = [];
    this._db = null;

    if (this.backend === 'sqlite') {
      this._openSqlite();
      this.pruneRetention();
    } else if (this.backend !== 'memory') {
      throw new Error(`Unsupported log store backend: ${this.backend}`);
    }
  }

  _openSqlite() {
    const Database = require('better-sqlite3');
    fs.mkdirSync(path.dirname(this.sqlitePath), { recursive: true });
    this._db = new Database(this.sqlitePath);
    this._db.pragma('journal_mode = WAL');
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        time TEXT NOT NULL,
        ip TEXT,
        tool TEXT,
        mcp_method TEXT,
        is_error INTEGER NOT NULL DEFAULT 0,
        record_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time);
      CREATE INDEX IF NOT EXISTS idx_logs_ip ON logs(ip);
      CREATE INDEX IF NOT EXISTS idx_logs_tool ON logs(tool);
      CREATE INDEX IF NOT EXISTS idx_logs_mcp_method ON logs(mcp_method);
    `);
    this._insertLog = this._db.prepare(`
      INSERT OR REPLACE INTO logs (id, time, ip, tool, mcp_method, is_error, record_json)
      VALUES (@id, @time, @ip, @tool, @mcp_method, @is_error, @record_json)
    `);
  }

  add(fields) {
    const record = { id: uuidv4(), time: new Date().toISOString(), ...fields };

    if (this.backend === 'sqlite') {
      this._insertLog.run({
        id: record.id,
        time: record.time,
        ip: record.ip ?? null,
        tool: record.tool ?? null,
        mcp_method: record.mcp_method ?? null,
        is_error: record.isError ? 1 : 0,
        record_json: JSON.stringify(record),
      });
      this._enforceMaxSizeSqlite();
    } else {
      this._logs.push(record);
      if (this._logs.length > this.maxSize) this._logs.shift();
    }

    this.emit('log', record);
    return record;
  }

  query({ limit = 100, offset = 0, ip, tool, mcp_method, from, to } = {}) {
    if (this.backend === 'sqlite') {
      return this._querySqlite({ limit, offset, ip, tool, mcp_method, from, to });
    }

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

  _querySqlite({ limit = 100, offset = 0, ip, tool, mcp_method, from, to } = {}) {
    const where = [];
    const params = {};
    if (ip)         { where.push('ip = @ip'); params.ip = ip; }
    if (tool)       { where.push('tool = @tool'); params.tool = tool; }
    if (mcp_method) { where.push('mcp_method = @mcp_method'); params.mcp_method = mcp_method; }
    if (from)       { where.push('time >= @from'); params.from = from; }
    if (to)         { where.push('time <= @to'); params.to = to; }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this._db.prepare(`SELECT COUNT(*) AS count FROM logs ${clause}`).get(params).count;
    const rows = this._db.prepare(`
      SELECT record_json FROM logs ${clause}
      ORDER BY time DESC, id DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit: Number(limit), offset: Number(offset) });
    return { total, logs: rows.map(row => JSON.parse(row.record_json)) };
  }

  stats() {
    const logs = this.backend === 'sqlite'
      ? this._db.prepare('SELECT record_json FROM logs ORDER BY time ASC, id ASC').all().map(row => JSON.parse(row.record_json))
      : this._logs;
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
    const logs = this.backend === 'sqlite'
      ? this._db.prepare('SELECT time FROM logs WHERE time >= @from').all({ from: new Date(now - minutes * 60_000).toISOString() })
      : this._logs;
    for (const l of logs) {
      const key = l.time.slice(0, 16);
      if (key in buckets) buckets[key]++;
    }
    return Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([minute, count]) => ({ minute, count }));
  }

  pruneRetention() {
    if (this.backend !== 'sqlite') return 0;
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    return this._db.prepare('DELETE FROM logs WHERE time < @cutoff').run({ cutoff }).changes;
  }

  _enforceMaxSizeSqlite() {
    this._db.prepare(`
      DELETE FROM logs
      WHERE id IN (
        SELECT id FROM logs
        ORDER BY time ASC, id ASC
        LIMIT MAX((SELECT COUNT(*) FROM logs) - @maxSize, 0)
      )
    `).run({ maxSize: this.maxSize });
  }

  clear() {
    if (this.backend === 'sqlite') {
      this._db.prepare('DELETE FROM logs').run();
    } else {
      this._logs = [];
    }
  }

  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  get size() {
    if (this.backend === 'sqlite') {
      return this._db.prepare('SELECT COUNT(*) AS count FROM logs').get().count;
    }
    return this._logs.length;
  }
}

const store = new LogStore(envOptions());

module.exports = store;
module.exports.LogStore = LogStore;
module.exports.DEFAULT_RETENTION_DAYS = DEFAULT_RETENTION_DAYS;
module.exports.envOptions = envOptions;
