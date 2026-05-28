'use strict';

const path    = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { TOOLS, callTool } = require('./tools');
const store   = require('./store');
const syslog  = require('./syslog');

const PORT           = process.env.PORT || 3110;
const SERVER_NAME    = process.env.SERVER_NAME || 'enterprise-integrations';
const SERVER_VERSION = '1.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const DASHBOARD_DIST = path.join(__dirname, 'dashboard', 'dist');

const app = express();
app.disable('x-powered-by');
app.use(express.json());

// Remove the Date header — Node.js adds it automatically and it changes every
// second, making byte-identical responses look "distinct" to determinism probes.
app.use((_req, res, next) => { res.removeHeader('Date'); next(); });

// ── Access logging ───────────────────────────────────────────────────────────

function logAccess(req, extra = {}) {
  const entry = store.add({
    ip:     req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?',
    method: req.method,
    path:   req.path,
    ua:     req.headers['user-agent'] || '',
    ...extra,
  });
  syslog.send(entry);
  process.stdout.write(JSON.stringify(entry) + '\n');
  return entry;
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

function rpcOk(id, result)  { return { jsonrpc: '2.0', id, result }; }
function rpcErr(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

// ── MCP dispatcher ───────────────────────────────────────────────────────────

function handleRpc(req, body) {
  const { method, params, id } = body;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      logAccess(req, { mcp_method: 'initialize', client: params?.clientInfo });
      return rpcOk(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities:   { tools: {}, resources: {}, prompts: {} },
        serverInfo:     { name: SERVER_NAME, version: SERVER_VERSION },
      });

    case 'notifications/initialized':
      // Notification — no response, but log it
      logAccess(req, { mcp_method: 'notifications/initialized' });
      return null;

    case 'ping':
      return rpcOk(id, {});

    case 'tools/list':
      logAccess(req, { mcp_method: 'tools/list' });
      return rpcOk(id, { tools: TOOLS });

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      logAccess(req, { mcp_method: 'tools/call', tool: toolName, args: toolArgs });

      // Unknown tool → JSON-RPC error, not a result block.
      // Real scripted MCP servers reject unknown tool names at the protocol layer.
      if (!TOOLS.find(t => t.name === toolName)) {
        return rpcErr(id, -32602, `Tool not found: ${toolName}`);
      }

      try {
        const result = callTool(toolName, toolArgs);
        return rpcOk(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        });
      } catch (err) {
        // Tool exists but execution failed → isError in result (spec-correct)
        return rpcOk(id, {
          content: [{ type: 'text', text: err.message }],
          isError: true,
        });
      }
    }

    case 'resources/list':
      logAccess(req, { mcp_method: 'resources/list' });
      return rpcOk(id, { resources: [] });

    case 'prompts/list':
      logAccess(req, { mcp_method: 'prompts/list' });
      return rpcOk(id, { prompts: [] });

    default:
      return rpcErr(id, -32601, `Method not found: ${method}`);
  }
}

// ── Streamable HTTP transport (POST /mcp) ────────────────────────────────────

app.post('/mcp', (req, res) => {
  const body = req.body;
  if (!body || body.jsonrpc !== '2.0') {
    return res.status(400).json(rpcErr(null, -32600, 'Invalid Request'));
  }

  const isNotification = body.id === undefined || body.id === null;
  const response = handleRpc(req, body);

  if (isNotification || response === null) return res.status(202).end();

  if ((req.headers['accept'] || '').includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(`data: ${JSON.stringify(response)}\n\n`);
    return res.end();
  }

  res.json(response);
});

// ── SSE transport (GET /sse + POST /messages) ────────────────────────────────

const sessions = new Map();

app.get('/sse', (req, res) => {
  const sessionId = uuidv4();
  logAccess(req, { transport: 'sse', event: 'connect', session_id: sessionId });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  sessions.set(sessionId, res);
  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

  const keepalive = setInterval(() => res.write(': keepalive\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(keepalive);
    sessions.delete(sessionId);
    logAccess(req, { transport: 'sse', event: 'disconnect', session_id: sessionId });
  });
});

app.post('/messages', (req, res) => {
  const sseRes = sessions.get(req.query.sessionId);
  if (!sseRes) return res.status(404).json({ error: 'Session not found' });

  const body = req.body;
  if (!body || body.jsonrpc !== '2.0') {
    return res.status(400).json(rpcErr(null, -32600, 'Invalid Request'));
  }

  const isNotification = body.id === undefined || body.id === null;
  const response = handleRpc(req, body);
  res.status(202).end();

  if (!isNotification && response !== null) {
    sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  }
});

// ── Dashboard API ─────────────────────────────────────────────────────────────

app.get('/api/logs', (req, res) => {
  res.json(store.query(req.query));
});

app.get('/api/stats', (_req, res) => {
  res.json(store.stats());
});

app.get('/api/timeline', (req, res) => {
  const minutes = Math.min(parseInt(req.query.minutes || '60', 10), 1440);
  res.json(store.timeline(minutes));
});

app.get('/api/tools', (_req, res) => {
  res.json({ tools: TOOLS.map(t => t.name) });
});

// Real-time event stream for the dashboard
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const onLog = (record) => {
    res.write(`event: log\ndata: ${JSON.stringify(record)}\n\n`);
  };

  store.on('log', onLog);
  const keepalive = setInterval(() => res.write(': keepalive\n\n'), 25_000);

  req.on('close', () => {
    store.off('log', onLog);
    clearInterval(keepalive);
  });
});

// ── Health / discovery ───────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: SERVER_NAME, version: SERVER_VERSION });
});

app.get('/.well-known/mcp', (_req, res) => {
  res.json({
    name:            SERVER_NAME,
    version:         SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    endpoints:       { http: '/mcp', sse: '/sse' },
  });
});

// ── CORS ─────────────────────────────────────────────────────────────────────

app.options(/.*/, (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

// ── Dashboard static files (production) ──────────────────────────────────────

app.use(express.static(DASHBOARD_DIST));
app.get(/^(?!\/api|\/mcp|\/sse|\/messages|\/health|\/\.well-known).*/, (_req, res) => {
  res.sendFile(path.join(DASHBOARD_DIST, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'Dashboard not built. Run: cd dashboard && npm run build' });
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    process.stdout.write(JSON.stringify({ time: new Date().toISOString(), event: 'start', port: PORT, server: SERVER_NAME }) + '\n');
  });
}

module.exports = { app, store, sessions };
