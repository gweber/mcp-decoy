'use strict';

/**
 * Syslog forwarder — RFC 5424 structured-data format.
 *
 * Config via environment variables:
 *   SYSLOG_HOST        Destination host (default: disabled)
 *   SYSLOG_PORT        Destination port (default: 514)
 *   SYSLOG_PROTOCOL    udp | tcp        (default: udp)
 *   SYSLOG_FACILITY    0-23             (default: 16 = local0)
 *   SYSLOG_SEVERITY    0-7              (default: 5 = notice)
 *   SYSLOG_DETECTIONS  true | false     (default: true when syslog enabled)
 *   SYSLOG_APP_NAME    APP-NAME field   (default: mcp-decoy)
 */

const dgram  = require('dgram');
const net    = require('net');
const os     = require('os');

const HOSTNAME = os.hostname();
const NILVALUE = '-';

// RFC 5424 severity levels
const SEV = { emerg: 0, alert: 1, crit: 2, err: 3, warn: 4, notice: 5, info: 6, debug: 7 };
const DETECTION_SEVERITY = { critical: 2, high: 3, medium: 4, low: 5 };

function parseSeverity(s) {
  if (typeof s === 'number') return Math.max(0, Math.min(7, s));
  return SEV[String(s).toLowerCase()] ?? 5;
}

function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function severityForDetection(detection) {
  return DETECTION_SEVERITY[String(detection?.severity || '').toLowerCase()] ?? 5;
}

function escapeStructuredValue(value) {
  return String(value ?? NILVALUE).replace(/["\\]/g, '\\$&');
}

function buildStructuredData(structured) {
  if (!structured) return NILVALUE;
  const sdId = structured.__sdId;
  const entries = Object.entries(structured).filter(([k]) => k !== '__sdId');
  if (sdId) {
    return `[${sdId} ${entries.map(([k, v]) => `${k}="${escapeStructuredValue(v)}"`).join(' ')}]`;
  }
  return `[${entries.map(([k, v]) => `${k}="${escapeStructuredValue(v)}"`).join(' ')}]`;
}

function buildMessage({ facility, severity, appName, procId, msgId, structured, message }) {
  const pri      = facility * 8 + severity;
  const ts       = new Date().toISOString();
  const sdString = buildStructuredData(structured);

  // <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
  return `<${pri}>1 ${ts} ${HOSTNAME} ${appName} ${procId} ${msgId} ${sdString} ${message}`;
}

class SyslogForwarder {
  constructor(options = {}) {
    const env = options.env || process.env;
    this.enabled   = options.enabled ?? Boolean(options.host ?? env.SYSLOG_HOST);
    this.host      = options.host || env.SYSLOG_HOST || '127.0.0.1';
    this.port      = parseInt(options.port ?? env.SYSLOG_PORT ?? '514', 10);
    this.protocol  = String(options.protocol || env.SYSLOG_PROTOCOL || 'udp').toLowerCase();
    this.facility  = parseInt(options.facility ?? env.SYSLOG_FACILITY ?? '16', 10);
    this.severity  = parseSeverity(options.severity ?? env.SYSLOG_SEVERITY ?? 5);
    this.detectionsEnabled = options.detectionsEnabled ?? parseBool(env.SYSLOG_DETECTIONS, true);
    this.appName   = options.appName || env.SYSLOG_APP_NAME || 'mcp-decoy';
    this.procId    = String(options.procId || process.pid);

    // TCP keeps a persistent connection
    this._tcpSocket = null;
    this._tcpBuffer = [];
    this._tcpConnecting = false;
  }

  send(logRecord) {
    if (!this.enabled) return;
    this._send(this.buildMessage(logRecord));
  }

  sendDetection(detection) {
    if (!this.enabled || !this.detectionsEnabled) return;
    this._send(this.buildDetectionMessage(detection));
  }

  _send(msg) {
    if (this.protocol === 'tcp') {
      this._sendTcp(msg);
    } else {
      this._sendUdp(msg);
    }
  }

  _sendUdp(msg) {
    const buf    = Buffer.from(msg + '\n', 'utf8');
    const client = dgram.createSocket('udp4');
    client.send(buf, 0, buf.length, this.port, this.host, (err) => {
      client.close();
      if (err) console.error('[syslog] UDP send error:', err.message);
    });
  }

  _sendTcp(msg) {
    const line = msg + '\n';
    if (this._tcpSocket && !this._tcpSocket.destroyed) {
      this._tcpSocket.write(line);
      return;
    }
    this._tcpBuffer.push(line);
    if (this._tcpConnecting) return;
    this._tcpConnecting = true;

    const socket = net.createConnection({ host: this.host, port: this.port }, () => {
      this._tcpConnecting = false;
      this._tcpSocket = socket;
      for (const buffered of this._tcpBuffer) socket.write(buffered);
      this._tcpBuffer = [];
    });
    socket.on('error', (err) => {
      console.error('[syslog] TCP error:', err.message);
      this._tcpConnecting = false;
      this._tcpSocket = null;
    });
    socket.on('close', () => {
      this._tcpSocket = null;
    });
  }

  // Build RFC 5424 message string without sending — used in tests
  buildMessage(logRecord) {
    const msgId = logRecord.mcp_method || logRecord.path || NILVALUE;
    return buildMessage({
      facility:   this.facility,
      severity:   this.severity,
      appName:    this.appName,
      procId:     this.procId,
      msgId,
      structured: {
        id:         logRecord.id         || NILVALUE,
        ip:         logRecord.ip         || NILVALUE,
        mcp_method: logRecord.mcp_method || NILVALUE,
        tool:       logRecord.tool       || NILVALUE,
      },
      message: logRecord.tool
        ? `MCP tool call: ${logRecord.tool} from ${logRecord.ip}`
        : `MCP access: ${logRecord.mcp_method || logRecord.path} from ${logRecord.ip}`,
    });
  }

  buildDetectionMessage(detection) {
    const evidenceCount = Array.isArray(detection.evidence_event_ids) ? detection.evidence_event_ids.length : 0;
    const sourceIp = detection.source_ip || NILVALUE;
    return buildMessage({
      facility: this.facility,
      severity: severityForDetection(detection),
      appName: this.appName,
      procId: this.procId,
      msgId: 'detection',
      structured: {
        __sdId: 'mcp-detection',
        detection_id: detection.id || NILVALUE,
        rule_id: detection.rule_id || NILVALUE,
        severity: detection.severity || NILVALUE,
        confidence: detection.confidence || NILVALUE,
        source_ip: sourceIp,
        tool: detection.tool || NILVALUE,
        mcp_method: detection.mcp_method || NILVALUE,
        evidence_count: evidenceCount,
      },
      message: `MCP detection: ${detection.rule_id || NILVALUE} ${detection.severity || NILVALUE} from ${sourceIp}`,
    });
  }

  // Allow tests to override enabled state
  _setEnabled(val) { this.enabled = val; }
}

const forwarder = new SyslogForwarder();
module.exports = forwarder;
module.exports.SyslogForwarder = SyslogForwarder;
module.exports.severityForDetection = severityForDetection;
module.exports.parseBool = parseBool;
