'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { evaluateLog, MULTI_TOOL_WINDOW_MS } = require('./detections');
const { TOOLS } = require('./tools');

const DEFAULT_MAX_SIZE = 10_000;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_SQLITE_PATH = path.join(process.cwd(), 'data', 'mcp-decoy.db');
const DETECTION_DEDUPE_MS = 5 * 60 * 1000;
const KNOWN_TOOLS = new Set(TOOLS.map(tool => tool.name));

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

function dedupeBucket(time) {
  const ms = new Date(time).getTime();
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  return String(Math.floor(safeMs / DETECTION_DEDUPE_MS));
}

function parseDetectionRow(row) {
  const details = JSON.parse(row.details_json || '{}');
  const evidence_event_ids = JSON.parse(row.evidence_event_ids_json || '[]');
  return {
    id: row.id,
    time: row.time,
    rule_id: row.rule_id,
    severity: row.severity,
    confidence: row.confidence,
    source_ip: row.source_ip,
    tool: row.tool,
    mcp_method: row.mcp_method,
    summary: row.summary,
    details,
    evidence_event_ids,
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
    this._detections = [];
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

      CREATE TABLE IF NOT EXISTS detections (
        id TEXT PRIMARY KEY,
        time TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        confidence TEXT NOT NULL,
        source_ip TEXT,
        tool TEXT,
        mcp_method TEXT,
        summary TEXT NOT NULL,
        details_json TEXT NOT NULL,
        evidence_event_ids_json TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE
      );
      CREATE INDEX IF NOT EXISTS idx_detections_time ON detections(time);
      CREATE INDEX IF NOT EXISTS idx_detections_rule_id ON detections(rule_id);
      CREATE INDEX IF NOT EXISTS idx_detections_severity ON detections(severity);
      CREATE INDEX IF NOT EXISTS idx_detections_source_ip ON detections(source_ip);
    `);
    this._insertLog = this._db.prepare(`
      INSERT OR REPLACE INTO logs (id, time, ip, tool, mcp_method, is_error, record_json)
      VALUES (@id, @time, @ip, @tool, @mcp_method, @is_error, @record_json)
    `);
    this._insertDetection = this._db.prepare(`
      INSERT OR IGNORE INTO detections (
        id, time, rule_id, severity, confidence, source_ip, tool, mcp_method,
        summary, details_json, evidence_event_ids_json, dedupe_key
      ) VALUES (
        @id, @time, @rule_id, @severity, @confidence, @source_ip, @tool, @mcp_method,
        @summary, @details_json, @evidence_event_ids_json, @dedupe_key
      )
    `);
  }

  add(fields) {
    const record = { id: uuidv4(), time: new Date().toISOString(), ...fields };
    const recentLogs = this._recentLogsFor(record);

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

    const detections = evaluateLog(record, { knownTools: KNOWN_TOOLS, recentLogs });
    for (const det of detections) this._addDetection(det);

    this.emit('log', record);
    return record;
  }

  _recentLogsFor(record) {
    if (!record.ip || record.mcp_method !== 'tools/call') return [];
    const from = new Date(new Date(record.time).getTime() - MULTI_TOOL_WINDOW_MS).toISOString();
    if (this.backend === 'sqlite') {
      return this._db.prepare(`
        SELECT record_json FROM logs
        WHERE ip = @ip AND mcp_method = 'tools/call' AND time >= @from AND time <= @to
        ORDER BY time ASC, id ASC
      `).all({ ip: record.ip, from, to: record.time }).map(row => JSON.parse(row.record_json));
    }
    return this._logs.filter(log => log.ip === record.ip && log.mcp_method === 'tools/call' && log.time >= from && log.time <= record.time);
  }

  _detectionDedupeKey(det) {
    const subject = det.rule_id === 'MCP_MULTI_TOOL_RECON'
      ? 'multi-tool'
      : (det.tool || det.mcp_method || 'generic');
    return [det.rule_id, det.source_ip || 'unknown', subject, dedupeBucket(det.time)].join('|');
  }

  _addDetection(det) {
    const detection = { ...det, dedupe_key: this._detectionDedupeKey(det) };
    if (this.backend === 'sqlite') {
      const info = this._insertDetection.run({
        id: detection.id,
        time: detection.time,
        rule_id: detection.rule_id,
        severity: detection.severity,
        confidence: detection.confidence,
        source_ip: detection.source_ip ?? null,
        tool: detection.tool ?? null,
        mcp_method: detection.mcp_method ?? null,
        summary: detection.summary,
        details_json: JSON.stringify(detection.details || {}),
        evidence_event_ids_json: JSON.stringify(detection.evidence_event_ids || []),
        dedupe_key: detection.dedupe_key,
      });
      if (info.changes > 0) this.emit('detection', this._stripDedupe(detection));
      return info.changes > 0 ? this._stripDedupe(detection) : null;
    }

    if (this._detections.some(existing => existing.dedupe_key === detection.dedupe_key)) return null;
    this._detections.push(detection);
    if (this._detections.length > this.maxSize) this._detections.shift();
    const publicDetection = this._stripDedupe(detection);
    this.emit('detection', publicDetection);
    return publicDetection;
  }

  _stripDedupe(det) {
    const { dedupe_key, ...rest } = det;
    return rest;
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

  queryDetections({ limit = 100, offset = 0, severity, rule_id, source_ip, from, to } = {}) {
    if (this.backend === 'sqlite') {
      const where = [];
      const params = {};
      if (severity)  { where.push('severity = @severity'); params.severity = severity; }
      if (rule_id)   { where.push('rule_id = @rule_id'); params.rule_id = rule_id; }
      if (source_ip) { where.push('source_ip = @source_ip'); params.source_ip = source_ip; }
      if (from)      { where.push('time >= @from'); params.from = from; }
      if (to)        { where.push('time <= @to'); params.to = to; }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = this._db.prepare(`SELECT COUNT(*) AS count FROM detections ${clause}`).get(params).count;
      const rows = this._db.prepare(`
        SELECT * FROM detections ${clause}
        ORDER BY time DESC, id DESC
        LIMIT @limit OFFSET @offset
      `).all({ ...params, limit: Number(limit), offset: Number(offset) });
      return { total, detections: rows.map(parseDetectionRow) };
    }

    let results = this._detections.map(det => this._stripDedupe(det));
    if (severity)  results = results.filter(d => d.severity === severity);
    if (rule_id)   results = results.filter(d => d.rule_id === rule_id);
    if (source_ip) results = results.filter(d => d.source_ip === source_ip);
    if (from)      results = results.filter(d => d.time >= from);
    if (to)        results = results.filter(d => d.time <= to);
    const total = results.length;
    const detections = results.slice().reverse().slice(Number(offset), Number(offset) + Number(limit));
    return { total, detections };
  }

  detectionStats() {
    const detections = this.queryDetections({ limit: this.maxSize }).detections;
    const bySeverity = {};
    const byRule = {};
    for (const d of detections) {
      bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
      byRule[d.rule_id] = (byRule[d.rule_id] || 0) + 1;
    }
    return { total: detections.length, bySeverity, byRule };
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
      detections:  this.detectionStats(),
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
    const logsDeleted = this._db.prepare('DELETE FROM logs WHERE time < @cutoff').run({ cutoff }).changes;
    this._db.prepare('DELETE FROM detections WHERE time < @cutoff').run({ cutoff });
    return logsDeleted;
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
      this._db.prepare('DELETE FROM detections').run();
    } else {
      this._logs = [];
      this._detections = [];
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

/**
 * Send a detection object as a JSON POST to WEBHOOK_URL.
 * Uses a short timeout (~2s) via AbortController and never throws.
 */
function sendWebhook(detection) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detection),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch {
    // Silently ignore — never crash the server
  }
}

module.exports = store;
module.exports.LogStore = LogStore;
module.exports.DEFAULT_RETENTION_DAYS = DEFAULT_RETENTION_DAYS;
module.exports.envOptions = envOptions;
module.exports.sendWebhook = sendWebhook;
