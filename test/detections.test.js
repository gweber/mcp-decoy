import { describe, it, expect } from 'vitest';
import { evaluateLog, SECRET_PATTERNS } from '../detections.js';

function event(fields) {
  return {
    id: 'evt-1',
    time: '2026-05-28T15:00:00.000Z',
    ip: '10.0.0.5',
    method: 'POST',
    path: '/mcp',
    ...fields,
  };
}

describe('detection rules', () => {
  it('does not detect benign initialize events', () => {
    expect(evaluateLog(event({ mcp_method: 'initialize' }), { recentLogs: [] })).toEqual([]);
  });

  it('detects MCP tool enumeration', () => {
    const detections = evaluateLog(event({ mcp_method: 'tools/list' }), { recentLogs: [] });
    expect(detections).toHaveLength(1);
    expect(detections[0].rule_id).toBe('MCP_TOOL_ENUMERATION');
    expect(detections[0].severity).toBe('medium');
    expect(detections[0].confidence).toBe('high');
    expect(detections[0].evidence_event_ids).toEqual(['evt-1']);
  });

  it('detects unknown tool probing', () => {
    const detections = evaluateLog(event({ mcp_method: 'tools/call', tool: 'nonexistent_tool' }), { knownTools: new Set(['jira_search_issues']) });
    expect(detections.map(d => d.rule_id)).toContain('MCP_UNKNOWN_TOOL_PROBE');
  });

  it('detects secret hunting in nested arguments', () => {
    const detections = evaluateLog(event({
      mcp_method: 'tools/call',
      tool: 'github_search_code',
      args: { query: 'filename:.env SECRET_KEY api_token', nested: { path: '/tmp/passwords.txt' } },
    }), { knownTools: new Set(['github_search_code']) });
    expect(detections.map(d => d.rule_id)).toContain('MCP_SECRET_HUNTING_ARGS');
    const det = detections.find(d => d.rule_id === 'MCP_SECRET_HUNTING_ARGS');
    expect(det.details.matched_patterns).toEqual(expect.arrayContaining(['.env', 'secret', 'token', 'password']));
  });

  it('detects datastore reconnaissance', () => {
    const detections = evaluateLog(event({ mcp_method: 'tools/call', tool: 'postgresql_list_databases', args: {} }));
    expect(detections.map(d => d.rule_id)).toContain('MCP_DATASTORE_RECON');
  });

  it('detects source-code reconnaissance', () => {
    const detections = evaluateLog(event({ mcp_method: 'tools/call', tool: 'github_search_repositories', args: { query: 'auth' } }));
    expect(detections.map(d => d.rule_id)).toContain('MCP_SOURCE_CODE_RECON');
  });

  it('detects identity reconnaissance', () => {
    const detections = evaluateLog(event({ mcp_method: 'tools/call', tool: 'slack_get_user_info', args: { user: 'U123' } }));
    expect(detections.map(d => d.rule_id)).toContain('MCP_IDENTITY_RECON');
  });

  it('detects multi-tool reconnaissance across a five-minute source-IP window', () => {
    const recentLogs = [
      event({ id: 'evt-a', time: '2026-05-28T14:58:00.000Z', tool: 'jira_search_issues', mcp_method: 'tools/call' }),
      event({ id: 'evt-b', time: '2026-05-28T14:59:00.000Z', tool: 'slack_channels_list', mcp_method: 'tools/call' }),
    ];
    const detections = evaluateLog(event({ id: 'evt-c', tool: 'github_search_repositories', mcp_method: 'tools/call' }), { recentLogs });
    const det = detections.find(d => d.rule_id === 'MCP_MULTI_TOOL_RECON');
    expect(det).toBeTruthy();
    expect(det.severity).toBe('high');
    expect(det.details.distinct_tools).toBe(3);
    expect(det.evidence_event_ids).toEqual(expect.arrayContaining(['evt-a', 'evt-b', 'evt-c']));
  });

  it('exports secret patterns for documentation parity', () => {
    expect(SECRET_PATTERNS).toContain('token');
    expect(SECRET_PATTERNS).toContain('.env');
  });
});
