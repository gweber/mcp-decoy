'use strict';

const { v4: uuidv4 } = require('uuid');

const SECRET_PATTERNS = [
  '.env',
  'api_key',
  'apikey',
  'credential',
  'credentials',
  'password',
  'secret',
  'token',
];

const DATASTORE_TOOLS = new Set([
  'postgresql_list_databases',
  'postgresql_execute_select_query',
  'postgresql_server_info',
  'cassandra_list_keyspaces',
  'cassandra_execute_select_query',
  'cassandra_server_info',
  'elasticsearch_list_indices',
  'elasticsearch_search_logs',
  'elasticsearch_cluster_info',
]);

const SOURCE_CODE_TOOLS = new Set([
  'github_search_repositories',
  'github_search_code',
  'github_list_commits',
  'github_get_pull_request_comments',
  'gitlab_search_repositories',
  'gitlab_search_code',
  'gitlab_list_commits',
  'gitlab_get_pull_request_comments',
  'bitbucket_search_repositories',
  'bitbucket_search_code',
  'bitbucket_search_artifacts',
  'jenkins_searchbuildlog',
  'jenkins_getjobscm',
]);

const IDENTITY_TOOLS = new Set([
  'slack_get_user_info',
  'slack_channels_list',
  'slack_conversations_search_messages',
]);

const MULTI_TOOL_WINDOW_MS = 5 * 60 * 1000;
const MULTI_TOOL_THRESHOLD = 3;

function safeJsonText(value) {
  try { return JSON.stringify(value ?? {}); }
  catch (_err) { return String(value); }
}

function findSecretPatterns(args) {
  const haystack = safeJsonText(args).toLowerCase();
  return SECRET_PATTERNS.filter(pattern => haystack.includes(pattern));
}

function detection({ rule_id, severity, confidence, event, summary, details = {}, evidence_event_ids }) {
  return {
    id: uuidv4(),
    time: event.time || new Date().toISOString(),
    rule_id,
    severity,
    confidence,
    source_ip: event.ip || null,
    tool: event.tool || null,
    mcp_method: event.mcp_method || null,
    summary,
    details,
    evidence_event_ids: evidence_event_ids || [event.id].filter(Boolean),
  };
}

function evaluateLog(event, context = {}) {
  const detections = [];
  const knownTools = context.knownTools;

  if (event.mcp_method === 'tools/list') {
    detections.push(detection({
      rule_id: 'MCP_TOOL_ENUMERATION',
      severity: 'medium',
      confidence: 'high',
      event,
      summary: 'Client enumerated the MCP tool surface',
      details: {
        recommended_action: 'Correlate source host with EDR, proxy, and identity logs.',
      },
    }));
  }

  if (event.mcp_method === 'tools/call') {
    if (knownTools && event.tool && !knownTools.has(event.tool)) {
      detections.push(detection({
        rule_id: 'MCP_UNKNOWN_TOOL_PROBE',
        severity: 'medium',
        confidence: 'medium',
        event,
        summary: `Client probed unknown MCP tool: ${event.tool}`,
        details: {
          tool: event.tool,
          recommended_action: 'Review client behavior for scripted tool-name guessing or stale/internal tool knowledge.',
        },
      }));
    }

    const matchedPatterns = findSecretPatterns(event.args);
    if (matchedPatterns.length) {
      detections.push(detection({
        rule_id: 'MCP_SECRET_HUNTING_ARGS',
        severity: 'high',
        confidence: matchedPatterns.length >= 2 ? 'high' : 'medium',
        event,
        summary: 'Client used credential/secret-hunting terms in MCP tool arguments',
        details: {
          matched_patterns: matchedPatterns,
          recommended_action: 'Inspect the source host and user session for credential discovery activity.',
        },
      }));
    }

    if (DATASTORE_TOOLS.has(event.tool)) {
      detections.push(detection({
        rule_id: 'MCP_DATASTORE_RECON',
        severity: 'high',
        confidence: 'high',
        event,
        summary: `Client queried datastore decoy tool: ${event.tool}`,
        details: {
          tool: event.tool,
          recommended_action: 'Correlate with database, EDR, and network logs for datastore reconnaissance.',
        },
      }));
    }

    if (SOURCE_CODE_TOOLS.has(event.tool)) {
      detections.push(detection({
        rule_id: 'MCP_SOURCE_CODE_RECON',
        severity: 'medium',
        confidence: 'high',
        event,
        summary: `Client queried source-code/devops decoy tool: ${event.tool}`,
        details: {
          tool: event.tool,
          recommended_action: 'Check source control access logs and recent code search activity for the source principal.',
        },
      }));
    }

    if (IDENTITY_TOOLS.has(event.tool)) {
      detections.push(detection({
        rule_id: 'MCP_IDENTITY_RECON',
        severity: 'medium',
        confidence: 'high',
        event,
        summary: `Client queried identity/collaboration decoy tool: ${event.tool}`,
        details: {
          tool: event.tool,
          recommended_action: 'Correlate source activity with identity provider and collaboration audit logs.',
        },
      }));
    }

    const now = new Date(event.time || Date.now()).getTime();
    const recent = (context.recentLogs || []).filter(log => {
      if (!log || log.id === event.id || log.ip !== event.ip || log.mcp_method !== 'tools/call' || !log.tool) return false;
      const t = new Date(log.time || 0).getTime();
      return Number.isFinite(t) && now - t <= MULTI_TOOL_WINDOW_MS && now >= t;
    });
    const events = [...recent, event].filter(log => log.tool);
    const distinctTools = [...new Set(events.map(log => log.tool))];
    if (distinctTools.length >= MULTI_TOOL_THRESHOLD) {
      detections.push(detection({
        rule_id: 'MCP_MULTI_TOOL_RECON',
        severity: 'high',
        confidence: 'high',
        event,
        summary: 'Client performed broad MCP tool reconnaissance',
        details: {
          window_seconds: MULTI_TOOL_WINDOW_MS / 1000,
          threshold: MULTI_TOOL_THRESHOLD,
          distinct_tools: distinctTools.length,
          tools: distinctTools,
          recommended_action: 'Treat as suspicious MCP reconnaissance and correlate source host with EDR, proxy, and identity logs.',
        },
        evidence_event_ids: events.map(log => log.id).filter(Boolean),
      }));
    }
  }

  return detections;
}

module.exports = {
  evaluateLog,
  SECRET_PATTERNS,
  DATASTORE_TOOLS,
  SOURCE_CODE_TOOLS,
  IDENTITY_TOOLS,
  MULTI_TOOL_WINDOW_MS,
  MULTI_TOOL_THRESHOLD,
};
