# Changelog

All notable changes to MCP Decoy will be documented in this file.

## 1.2.0 - 2026-05-28

### Added

- Deterministic MCP detection rules for tool enumeration, datastore reconnaissance, source-code reconnaissance, identity reconnaissance, unknown tool probes, secret-hunting arguments, and multi-tool reconnaissance.
- SQLite-backed detection persistence in a dedicated `detections` table.
- `GET /api/detections` with pagination and filters for severity, rule ID, source IP, and time range.
- Detection counts in `GET /api/stats`.
- Dashboard recent detections panel with severity, rule ID, source IP, confidence, and summary.
- RFC 5424 syslog forwarding for generated detections.
- `SYSLOG_DETECTIONS` toggle to suppress detection syslog forwarding while keeping raw access logs.
- Optional `DASHBOARD_TOKEN` protection for dashboard/API access.
- GitHub Container Registry publishing workflow for `ghcr.io/gweber/mcp-decoy`.

### Changed

- Docker Compose binds to `127.0.0.1:3110` by default for safer local deployments.
- README documents safe exposure, token-auth usage, SIEM/syslog detection fields, and GHCR deployment examples.

### Security

- Dashboard/API access can now be protected without authenticating MCP decoy endpoints. `/mcp`, `/sse`, `/messages`, and `/.well-known/mcp` intentionally remain open so the decoy sensor can receive client activity.

### Upgrade notes

- No breaking configuration changes.
- If `SYSLOG_HOST` is configured, generated detections are now forwarded by default. Set `SYSLOG_DETECTIONS=false` to keep forwarding raw access logs only.
