'use strict';

/**
 * Syslog forwarder — RFC 5424 structured-data format.
 *
 * Config via environment variables:
 *   SYSLOG_HOST      Destination host (default: disabled)
 *   SYSLOG_PORT      Destination port (default: 514)
 *   SYSLOG_PROTOCOL  udp | tcp        (default: udp)
 *   SYSLOG_FACILITY  0-23             (default: 16 = local0)
 *   SYSLOG_SEVERITY  0-7              (default: 5 = notice)
 *   SYSLOG_APP_NAME  APP-NAME field   (default: mcp-decoy)
 */

const dgram  = require('dgram');
const net    = require('net');
const os     = require('os');

const HOSTNAME = os.hostname();
const NILVALUE = '-';

// RFC 5424 severity levels
const SEV = { emerg: 0, alert: 1, crit: 2, err: 3, warn: 4, notice: 5, info: 6, debug: 7 };

function parseSeverity(s) {
  if (typeof s === 'number') return Math.max(0, Math.min(7, s));
  return SEV[String(s).toLowerCase()] ?? 5;
}

function buildMessage({ facility, severity, appName, procId, msgId, structured, message }) {
  const pri      = facility * 8 + severity;
  const ts       = new Date().toISOString();
  const sdString = structured
    ? `[${Object.entries(structured).map(([k, v]) => `${k}="${String(v).replace(/["\\]/g, '\\$&')}"`).join(' ')}]`
    : NILVALUE;

  // <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
  return `<${pri}>1 ${ts} ${HOSTNAME} ${appName} ${procId} ${msgId} ${sdString} ${message}`;
}

class SyslogForwarder {
  constructor() {
    this.enabled   = Boolean(process.env.SYSLOG_HOST);
    this.host      = process.env.SYSLOG_HOST || '127.0.0.1';
    this.port      = parseInt(process.env.SYSLOG_PORT || '514', 10);
    this.protocol  = (process.env.SYSLOG_PROTOCOL || 'udp').toLowerCase();
    this.facility  = parseInt(process.env.SYSLOG_FACILITY || '16', 10);
    this.severity  = parseSeverity(process.env.SYSLOG_SEVERITY ?? 5);
    this.appName   = process.env.SYSLOG_APP_NAME || 'mcp-decoy';
    this.procId    = String(process.pid);

    // TCP keeps a persistent connection
    this._tcpSocket = null;
    this._tcpBuffer = [];
    this._tcpConnecting = false;
  }

  send(logRecord) {
    if (!this.enabled) return;

    const msgId = logRecord.mcp_method || logRecord.path || NILVALUE;
    const structured = {
      id:         logRecord.id,
      ip:         logRecord.ip         || NILVALUE,
      mcp_method: logRecord.mcp_method || NILVALUE,
      tool:       logRecord.tool       || NILVALUE,
    };

    const text = logRecord.tool
      ? `MCP tool call: ${logRecord.tool} from ${logRecord.ip}`
      : `MCP access: ${logRecord.mcp_method || logRecord.path} from ${logRecord.ip}`;

    const msg = buildMessage({
      facility:   this.facility,
      severity:   this.severity,
      appName:    this.appName,
      procId:     this.procId,
      msgId,
      structured,
      message:    text,
    });

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
    return buildMessage({
      facility:   this.facility,
      severity:   this.severity,
      appName:    this.appName,
      procId:     this.procId,
      msgId:      logRecord.mcp_method || logRecord.path || NILVALUE,
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

  // Allow tests to override enabled state
  _setEnabled(val) { this.enabled = val; }
}

module.exports = new SyslogForwarder();
