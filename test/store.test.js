import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import LogStore from '../store.js';

// Each test gets a fresh store instance backed by the real production class.
function makeStore(options = {}) {
  return new LogStore.LogStore({ maxSize: 100, ...options });
}

describe('LogStore', () => {
  let store;
  beforeEach(() => { store = makeStore(); });

  describe('add()', () => {
    it('returns a record with id and time', () => {
      const r = store.add({ ip: '1.2.3.4', mcp_method: 'initialize' });
      expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(r.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(r.ip).toBe('1.2.3.4');
    });

    it('increments size on each add', () => {
      store.add({ ip: 'a' });
      store.add({ ip: 'b' });
      expect(store.size).toBe(2);
    });

    it('emits a "log" event with the full record', () => new Promise(resolve => {
      store.once('log', (record) => {
        expect(record.tool).toBe('jira_get_issue');
        resolve();
      });
      store.add({ tool: 'jira_get_issue' });
    }));

    it('enforces maxSize by evicting the oldest entry', () => {
      const small = makeStore();
      small.maxSize = 3;
      small.add({ n: 1 });
      small.add({ n: 2 });
      small.add({ n: 3 });
      small.add({ n: 4 });
      expect(small.size).toBe(3);
      const { logs } = small.query({ limit: 10 });
      expect(logs.map(l => l.n)).not.toContain(1);
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      store.add({ ip: '10.0.0.1', mcp_method: 'tools/call', tool: 'jira_search_issues' });
      store.add({ ip: '10.0.0.2', mcp_method: 'tools/list' });
      store.add({ ip: '10.0.0.1', mcp_method: 'tools/call', tool: 'confluence_search' });
    });

    it('returns all logs when no filters are applied', () => {
      const { total, logs } = store.query();
      expect(total).toBe(3);
      expect(logs).toHaveLength(3);
    });

    it('returns logs in reverse-chronological order', () => {
      const { logs } = store.query();
      expect(logs[0].time >= logs[1].time).toBe(true);
    });

    it('filters by ip', () => {
      const { total } = store.query({ ip: '10.0.0.1' });
      expect(total).toBe(2);
    });

    it('filters by tool', () => {
      const { total } = store.query({ tool: 'confluence_search' });
      expect(total).toBe(1);
    });

    it('filters by mcp_method', () => {
      const { total } = store.query({ mcp_method: 'tools/list' });
      expect(total).toBe(1);
    });

    it('respects limit and offset for pagination', () => {
      const page1 = store.query({ limit: 2, offset: 0 });
      const page2 = store.query({ limit: 2, offset: 2 });
      expect(page1.logs).toHaveLength(2);
      expect(page2.logs).toHaveLength(1);
      expect(page1.total).toBe(3);
    });

    it('returns empty logs array when no match', () => {
      const { total, logs } = store.query({ ip: '99.99.99.99' });
      expect(total).toBe(0);
      expect(logs).toHaveLength(0);
    });
  });

  describe('stats()', () => {
    beforeEach(() => {
      store.add({ ip: '10.0.0.1', mcp_method: 'tools/call', tool: 'jira_search_issues' });
      store.add({ ip: '10.0.0.1', mcp_method: 'tools/call', tool: 'jira_search_issues' });
      store.add({ ip: '10.0.0.2', mcp_method: 'tools/list' });
      store.add({ ip: '10.0.0.3', mcp_method: 'initialize', isError: true });
    });

    it('counts total log entries', () => {
      expect(store.stats().total).toBe(4);
    });

    it('counts unique IPs', () => {
      expect(store.stats().uniqueIps).toBe(3);
    });

    it('returns topTools sorted descending by count', () => {
      const { topTools } = store.stats();
      expect(topTools[0].name).toBe('jira_search_issues');
      expect(topTools[0].count).toBe(2);
    });

    it('counts errors', () => {
      expect(store.stats().errors).toBe(1);
    });

    it('returns recentCount for last hour', () => {
      expect(store.stats().recentCount).toBe(4);
    });

    it('has firstSeen and lastSeen as ISO strings', () => {
      const { firstSeen, lastSeen } = store.stats();
      expect(firstSeen).toMatch(/^\d{4}-/);
      expect(lastSeen).toMatch(/^\d{4}-/);
    });

    it('handles empty store without throwing', () => {
      const empty = makeStore();
      const s = empty.stats();
      expect(s.total).toBe(0);
      expect(s.uniqueIps).toBe(0);
      expect(s.firstSeen).toBeNull();
    });
  });

  describe('timeline()', () => {
    it('returns an array with the requested number of minute buckets', () => {
      const result = store.timeline(30);
      expect(result).toHaveLength(30);
      expect(result[0]).toHaveProperty('minute');
      expect(result[0]).toHaveProperty('count');
    });

    it('counts entries in the current minute', () => {
      store.add({ ip: 'x' });
      const result = store.timeline(60);
      const now = new Date().toISOString().slice(0, 16);
      const bucket = result.find(b => b.minute === now);
      expect(bucket?.count).toBeGreaterThanOrEqual(1);
    });
  });


  describe('configuration', () => {
    it('defaults the application store options to SQLite with 90-day retention', () => {
      const options = LogStore.envOptions({});
      expect(options.backend).toBe('sqlite');
      expect(options.retentionDays).toBe(90);
      expect(options.sqlitePath).toContain('mcp-decoy.db');
    });
  });

  describe('detections', () => {
    it('creates and lists detections for suspicious logs', () => {
      store.add({ ip: '10.0.0.7', mcp_method: 'tools/list' });
      const { total, detections } = store.queryDetections();
      expect(total).toBe(1);
      expect(detections[0].rule_id).toBe('MCP_TOOL_ENUMERATION');
      expect(detections[0].severity).toBe('medium');
      expect(detections[0].evidence_event_ids).toHaveLength(1);
    });

    it('filters detections by severity, rule_id, and source_ip', () => {
      store.add({ ip: '10.0.0.8', mcp_method: 'tools/list' });
      store.add({ ip: '10.0.0.9', mcp_method: 'tools/call', tool: 'postgresql_list_databases', args: {} });

      expect(store.queryDetections({ severity: 'high' }).detections.every(d => d.severity === 'high')).toBe(true);
      expect(store.queryDetections({ rule_id: 'MCP_DATASTORE_RECON' }).total).toBe(1);
      expect(store.queryDetections({ source_ip: '10.0.0.8' }).detections[0].rule_id).toBe('MCP_TOOL_ENUMERATION');
    });

    it('deduplicates repeated detections in the same five-minute bucket', () => {
      store.add({ ip: '10.0.0.10', mcp_method: 'tools/list' });
      store.add({ ip: '10.0.0.10', mcp_method: 'tools/list' });
      expect(store.queryDetections({ rule_id: 'MCP_TOOL_ENUMERATION' }).total).toBe(1);
    });

    it('includes detection counts in stats', () => {
      store.add({ ip: '10.0.0.11', mcp_method: 'tools/list' });
      const stats = store.stats();
      expect(stats.detections.total).toBe(1);
      expect(stats.detections.bySeverity.medium).toBe(1);
      expect(stats.detections.byRule.MCP_TOOL_ENUMERATION).toBe(1);
    });
  });

  describe('SQLite persistence', () => {
    it('persists records across store instances when backend is sqlite', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-decoy-store-'));
      const dbPath = path.join(dir, 'events.db');

      const first = makeStore({ backend: 'sqlite', sqlitePath: dbPath });
      first.add({ ip: '10.10.10.10', mcp_method: 'tools/list', tool: 'github_search_repositories' });
      first.close();

      const second = makeStore({ backend: 'sqlite', sqlitePath: dbPath });
      const { total, logs } = second.query({ ip: '10.10.10.10' });
      expect(total).toBe(1);
      expect(logs[0].tool).toBe('github_search_repositories');
      second.close();
    });

    it('defaults SQLite retention to 90 days and prunes older records', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-decoy-store-'));
      const dbPath = path.join(dir, 'events.db');
      const store = makeStore({ backend: 'sqlite', sqlitePath: dbPath });

      store.add({ ip: 'old', time: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString() });
      store.add({ ip: 'new', time: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString() });
      store.pruneRetention();

      expect(store.retentionDays).toBe(90);
      expect(store.query({ ip: 'old' }).total).toBe(0);
      expect(store.query({ ip: 'new' }).total).toBe(1);
      store.close();
    });

    it('uses configurable SQLite retention days', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-decoy-store-'));
      const dbPath = path.join(dir, 'events.db');
      const store = makeStore({ backend: 'sqlite', sqlitePath: dbPath, retentionDays: 7 });

      store.add({ ip: 'expired', time: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() });
      store.add({ ip: 'kept', time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() });
      store.pruneRetention();

      expect(store.retentionDays).toBe(7);
      expect(store.query({ ip: 'expired' }).total).toBe(0);
      expect(store.query({ ip: 'kept' }).total).toBe(1);
      store.close();
    });

    it('persists detections across SQLite store instances', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-decoy-store-'));
      const dbPath = path.join(dir, 'events.db');

      const first = makeStore({ backend: 'sqlite', sqlitePath: dbPath });
      first.add({ ip: '10.10.20.30', mcp_method: 'tools/list' });
      first.close();

      const second = makeStore({ backend: 'sqlite', sqlitePath: dbPath });
      const { total, detections } = second.queryDetections({ rule_id: 'MCP_TOOL_ENUMERATION' });
      expect(total).toBe(1);
      expect(detections[0].source_ip).toBe('10.10.20.30');
      second.close();
    });
  });

  describe('clear()', () => {
    it('resets the store to empty', () => {
      store.add({ ip: 'a' });
      store.clear();
      expect(store.size).toBe(0);
      expect(store.stats().total).toBe(0);
    });
  });
});

describe('sendWebhook()', () => {
  const origFetch = global.fetch;
  let origUrl;

  beforeEach(() => { origUrl = process.env.WEBHOOK_URL; });
  afterEach(() => {
    global.fetch = origFetch;
    if (origUrl === undefined) delete process.env.WEBHOOK_URL;
    else process.env.WEBHOOK_URL = origUrl;
  });

  it('posts the detection JSON to WEBHOOK_URL when set', () => {
    process.env.WEBHOOK_URL = 'http://example.com/webhook';
    let captured = null;
    global.fetch = (url, opts) => { captured = JSON.parse(opts.body); return Promise.resolve(new Response()); };
    LogStore.sendWebhook({ id: 'x', rule_id: 'ENUM' });
    expect(captured).toEqual({ id: 'x', rule_id: 'ENUM' });
  });

  it('does nothing when WEBHOOK_URL is unset', () => {
    delete process.env.WEBHOOK_URL;
    let called = false;
    global.fetch = () => { called = true; return Promise.resolve(new Response()); };
    LogStore.sendWebhook({ id: 'x' });
    expect(called).toBe(false);
  });

  it('does not throw when the POST fails', () => {
    process.env.WEBHOOK_URL = 'http://example.com/webhook';
    global.fetch = () => { throw new Error('network down'); };
    expect(() => LogStore.sendWebhook({ id: 'x' })).not.toThrow();
  });
});
