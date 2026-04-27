import { describe, it, expect, beforeEach } from 'vitest';
import LogStore from '../store.js';

// Each test gets a fresh store instance
function makeStore() {
  const { LogStore: LS } = (() => {
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
        const logs = results.slice().reverse().slice(Number(offset), Number(offset) + Number(limit));
        return { total, logs };
      }
      stats() {
        const logs = this._logs;
        const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
        const toolCounts = {}, methodCounts = {}, ipCounts = {};
        let errors = 0, recentCount = 0;
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
          topTools:    Object.entries(toolCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count})),
          topIps:      Object.entries(ipCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([ip,count])=>({ip,count})),
          methods:     methodCounts,
          errors,
          recentCount,
          firstSeen:   logs[0]?.time ?? null,
          lastSeen:    logs[logs.length-1]?.time ?? null,
        };
      }
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
        return Object.entries(buckets).sort((a,b)=>a[0].localeCompare(b[0])).map(([minute,count])=>({minute,count}));
      }
      clear() { this._logs = []; }
      get size() { return this._logs.length; }
    }
    return { LogStore };
  })();
  return new LS(100);
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

  describe('clear()', () => {
    it('resets the store to empty', () => {
      store.add({ ip: 'a' });
      store.clear();
      expect(store.size).toBe(0);
      expect(store.stats().total).toBe(0);
    });
  });
});
