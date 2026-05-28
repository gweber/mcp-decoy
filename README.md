# MCP Decoy Server

![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)
![MCP 2024-11-05](https://img.shields.io/badge/MCP-2024--11--05-6B46C1)
![Tests 141 passing](https://img.shields.io/badge/tests-141%20passing-brightgreen)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

An Express.js server that impersonates a legitimate enterprise MCP (Model Context Protocol) integration platform. Every interaction is logged in forensic detail and optionally forwarded to a SIEM via RFC 5424 syslog. Designed for deception-based threat detection against AI-enabled attackers.

## Overview

Enterprise AI tooling has become a high-value attack target. Threat actors compromise MCP servers to exfiltrate credentials, source code, and business data by calling tools that connect LLM clients to internal services.

This server presents itself as `enterprise-integrations` — a plausible MCP hub for developer tooling — and responds to every tool call with convincing fake data. Simultaneously, it records the source IP, requested tool, arguments, and full request context, and forwards each event to your SIEM.

It ships with 10 plausible enterprise integration categories, across 38 tools total, modeled after the kinds of systems commonly exposed through MCP-style internal tooling.

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
git clone https://github.com/gweber/mcp-decoy.git
cd mcp-decoy
npm install
npm start
```

The server listens on port 3110 by default. Verify it is up:

```bash
curl http://localhost:3110/health
# {"status":"ok","server":"enterprise-integrations","version":"1.2.0"}
```

For development with auto-restart:

```bash
npm run dev
```

## Configuration

All configuration is via environment variables. The server runs with safe defaults and requires no configuration file.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3110` | TCP port the Express server binds to |
| `SERVER_NAME` | `enterprise-integrations` | MCP `serverInfo.name` sent to clients during handshake |
| `STORE_BACKEND` | `sqlite` | Log storage backend. Use `memory` for non-durable lab runs |
| `SQLITE_PATH` | `./data/mcp-decoy.db` | SQLite database path when `STORE_BACKEND=sqlite` |
| `LOG_RETENTION_DAYS` | `90` | SQLite retention window in days. Older records are pruned on startup and can be pruned programmatically |
| `LOG_MAX_SIZE` | `10000` | Maximum retained log records. For SQLite this caps records after each insert; for memory this caps the in-memory ring buffer |
| `DASHBOARD_TOKEN` | _(unset)_ | Optional bearer token for `/api/*` and dashboard data access. MCP decoy endpoints stay unauthenticated |
| `SYSLOG_HOST` | _(unset)_ | Syslog destination hostname or IP. Syslog forwarding is **disabled** when unset |
| `SYSLOG_PORT` | `514` | Syslog destination port |
| `SYSLOG_PROTOCOL` | `udp` | Transport: `udp` or `tcp` |
| `SYSLOG_FACILITY` | `16` | RFC 5424 facility code (16 = local0) |
| `SYSLOG_SEVERITY` | `5` | RFC 5424 severity code for raw access events (5 = notice) |
| `SYSLOG_DETECTIONS` | `true` | Forward generated detections as separate RFC 5424 syslog events when `SYSLOG_HOST` is set. Set to `false` to forward raw logs only |
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
curl -s -X POST http://localhost:3110/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"1.0"},"capabilities":{}}}'

# List tools
curl -s -X POST http://localhost:3110/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call a tool
curl -s -X POST http://localhost:3110/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"confluence_search","arguments":{"cql":"type=page AND space=ENG"}}}'
```

### SSE transport (`GET /sse` + `POST /messages`)

For clients that require a persistent SSE connection (e.g., older MCP SDKs).

```bash
# 1. Open SSE connection — note the session endpoint in the response
curl -N http://localhost:3110/sse
# event: endpoint
# data: /messages?sessionId=<uuid>

# 2. Send RPC over the session (in a separate terminal)
curl -s -X POST "http://localhost:3110/messages?sessionId=<uuid>" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Server discovery

```bash
curl http://localhost:3110/.well-known/mcp
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

**Development mode** (hot reload, proxies API to port 3110):

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
- Recent detections panel with severity, rule ID, source IP, confidence, and summary
- Optional token prompt when `DASHBOARD_TOKEN` protects the dashboard/API
- Paginated, filterable access log table — filter by IP, tool, MCP method, or time range

## Security and Deployment Notes

MCP Decoy is intentionally designed as a deception endpoint. Treat it like an exposed sensor, not like a trusted production integration.

- Do **not** configure it with real credentials or connect it to production data stores. All tool responses should remain fake/decoy data.
- Bind to localhost unless you intentionally want the decoy reachable from another network segment. For Docker, prefer `-p 127.0.0.1:3110:3110` for local-only runs.
- Set `DASHBOARD_TOKEN` before exposing the dashboard/API beyond localhost. This protects `/api/*` data access with a bearer-token `Authorization` header; the MCP decoy endpoints (`/mcp`, `/sse`, `/messages`, `/.well-known/mcp`) remain unauthenticated so clients can still interact with the sensor.
- For Internet or shared-network exposure, still put the service behind a trusted reverse proxy, VPN, firewall rule, or lab network boundary. `DASHBOARD_TOKEN` is a lightweight access gate, not enterprise SSO.
- `X-Forwarded-For` is used for source IP attribution. Only trust that field when the service is behind a proxy you control.
- Logs are stored in SQLite by default with configurable retention. Forward to syslog/SIEM if you need centralized evidence.
- Review local laws, internal policies, and consent requirements before deploying deception systems in shared or customer environments.

## SQLite Persistence

By default, MCP Decoy keeps logs in a local SQLite database with 90-day retention. For an explicit durable local setup:

```bash
STORE_BACKEND=sqlite \
SQLITE_PATH=./data/mcp-decoy.db \
LOG_RETENTION_DAYS=90 \
npm start
```

SQLite mode creates the database directory automatically, stores complete event JSON, and keeps indexes for time, IP, tool, and MCP method queries. It also persists security detections in a `detections` table with indexes for time, rule ID, severity, and source IP. Retention defaults to **90 days** and is applied on startup; `LOG_MAX_SIZE` still caps the maximum number of retained log rows after each insert.

## Detection Rules

MCP Decoy turns selected MCP activity into deduplicated security findings. Detections are stored in SQLite, included in `/api/stats`, returned by `/api/detections`, and streamed to the dashboard over `/api/events` as `detection` events.

Current deterministic rules:

| Rule ID | Severity | Confidence | Trigger |
|---|---:|---:|---|
| `MCP_TOOL_ENUMERATION` | medium | high | Client calls `tools/list` |
| `MCP_MULTI_TOOL_RECON` | high | high | Same source IP calls 3+ distinct tools within 5 minutes |
| `MCP_UNKNOWN_TOOL_PROBE` | medium | medium | Client calls a tool name that is not exported by the decoy |
| `MCP_SECRET_HUNTING_ARGS` | high | medium/high | Tool arguments contain secret-hunting terms such as `.env`, `password`, `secret`, `token`, `api_key`, or `credential` |
| `MCP_DATASTORE_RECON` | high | high | Client calls PostgreSQL, Cassandra, or Elasticsearch decoy tools |
| `MCP_SOURCE_CODE_RECON` | medium | high | Client calls GitHub, GitLab, Bitbucket, or Jenkins source/devops decoy tools |
| `MCP_IDENTITY_RECON` | medium | high | Client calls Slack identity/collaboration decoy tools |

Detections are deduplicated by rule, source IP, subject tool/method, and 5-minute time bucket to reduce alert spam. Treat detections as triage signals: correlate the source host/user with EDR, proxy, identity-provider, and SIEM logs before making incident-response decisions.

## Syslog Integration

When `SYSLOG_HOST` is set, every logged access event is forwarded as an RFC 5424 message with a structured-data element containing `id`, `ip`, `mcp_method`, and `tool`. Generated detections are forwarded as separate RFC 5424 messages by default; set `SYSLOG_DETECTIONS=false` to suppress detection forwarding while keeping raw access logs.

**Raw access message format:**

```
<133>1 2026-04-22T14:30:00.000Z hostname mcp-decoy 1234 tools/call [id="<uuid>" ip="10.0.1.42" mcp_method="tools/call" tool="confluence_search"] MCP tool call: confluence_search from 10.0.1.42
```

The PRI value `133` = facility 16 (local0) × 8 + severity 5 (notice).

**Detection message format:**

```
<131>1 2026-04-22T14:30:01.000Z hostname mcp-decoy 1234 detection [mcp-detection detection_id="<uuid>" rule_id="MCP_DATASTORE_RECON" severity="high" confidence="high" source_ip="10.0.1.42" tool="postgresql_list_databases" mcp_method="tools/call" evidence_count="1"] MCP detection: MCP_DATASTORE_RECON high from 10.0.1.42
```

Detection syslog severity is mapped from detection severity instead of `SYSLOG_SEVERITY`:

- `critical` → RFC severity 2 / critical
- `high` → RFC severity 3 / error
- `medium` → RFC severity 4 / warning
- `low` → RFC severity 5 / notice

With the default local0 facility, a high detection uses PRI `131` = 16 × 8 + 3.

### Splunk (Universal Forwarder or HEC)

**Via UDP syslog input:**

```bash
SYSLOG_HOST=splunk-indexer.corp.internal \
SYSLOG_PORT=514 \
SYSLOG_PROTOCOL=udp \
node index.js
```

Configure a UDP input in Splunk (`Settings → Data Inputs → UDP`) on port 514, sourcetype `syslog`.

**Recommended raw activity search:**

```spl
index=main sourcetype=syslog app="mcp-decoy" NOT msgid="detection"
| rex field=_raw "\[id=\"(?P<id>[^\"]+)\" ip=\"(?P<src_ip>[^\"]+)\" mcp_method=\"(?P<method>[^\"]+)\" tool=\"(?P<tool>[^\"]+)\"\]"
| stats count by src_ip, tool
| sort -count
```

**Recommended detection search:**

```spl
index=main sourcetype=syslog app="mcp-decoy" " mcp-decoy " " detection "
| rex field=_raw "rule_id=\"(?P<rule_id>[^\"]+)\" severity=\"(?P<severity>[^\"]+)\" confidence=\"(?P<confidence>[^\"]+)\" source_ip=\"(?P<src_ip>[^\"]+)\" tool=\"(?P<tool>[^\"]+)\".*evidence_count=\"(?P<evidence_count>[^\"]+)\""
| stats count by severity, rule_id, confidence, src_ip, tool
| sort -count
```

### QRadar

Forward via UDP syslog to a QRadar Log Source configured as `Syslog` type. The structured-data fields will appear in the raw event. Create custom DSM property extractions for raw activity fields (`tool`, `ip`) and detection fields (`rule_id`, `severity`, `confidence`, `source_ip`, `detection_id`, `evidence_count`).

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

Create a UDP GELF or Syslog input on port 514. Configure extractors on the message field to parse structured-data key-value pairs:

```text
Raw activity Grok:
\[id="%{DATA:mcp_id}" ip="%{IP:src_ip}" mcp_method="%{DATA:mcp_method}" tool="%{DATA:tool}"\]

Detection Grok:
\[mcp-detection detection_id="%{DATA:detection_id}" rule_id="%{DATA:rule_id}" severity="%{DATA:severity}" confidence="%{DATA:confidence}" source_ip="%{IP:src_ip}" tool="%{DATA:tool}" mcp_method="%{DATA:mcp_method}" evidence_count="%{NUMBER:evidence_count}"\]
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
# Run all tests (141 tests)
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
| `test/server.test.js` | Integration — HTTP endpoints, MCP protocol handshake, both transports, optional dashboard/API auth, detection forwarding | ~55 |
| `test/syslog.test.js` | Unit — RFC 5424 raw/detection message formatting, severity mapping, detection forwarding config | 5 |
| `test/detections.test.js` | Unit — deterministic detection rules, secret-hunting terms, multi-tool recon | 9 |
| `test/store.test.js` | Unit — LogStore backends, query filters, stats, timeline, detection persistence | ~30 |

## Deployment

### Published container image

Release images are published to GitHub Container Registry:

```text
ghcr.io/gweber/mcp-decoy:1.2.0
ghcr.io/gweber/mcp-decoy:latest
```

Run the release image with SQLite persistence and dashboard/API token auth:

```bash
DASHBOARD_TOKEN=$(openssl rand -hex 32)
docker run --rm \
  -p 127.0.0.1:3110:3110 \
  -e DASHBOARD_TOKEN="$DASHBOARD_TOKEN" \
  -e STORE_BACKEND=sqlite \
  -e SQLITE_PATH=/data/mcp-decoy.db \
  -v mcp-decoy-data:/data \
  ghcr.io/gweber/mcp-decoy:1.2.0
```

Compose image example:

```yaml
services:
  mcp-decoy:
    image: ghcr.io/gweber/mcp-decoy:1.2.0
    ports:
      - "127.0.0.1:3110:3110"
    environment:
      DASHBOARD_TOKEN: "${DASHBOARD_TOKEN:-}"
      STORE_BACKEND: sqlite
      SQLITE_PATH: /data/mcp-decoy.db
    volumes:
      - mcp-decoy-data:/data

volumes:
  mcp-decoy-data:
```

### Docker Compose

The repository includes a production-oriented `Dockerfile` and `compose.yaml`. The Docker image builds the Vue dashboard and serves the static dashboard from the Express server; no separate dashboard container is required. For local-only runs, bind the published port to loopback.

```bash
DASHBOARD_TOKEN=$(openssl rand -hex 32)
DASHBOARD_TOKEN="$DASHBOARD_TOKEN" docker compose up --build -d
curl http://localhost:3110/health
```

Direct Docker example:

```bash
DASHBOARD_TOKEN=$(openssl rand -hex 32)
docker run --rm \
  -p 127.0.0.1:3110:3110 \
  -e DASHBOARD_TOKEN="$DASHBOARD_TOKEN" \
  -e STORE_BACKEND=sqlite \
  -e SQLITE_PATH=/data/mcp-decoy.db \
  -v mcp-decoy-data:/data \
  ghcr.io/gweber/mcp-decoy:1.2.0
```

Useful environment variables can be supplied through the shell or an `.env` file:

```bash
DASHBOARD_TOKEN=$(openssl rand -hex 32) \
SYSLOG_HOST=splunk-indexer.corp.internal \
SYSLOG_PORT=514 \
SYSLOG_PROTOCOL=udp \
SYSLOG_DETECTIONS=true \
docker compose up --build -d
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

If `DASHBOARD_TOKEN` is set, include a bearer token on API calls:

```bash
curl -H "Authorization: Bearer YOUR_DASHBOARD_TOKEN" 'http://localhost:3110/api/stats'
```

Unauthenticated examples below assume `DASHBOARD_TOKEN` is unset.

```bash
# All logs, paginated
curl 'http://localhost:3110/api/logs?limit=50&offset=0'

# Filter by source IP
curl 'http://localhost:3110/api/logs?ip=10.0.1.42'

# Filter by tool
curl 'http://localhost:3110/api/logs?tool=confluence_search'

# Filter by MCP method
curl 'http://localhost:3110/api/logs?mcp_method=tools/call'

# Filter by time range (ISO 8601)
curl 'http://localhost:3110/api/logs?from=2026-04-22T00:00:00Z&to=2026-04-22T23:59:59Z'

# Aggregated statistics
curl 'http://localhost:3110/api/stats'

# Detections, paginated
curl 'http://localhost:3110/api/detections?limit=50&offset=0'

# Filter detections
curl 'http://localhost:3110/api/detections?severity=high&rule_id=MCP_DATASTORE_RECON'

# Timeline (requests per minute, last 60 min)
curl 'http://localhost:3110/api/timeline?minutes=60'
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
