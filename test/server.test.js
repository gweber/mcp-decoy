import { describe, it, expect, beforeEach } from 'vitest';
import http from 'http';
import request from 'supertest';
const { app, store, sessions } = require('../index.js');
const { TOOLS } = require('../tools.js');

// Starts the Express app on a random port and returns { port, close }
function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ port, close: () => new Promise(r => server.close(r)) });
    });
  });
}

// Fires a GET and resolves with the IncomingMessage (headers available immediately)
function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, resolve);
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('timeout')));
  });
}

// Reset log store between test suites to keep stats predictable
beforeEach(() => store.clear());

// ── Helpers ──────────────────────────────────────────────────────────────────

function rpc(method, params = {}, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}

function notification(method, params = {}) {
  return { jsonrpc: '2.0', method, params };
}

async function post(body) {
  return request(app)
    .post('/mcp')
    .set('Content-Type', 'application/json')
    .send(body);
}

// ── MCP protocol — HTTP transport ─────────────────────────────────────────────

describe('POST /mcp — initialize', () => {
  it('returns 200 with JSON-RPC result', async () => {
    const res = await post(rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '0.0.1' },
    }));
    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.id).toBe(1);
    expect(res.body.result.protocolVersion).toBe('2024-11-05');
    expect(res.body.result.serverInfo.name).toBeTruthy();
    expect(res.body.result.capabilities).toHaveProperty('tools');
  });

  it('logs the initialize event to the store', async () => {
    await post(rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {} }));
    const { logs } = store.query({ mcp_method: 'initialize' });
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('POST /mcp — notifications/initialized', () => {
  it('returns 202 with empty body for notifications', async () => {
    const res = await post(notification('notifications/initialized'));
    expect(res.status).toBe(202);
    expect(res.text).toBe('');
  });
});

describe('POST /mcp — ping', () => {
  it('returns empty result object', async () => {
    const res = await post(rpc('ping'));
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({});
  });
});

describe('POST /mcp — tools/list', () => {
  it('returns all 38 tools', async () => {
    const res = await post(rpc('tools/list'));
    expect(res.status).toBe(200);
    expect(res.body.result.tools).toHaveLength(38);
  });

  it('each tool has name, description, and inputSchema', async () => {
    const res = await post(rpc('tools/list'));
    for (const tool of res.body.result.tools) {
      expect(tool, `${tool.name} missing description`).toHaveProperty('description');
      expect(tool, `${tool.name} missing inputSchema`).toHaveProperty('inputSchema');
    }
  });

  it('returned names match TOOLS export', async () => {
    const res = await post(rpc('tools/list'));
    const names = res.body.result.tools.map(t => t.name);
    const expected = TOOLS.map(t => t.name);
    expect(names).toEqual(expected);
  });
});

describe('POST /mcp — tools/call', () => {
  it('calls a valid tool and returns isError: false', async () => {
    const res = await post(rpc('tools/call', { name: 'jira_search_issues', arguments: { jql: 'project = SEC' } }));
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(false);
    expect(res.body.result.content[0].type).toBe('text');
  });

  it('result content is valid JSON', async () => {
    const res = await post(rpc('tools/call', { name: 'slack_channels_list', arguments: {} }));
    expect(() => JSON.parse(res.body.result.content[0].text)).not.toThrow();
  });

  it('returns JSON-RPC error -32602 for unknown tool (not a result block)', async () => {
    const res = await post(rpc('tools/call', { name: 'nonexistent_tool', arguments: {} }));
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('result');
    expect(res.body.error.code).toBe(-32602);
    expect(res.body.error.message).toContain('Tool not found');
  });

  it('logs the tool name to the store', async () => {
    await post(rpc('tools/call', { name: 'confluence_search', arguments: { cql: 'test' } }));
    const { logs } = store.query({ tool: 'confluence_search' });
    expect(logs.length).toBeGreaterThan(0);
  });

  const sampleTools = [
    ['bitbucket_search_repositories', { query: 'test' }],
    ['cassandra_list_keyspaces', {}],
    ['elasticsearch_list_indices', {}],
    ['postgresql_list_databases', {}],
    ['confluence_get_page', { title: 'Runbook' }],
    ['github_search_repositories', { query: 'auth' }],
    ['gitlab_search_repositories', { query: 'auth' }],
    ['google_search_drive_files', { query: 'report' }],
    ['jenkins_searchbuildlog', { job_name: 'build', pattern: 'error' }],
    ['jira_get_issue', { issue_key: 'PROJ-1' }],
    ['slack_get_user_info', { user: 'U0A1B2C3D' }],
    ['salesforce_get_account', { company_name: 'Acme Corporation' }],
  ];

  for (const [name, args] of sampleTools) {
    it(`${name} returns a non-error response via HTTP`, async () => {
      const res = await post(rpc('tools/call', { name, arguments: args }));
      expect(res.body.result.isError).toBe(false);
      const parsed = JSON.parse(res.body.result.content[0].text);
      expect(parsed).toBeTruthy();
    });
  }
});

describe('POST /mcp — resources/list', () => {
  it('returns empty resources array', async () => {
    const res = await post(rpc('resources/list'));
    expect(res.status).toBe(200);
    expect(res.body.result.resources).toEqual([]);
  });
});

describe('POST /mcp — prompts/list', () => {
  it('returns empty prompts array', async () => {
    const res = await post(rpc('prompts/list'));
    expect(res.status).toBe(200);
    expect(res.body.result.prompts).toEqual([]);
  });
});

describe('POST /mcp — unknown method', () => {
  it('returns -32601 error code', async () => {
    const res = await post(rpc('no_such_method'));
    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe(-32601);
  });
});

describe('POST /mcp — invalid request', () => {
  it('returns 400 when jsonrpc field is missing', async () => {
    const res = await request(app).post('/mcp').send({ id: 1, method: 'ping' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32600);
  });

  it('returns 400 for completely malformed body', async () => {
    const res = await request(app).post('/mcp')
      .set('Content-Type', 'application/json')
      .send('not json at all');
    expect(res.status).toBe(400);
  });
});

// ── SSE transport ─────────────────────────────────────────────────────────────

describe('GET /sse', () => {
  it('responds with text/event-stream content type', async () => {
    const srv = await startServer();
    try {
      const res = await httpGet(srv.port, '/sse');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      res.destroy();
    } finally {
      await srv.close();
    }
  });
});

describe('POST /messages', () => {
  it('returns 404 for unknown sessionId', async () => {
    const res = await request(app)
      .post('/messages?sessionId=does-not-exist')
      .send(rpc('ping'));
    expect(res.status).toBe(404);
  });

  it('returns 202 for valid sessionId', async () => {
    const sessionId = 'test-session-' + Date.now();
    const mockRes = {
      write: () => {},
      on: () => {},
      setHeader: () => {},
      flushHeaders: () => {},
    };
    sessions.set(sessionId, mockRes);

    const res = await request(app)
      .post(`/messages?sessionId=${sessionId}`)
      .send(rpc('ping'));

    expect(res.status).toBe(202);
    sessions.delete(sessionId);
  });
});

// ── Discovery & health ────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns status ok with server info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.server).toBeTruthy();
    expect(res.body.version).toBeTruthy();
  });
});

describe('GET /.well-known/mcp', () => {
  it('returns server discovery info', async () => {
    const res = await request(app).get('/.well-known/mcp');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('protocolVersion');
    expect(res.body.endpoints).toHaveProperty('http');
    expect(res.body.endpoints).toHaveProperty('sse');
  });
});

// ── Dashboard API ─────────────────────────────────────────────────────────────

describe('GET /api/logs', () => {
  beforeEach(async () => {
    // Seed some logs via real MCP calls
    await post(rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {} }));
    await post(rpc('tools/call', { name: 'jira_search_issues', arguments: { jql: 'project = TEST' } }));
    await post(rpc('tools/call', { name: 'slack_channels_list', arguments: {} }));
  });

  it('returns total and logs array', async () => {
    const res = await request(app).get('/api/logs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body.logs).toBeInstanceOf(Array);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('filters by tool name', async () => {
    const res = await request(app).get('/api/logs?tool=jira_search_issues');
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    for (const l of res.body.logs) {
      expect(l.tool).toBe('jira_search_issues');
    }
  });

  it('respects limit parameter', async () => {
    const res = await request(app).get('/api/logs?limit=1');
    expect(res.body.logs).toHaveLength(1);
  });

  it('supports pagination via offset', async () => {
    const all   = await request(app).get('/api/logs');
    const page1 = await request(app).get('/api/logs?limit=1&offset=0');
    const page2 = await request(app).get('/api/logs?limit=1&offset=1');
    if (all.body.total > 1) {
      expect(page1.body.logs[0].id).not.toBe(page2.body.logs[0].id);
    }
  });
});

describe('GET /api/stats', () => {
  beforeEach(async () => {
    await post(rpc('tools/call', { name: 'confluence_search', arguments: { cql: 'test' } }));
    await post(rpc('tools/call', { name: 'confluence_search', arguments: { cql: 'test' } }));
  });

  it('returns stats object with required fields', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('uniqueIps');
    expect(res.body).toHaveProperty('topTools');
    expect(res.body).toHaveProperty('methods');
    expect(res.body).toHaveProperty('errors');
    expect(res.body).toHaveProperty('recentCount');
  });

  it('topTools lists confluence_search as most-used', async () => {
    const res = await request(app).get('/api/stats');
    const top = res.body.topTools[0];
    expect(top.name).toBe('confluence_search');
    expect(top.count).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/timeline', () => {
  it('returns 60 minute buckets by default', async () => {
    const res = await request(app).get('/api/timeline');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(60);
    expect(res.body[0]).toHaveProperty('minute');
    expect(res.body[0]).toHaveProperty('count');
  });

  it('respects ?minutes query param (max 1440)', async () => {
    const res30 = await request(app).get('/api/timeline?minutes=30');
    expect(res30.body).toHaveLength(30);
    const res9k = await request(app).get('/api/timeline?minutes=9999');
    expect(res9k.body).toHaveLength(1440);
  });
});

describe('GET /api/tools', () => {
  it('returns all tool names', async () => {
    const res = await request(app).get('/api/tools');
    expect(res.status).toBe(200);
    expect(res.body.tools).toHaveLength(38);
    expect(res.body.tools).toContain('jira_search_issues');
    expect(res.body.tools).toContain('salesforce_get_account');
  });
});

describe('GET /api/events', () => {
  it('responds with text/event-stream', async () => {
    const srv = await startServer();
    try {
      const res = await httpGet(srv.port, '/api/events');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      res.destroy();
    } finally {
      await srv.close();
    }
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────────

describe('OPTIONS pre-flight', () => {
  it('returns CORS headers on OPTIONS /mcp', async () => {
    const res = await request(app).options('/mcp');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });
});
