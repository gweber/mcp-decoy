import { describe, it, expect } from 'vitest';
const { SyslogForwarder, severityForDetection } = require('../syslog.js');

const detection = {
  id: 'det-1',
  time: '2026-05-28T17:45:00.000Z',
  rule_id: 'MCP_DATASTORE_RECON',
  severity: 'high',
  confidence: 'high',
  source_ip: '10.0.1.42',
  tool: 'postgresql_list_databases',
  mcp_method: 'tools/call',
  summary: 'Client queried datastore decoy tool: postgresql_list_databases',
  evidence_event_ids: ['evt-1', 'evt-2'],
};

describe('syslog detection forwarding', () => {
  it('maps detection severity to syslog severity', () => {
    expect(severityForDetection({ severity: 'critical' })).toBe(2);
    expect(severityForDetection({ severity: 'high' })).toBe(3);
    expect(severityForDetection({ severity: 'medium' })).toBe(4);
    expect(severityForDetection({ severity: 'low' })).toBe(5);
    expect(severityForDetection({ severity: 'unknown' })).toBe(5);
  });

  it('builds RFC5424 detection messages with detection structured data', () => {
    const forwarder = new SyslogForwarder({
      host: '127.0.0.1',
      facility: 16,
      appName: 'mcp-decoy',
      procId: '1234',
    });

    const msg = forwarder.buildDetectionMessage(detection);

    expect(msg).toMatch(/^<131>1 /); // local0 facility + high/err severity
    expect(msg).toContain(' mcp-decoy 1234 detection ');
    expect(msg).toContain('[mcp-detection');
    expect(msg).toContain('detection_id="det-1"');
    expect(msg).toContain('rule_id="MCP_DATASTORE_RECON"');
    expect(msg).toContain('severity="high"');
    expect(msg).toContain('confidence="high"');
    expect(msg).toContain('source_ip="10.0.1.42"');
    expect(msg).toContain('tool="postgresql_list_databases"');
    expect(msg).toContain('evidence_count="2"');
    expect(msg).toContain('MCP detection: MCP_DATASTORE_RECON high from 10.0.1.42');
  });

  it('enables detection forwarding by default when syslog is enabled', () => {
    const forwarder = new SyslogForwarder({ host: '127.0.0.1' });
    expect(forwarder.enabled).toBe(true);
    expect(forwarder.detectionsEnabled).toBe(true);
  });

  it('can disable detection forwarding independently', () => {
    const sent = [];
    const forwarder = new SyslogForwarder({ host: '127.0.0.1', detectionsEnabled: false });
    forwarder._send = msg => sent.push(msg);

    forwarder.sendDetection(detection);

    expect(sent).toHaveLength(0);
  });

  it('still forwards raw logs when detection forwarding is disabled', () => {
    const sent = [];
    const forwarder = new SyslogForwarder({ host: '127.0.0.1', detectionsEnabled: false });
    forwarder._send = msg => sent.push(msg);

    forwarder.send({ id: 'evt-1', ip: '10.0.1.42', mcp_method: 'tools/list' });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('tools/list');
  });
});
