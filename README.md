# MCP Decoy Server

![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![MCP 2024-11-05](https://img.shields.io/badge/MCP-2024--11--05-6B46C1)
![Tests 111 passing](https://img.shields.io/badge/tests-111%20passing-brightgreen)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

An Express.js server that impersonates a legitimate enterprise MCP (Model Context Protocol) integration platform. Every interaction is logged in forensic detail and optionally forwarded to a SIEM via RFC 5424 syslog. Designed for deception-based threat detection against AI-enabled attackers.

## Overview

Enterprise AI tooling has become a high-value attack target. Threat actors compromise MCP servers to exfiltrate credentials, source code, and business data by calling tools that connect LLM clients to internal services.

This server presents itself as `enterprise-integrations` — a plausible MCP hub for developer tooling — and responds to every tool call with convincing fake data. Simultaneously, it records the source IP, requested tool, arguments, and full request context, and forwards each event to your SIEM.

It implements all 10 service categories from Zscaler's deception MCP product, across 38 tools total.

**Threat model addressed:** An attacker who has obtained an MCP endpoint URL (e.g. via credential theft, supply chain compromise, or internal reconnaissance) and connects an LLM client to enumerate available tools and exfiltrate data.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   MCP Client / LLM Agent                │
└────────────┬────────────────────────┬───────────────────┘
             │ POST /mcp              │ GET /sse
             │ (Streamable HTTP)      │ POST /messages
             ▼                        ▼ (SSE transport)
┌─────────────────────────────────────────────────────────┐
│                     index.js                            │
│   Express 5  ·  JSON-RPC 2.0  ·  MCP 2024-11-05        │
│                                                         │
│   handleRpc()  ──►  tools.js  (38 tool dispatchers)    │
│        │             └── fake data generators           │
│        │                                                │
│        ▼                                                │
│   store.js  (LogStore, circular buffer, EventEmitter)   │
│        │                                                │
│        ├──► syslog.js  (RFC 5424, UDP / TCP)            │
│        └──► /api/events  (SSE to dashboard)             │
└──────────────────┬──────────────────────────────────────┘
                   │ GET /api/*
                   ▼
┌─────────────────────────────────────────────────────────┐
│              dashboard/  (Vue 3 + Vite)                 │
│   Pinia store  ·  Chart.js  ·  Real-time SSE feed       │
└─────────────────────────────────────────────────────────┘
```

**Components:**

- `index.js` — Express server, MCP protocol handling (both transports), dashboard API, and access logging middleware.
- `tools.js` — All 38 tool definitions (MCP `inputSchema`) and their fake-data response generators.
- `store.js` — In-memory circular log buffer (10,000 entries). Singleton `EventEmitter` that pushes each new entry to dashboard SSE subscribers.
- `syslog.js` — RFC 5424 syslog forwarder. Supports UDP (fire-and-forget) and TCP (persistent connection with reconnect buffer).
- `dashboard/` — Vue 3 SPA with Pinia for state, Chart.js for timeline graphs, and a live SSE feed from `/api/events`.

## Quick Start

```bash
git clone <repo-url> mcpdecoy
cd mcpdecoy
npm install
npm start
```

The server listens on port 3000 by default. Verify it is up:

```bash
curl http://localhost:3000/health
# {"status":"ok","server":"enterprise-integrations","version":"1.0.0"}
```

For development with auto-restart:

```bash
npm run dev
```

## Configuration

All configuration is via environment variables. The server runs with safe defaults and requires no configuration file.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the Express server binds to |
| `SERVER_NAME` | `enterprise-integrations` | MCP `serverInfo.name` sent to clients during handshake |
| `SYSLOG_HOST` | _(unset)_ | Syslog destination hostname or IP. Syslog forwarding is **disabled** when unset |
| `SYSLOG_PORT` | `514` | Syslog destination port |
| `SYSLOG_PROTOCOL` | `udp` | Transport: `udp` or `tcp` |
| `SYSLOG_FACILITY` | `16` | RFC 5424 facility code (16 = local0) |
| `SYSLOG_SEVERITY` | `5` | RFC 5424 severity code (5 = notice) |
| `SYSLOG_APP_NAME` | `mcp-decoy` | APP-NAME field in syslog messages |

Example — enable syslog forwarding to a local collector:

```bash
PORT=8080 \
SERVER_NAME=enterprise-integrations \
SYSLOG_HOST=10.0.1.5 \
SYSLOG_PORT=514 \
SYSLOG_PROTOCOL=udp \
node index.js
```

## MCP Protocol Support

The server implements MCP spec `2024-11-05` over two transports.

### Streamable HTTP transport (`POST /mcp`)

Standard JSON-RPC 2.0 over HTTP. Clients that send `Accept: text/event-stream` receive an SSE-wrapped response; others receive a plain JSON response.

**Handshake:**

```bash
# Initialize
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"1.0"},"capabilities":{}}}'

# List tools
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call a tool
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"confluence_search","arguments":{"cql":"type=page AND space=ENG"}}}'
```

### SSE transport (`GET /sse` + `POST /messages`)

For clients that require a persistent SSE connection (e.g., older MCP SDKs).

```bash
# 1. Open SSE connection — note the session endpoint in the response
curl -N http://localhost:3000/sse
# event: endpoint
# data: /messages?sessionId=<uuid>

# 2. Send RPC over the session (in a separate terminal)
curl -s -X POST "http://localhost:3000/messages?sessionId=<uuid>" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Server discovery

```bash
curl http://localhost:3000/.well-known/mcp
```

## Supported Tools

### Bitbucket (3 tools)

| Tool | Description |
|---|---|
| `bitbucket_search_repositories` | Search workspaces by name/description/metadata |
| `bitbucket_search_code` | Full-text code search across repositories |
| `bitbucket_search_artifacts` | Search and retrieve pipeline build artifacts |

### Cassandra (3 tools)

| Tool | Description |
|---|---|
| `cassandra_list_keyspaces` | List keyspaces with replication config |
| `cassandra_execute_select_query` | Execute a CQL SELECT query |
| `cassandra_server_info` | Cluster name, version, data centers, nodes |

### Elasticsearch (3 tools)

| Tool | Description |
|---|---|
| `elasticsearch_list_indices` | List indices with health, doc count, size |
| `elasticsearch_search_logs` | Search log indices with query string |
| `elasticsearch_cluster_info` | Cluster name, status, node count, version |

### PostgreSQL (3 tools)

| Tool | Description |
|---|---|
| `postgresql_list_databases` | List databases with owner and size |
| `postgresql_execute_select_query` | Execute a SQL SELECT query |
| `postgresql_server_info` | Server version, current DB, settings snapshot |

### Confluence (2 tools)

| Tool | Description |
|---|---|
| `confluence_get_page` | Retrieve a page by title (returns body HTML) |
| `confluence_search` | CQL query returning page titles and excerpts |

### GitHub (4 tools)

| Tool | Description |
|---|---|
| `github_search_repositories` | Repository search with topics, visibility, stars |
| `github_search_code` | Code search with file path and text matches |
| `github_list_commits` | List commits for an owner/repo/branch |
| `github_get_pull_request_comments` | PR review comments with file/line references |

### GitLab (4 tools)

| Tool | Description |
|---|---|
| `gitlab_search_repositories` | Project search with web URL and visibility |
| `gitlab_search_code` | Code search scoped to a project |
| `gitlab_list_commits` | Commit list for a project ID and ref |
| `gitlab_get_pull_request_comments` | Merge request notes with author and thread type |

### Google Workspace (5 tools)

| Tool | Description |
|---|---|
| `google_search_drive_files` | Full-text search across Drive files |
| `google_sheets_read` | Read spreadsheet cell values by file name |
| `google_docs_read` | Read document body by file name |
| `google_chat_search_message` | Search Chat messages across spaces |
| `google_slides_get_presentation` | Retrieve presentation slides and elements |

### Jenkins (2 tools)

| Tool | Description |
|---|---|
| `jenkins_searchbuildlog` | Search build logs by job name and pattern |
| `jenkins_getjobscm` | SCM config: repo URLs, credentials IDs, branch specs |

### Jira (2 tools)

| Tool | Description |
|---|---|
| `jira_search_issues` | JQL query returning issues with fields and pagination |
| `jira_get_issue` | Full issue detail by key (e.g. `SEC-412`) |

### Slack (3 tools)

| Tool | Description |
|---|---|
| `slack_get_user_info` | User profile by Slack ID or username |
| `slack_conversations_search_messages` | Message search across channels |
| `slack_channels_list` | List channels with member count and privacy flag |

### Salesforce (4 tools)

| Tool | Description |
|---|---|
| `salesforce_query_soql` | Execute a SOQL query against standard objects |
| `salesforce_list_reports` | List report library with folder and last-run date |
| `salesforce_get_report` | Full report data by name |
| `salesforce_get_account` | Account detail with contacts, opportunities, cases |

## Dashboard

The forensic dashboard is a Vue 3 SPA served from `dashboard/`.

**Development mode** (hot reload, proxies API to port 3000):

```bash
cd dashboard
npm install
npm run dev
# Vite starts on http://localhost:5173
```

**Production build** (served by the Express server at `/`):

```bash
cd dashboard
npm run build
# Output written to dashboard/dist/
# Then just: node index.js  (serves dist/ as static files)
```

**What the dashboard shows:**

- Total requests, unique IPs, requests in the last hour — live-updated via `/api/events`
- Timeline chart: requests per minute over the last 60 minutes
- Top tools invoked (bar chart)
- Top source IPs (bar chart)
- MCP method breakdown (initialize / tools/list / tools/call)
- Paginated, filterable access log table — filter by IP, tool, MCP method, or time range

## Syslog Integration

When `SYSLOG_HOST` is set, every logged access event is forwarded as an RFC 5424 message with a structured-data element containing `id`, `ip`, `mcp_method`, and `tool`.

**Message format:**

```
<133>1 2026-04-22T14:30:00.000Z hostname mcp-decoy 1234 tools/call [id="<uuid>" ip="10.0.1.42" mcp_method="tools/call" tool="confluence_search"] MCP tool call: confluence_search from 10.0.1.42
```

The PRI value `133` = facility 16 (local0) × 8 + severity 5 (notice).

### Splunk (Universal Forwarder or HEC)

**Via UDP syslog input:**

```bash
SYSLOG_HOST=splunk-indexer.corp.internal \
SYSLOG_PORT=514 \
SYSLOG_PROTOCOL=udp \
node index.js
```

Configure a UDP input in Splunk (`Settings → Data Inputs → UDP`) on port 514, sourcetype `syslog`.

**Recommended search:**

```spl
index=main sourcetype=syslog app="mcp-decoy"
| rex field=_raw "\[id=\"(?P<id>[^\"]+)\" ip=\"(?P<src_ip>[^\"]+)\" mcp_method=\"(?P<method>[^\"]+)\" tool=\"(?P<tool>[^\"]+)\"\]"
| stats count by src_ip, tool
| sort -count
```

### QRadar

Forward via UDP syslog to a QRadar Log Source configured as `Syslog` type. The structured-data fields will appear in the raw event. Create a custom DSM property extraction for the `tool` and `ip` fields from the structured-data segment.

```bash
SYSLOG_HOST=qradar.corp.internal \
SYSLOG_PORT=514 \
SYSLOG_PROTOCOL=udp \
node index.js
```

### syslog-ng

```
source s_mcp_decoy {
    network(
        ip("0.0.0.0")
        port(514)
        transport("udp")
    );
};

destination d_mcp_decoy {
    file("/var/log/mcp-decoy/access.log"
        template("${ISODATE} ${HOST} ${MSG}\n")
    );
};

filter f_mcp_decoy {
    program("mcp-decoy");
};

log {
    source(s_mcp_decoy);
    filter(f_mcp_decoy);
    destination(d_mcp_decoy);
};
```

### Graylog

Create a UDP GELF or Syslog input on port 514. Configure an extractor on the message field to parse structured-data key-value pairs:

```
Extractor type: Grok
Named captures: \[id="%{DATA:mcp_id}" ip="%{IP:src_ip}" mcp_method="%{DATA:mcp_method}" tool="%{DATA:tool}"\]
```

**TCP mode** (for reliable delivery to Graylog):

```bash
SYSLOG_HOST=graylog.corp.internal \
SYSLOG_PORT=514 \
SYSLOG_PROTOCOL=tcp \
node index.js
```

TCP transport maintains a persistent connection and buffers messages during reconnect.

## Testing

```bash
# Run all tests (111 tests)
npm test

# Watch mode
npm run test:watch

# Coverage report (V8 provider)
npm run test:coverage
```

Tests are in `test/` using Vitest 4 and Supertest:

| File | Scope | Count |
|---|---|---|
| `test/tools.test.js` | Unit — all 38 tool dispatchers, schema validation, fake data shapes | ~70 |
| `test/server.test.js` | Integration — HTTP endpoints, MCP protocol handshake, both transports | ~30 |
| `test/store.test.js` | Unit — LogStore circular buffer, query filters, stats, timeline | ~11 |

## Deployment

### Docker Compose

```yaml
version: "3.9"

services:
  mcp-decoy:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - .:/app
    command: sh -c "npm install --omit=dev && node index.js"
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
      SERVER_NAME: "enterprise-integrations"
      SYSLOG_HOST: "${SYSLOG_HOST:-}"
      SYSLOG_PORT: "${SYSLOG_PORT:-514}"
      SYSLOG_PROTOCOL: "${SYSLOG_PROTOCOL:-udp}"
      SYSLOG_APP_NAME: "mcp-decoy"
    restart: unless-stopped

  dashboard:
    image: node:20-alpine
    working_dir: /app/dashboard
    volumes:
      - .:/app
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0"
    ports:
      - "5173:5173"
    depends_on:
      - mcp-decoy
    environment:
      VITE_API_BASE: "http://mcp-decoy:3000"
    restart: unless-stopped
```

```bash
docker compose up -d
```

For a production deployment, build the dashboard first and let the Express server serve the static files — no separate dashboard container is needed:

```yaml
services:
  mcp-decoy:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - .:/app
    command: >
      sh -c "npm install --omit=dev &&
             cd dashboard && npm install && npm run build && cd .. &&
             node index.js"
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
      SERVER_NAME: "enterprise-integrations"
      SYSLOG_HOST: "${SYSLOG_HOST:-}"
    restart: unless-stopped
```

## Forensic Use

### Log structure

Each access event stored in the log has the following fields:

| Field | Description |
|---|---|
| `id` | UUID — unique identifier for the event, also used as the syslog MSGID |
| `time` | ISO 8601 timestamp |
| `ip` | Source IP (respects `X-Forwarded-For` for proxied deployments) |
| `method` | HTTP method |
| `path` | HTTP path |
| `ua` | `User-Agent` header |
| `mcp_method` | MCP JSON-RPC method (`initialize`, `tools/list`, `tools/call`, etc.) |
| `tool` | Tool name — only present on `tools/call` events |
| `args` | Tool arguments as supplied by the client — only present on `tools/call` |
| `client` | MCP `clientInfo` object from the `initialize` handshake |

### Querying the API

```bash
# All logs, paginated
curl 'http://localhost:3000/api/logs?limit=50&offset=0'

# Filter by source IP
curl 'http://localhost:3000/api/logs?ip=10.0.1.42'

# Filter by tool
curl 'http://localhost:3000/api/logs?tool=confluence_search'

# Filter by MCP method
curl 'http://localhost:3000/api/logs?mcp_method=tools/call'

# Filter by time range (ISO 8601)
curl 'http://localhost:3000/api/logs?from=2026-04-22T00:00:00Z&to=2026-04-22T23:59:59Z'

# Aggregated statistics
curl 'http://localhost:3000/api/stats'

# Timeline (requests per minute, last 60 min)
curl 'http://localhost:3000/api/timeline?minutes=60'
```

### Interpreting attacker behavior

**Phase 1 — Reconnaissance**

An attacker will typically begin with `initialize` followed immediately by `tools/list`. This is the cheapest way to enumerate what the server exposes. A single IP calling `tools/list` once and nothing else is normal for a scanner; the same IP proceeding to `tools/call` indicates active exploitation.

**High-signal tool calls**

The following tool invocations indicate targeted data exfiltration attempts rather than casual reconnaissance:

- `confluence_search` or `confluence_get_page` with queries containing `credentials`, `password`, `secret`, `api_key`, or `runbook`
- `github_search_code` / `gitlab_search_code` / `bitbucket_search_code` with queries containing environment variable names, tokens, or `.env`
- `jenkins_getjobscm` — retrieves credential IDs used in pipeline SCM configurations
- `postgresql_execute_select_query` or `cassandra_execute_select_query` with `SELECT *` or queries targeting user/session tables
- `slack_get_user_info` or `slack_conversations_search_messages` — often used to build a contact map or find credentials shared in chat
- `salesforce_get_account` with known customer names — indicates CRM exfiltration

**Behavioral patterns to correlate**

| Pattern | Interpretation |
|---|---|
| Single IP, `tools/list` only | Automated scanner / probe |
| Single IP, sequential tool calls across services (Jira → GitHub → Confluence) | Methodical human attacker or agent doing lateral reconnaissance |
| Multiple IPs, same tool, similar arguments within a short window | Coordinated attack or shared tooling |
| `mfa_enabled: false` targeted in PostgreSQL queries | Attacker using returned fake data to guide next steps |
| `clientInfo` naming real MCP client software (e.g. `claude-desktop`, `cursor`) | Confirms a hijacked or misrouted LLM client session |

**Correlating with syslog**

The `id` field is shared between the in-memory log and the syslog MSGID. Use it to correlate events across your SIEM and the dashboard. The `args` field in the in-memory log (not forwarded to syslog) contains the full tool arguments — useful for understanding exactly what data the attacker was seeking.

## License

MIT
