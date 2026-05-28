import { describe, it, expect } from 'vitest';
const { TOOLS, callTool } = require('../tools.js');

// ── Schema validation helpers ─────────────────────────────────────────────────

function isNonEmptyArray(val) {
  return Array.isArray(val) && val.length > 0;
}
function isObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

describe('TOOLS definitions', () => {
  it('exports 38 tools', () => {
    expect(TOOLS).toHaveLength(38);
  });

  it('every tool has a unique name', () => {
    const names = TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every tool has a non-empty description', () => {
    for (const t of TOOLS) {
      expect(t.description, `${t.name} missing description`).toBeTruthy();
    }
  });

  it('every tool has a valid inputSchema with type object', () => {
    for (const t of TOOLS) {
      expect(t.inputSchema.type, `${t.name} inputSchema.type`).toBe('object');
      expect(t.inputSchema).toHaveProperty('properties');
    }
  });

  it('required fields exist in properties', () => {
    for (const t of TOOLS) {
      for (const req of t.inputSchema.required || []) {
        expect(t.inputSchema.properties, `${t.name}: required field "${req}" not in properties`).toHaveProperty(req);
      }
    }
  });
});

// ── Unknown tool ──────────────────────────────────────────────────────────────

describe('callTool - unknown tool', () => {
  it('throws an error for an unrecognised tool name', () => {
    expect(() => callTool('no_such_tool', {})).toThrow('Unknown tool: no_such_tool');
  });
});

// ── Bitbucket ─────────────────────────────────────────────────────────────────

describe('callTool - Bitbucket', () => {
  it('bitbucket_search_repositories returns repos', () => {
    const r = callTool('bitbucket_search_repositories', { query: 'auth' });
    expect(r.total_count).toBeGreaterThan(0);
    expect(isNonEmptyArray(r.repositories)).toBe(true);
    expect(r.repositories[0]).toHaveProperty('full_name');
    expect(r.repositories[0]).toHaveProperty('workspace');
  });

  it('bitbucket_search_code returns snippets with file paths', () => {
    const r = callTool('bitbucket_search_code', { query: 'password' });
    expect(r.total_count).toBeGreaterThan(0);
    expect(isNonEmptyArray(r.results)).toBe(true);
    expect(r.results[0]).toHaveProperty('file');
    expect(r.results[0]).toHaveProperty('repository');
  });

  it('bitbucket_search_artifacts returns artifact metadata', () => {
    const r = callTool('bitbucket_search_artifacts', { query: 'build', workspace: 'corp' });
    expect(isNonEmptyArray(r.artifacts)).toBe(true);
    expect(r.artifacts[0]).toHaveProperty('name');
    expect(r.artifacts[0]).toHaveProperty('pipeline');
  });
});

// ── Cassandra ─────────────────────────────────────────────────────────────────

describe('callTool - Cassandra', () => {
  it('cassandra_list_keyspaces returns keyspace array', () => {
    const r = callTool('cassandra_list_keyspaces', {});
    expect(isNonEmptyArray(r.keyspaces)).toBe(true);
    expect(r.keyspaces[0]).toHaveProperty('name');
    expect(r.keyspaces[0]).toHaveProperty('replication');
  });

  it('cassandra_execute_select_query returns rows and metadata', () => {
    const r = callTool('cassandra_execute_select_query', { query: 'SELECT * FROM user_sessions' });
    expect(isNonEmptyArray(r.rows)).toBe(true);
    expect(r.rows[0]).toHaveProperty('session_id');
    expect(r.metadata.columns).toBeInstanceOf(Array);
  });

  it('cassandra_server_info returns cluster details', () => {
    const r = callTool('cassandra_server_info', {});
    expect(r).toHaveProperty('cluster_name');
    expect(r).toHaveProperty('release_version');
    expect(isNonEmptyArray(r.hosts)).toBe(true);
  });
});

// ── Elasticsearch ─────────────────────────────────────────────────────────────

describe('callTool - Elasticsearch', () => {
  it('elasticsearch_list_indices returns index list with health info', () => {
    const r = callTool('elasticsearch_list_indices', {});
    expect(isNonEmptyArray(r.indices)).toBe(true);
    expect(r.indices[0]).toHaveProperty('name');
    expect(r.indices[0]).toHaveProperty('health');
    expect(r.indices[0]).toHaveProperty('docs_count');
  });

  it('elasticsearch_search_logs returns hits with source fields', () => {
    const r = callTool('elasticsearch_search_logs', { query: 'authentication' });
    expect(r).toHaveProperty('total');
    expect(isNonEmptyArray(r.hits)).toBe(true);
    expect(r.hits[0]._source).toHaveProperty('@timestamp');
    expect(r.hits[0]._source).toHaveProperty('message');
  });

  it('elasticsearch_search_logs includes query term in messages', () => {
    const r = callTool('elasticsearch_search_logs', { query: 'UNIQUETERM' });
    expect(r.hits[0]._source.message).toContain('UNIQUETERM');
  });

  it('elasticsearch_cluster_info returns cluster health and version', () => {
    const r = callTool('elasticsearch_cluster_info', {});
    expect(r).toHaveProperty('cluster_name');
    expect(r).toHaveProperty('status');
    expect(r.version).toHaveProperty('number');
  });
});

// ── PostgreSQL ────────────────────────────────────────────────────────────────

describe('callTool - PostgreSQL', () => {
  it('postgresql_list_databases returns database list with sizes', () => {
    const r = callTool('postgresql_list_databases', {});
    expect(isNonEmptyArray(r.databases)).toBe(true);
    expect(r.databases[0]).toHaveProperty('name');
    expect(r.databases[0]).toHaveProperty('owner');
    expect(r.databases[0]).toHaveProperty('size');
  });

  it('postgresql_execute_select_query returns rows and column metadata', () => {
    const r = callTool('postgresql_execute_select_query', { query: 'SELECT * FROM users' });
    expect(isNonEmptyArray(r.rows)).toBe(true);
    expect(r.rowCount).toBe(r.rows.length);
    expect(isNonEmptyArray(r.columns)).toBe(true);
    expect(r.columns[0]).toHaveProperty('name');
    expect(r.columns[0]).toHaveProperty('type');
  });

  it('postgresql_server_info returns server version and settings', () => {
    const r = callTool('postgresql_server_info', {});
    expect(r.server_version).toMatch(/PostgreSQL/);
    expect(r).toHaveProperty('current_database');
    expect(isObject(r.settings)).toBe(true);
  });
});

// ── Confluence ────────────────────────────────────────────────────────────────

describe('callTool - Confluence', () => {
  it('confluence_get_page returns page with body and metadata', () => {
    const r = callTool('confluence_get_page', { title: 'Runbook' });
    expect(r).toHaveProperty('id');
    expect(r.title).toBe('Runbook');
    expect(r.body.storage.value).toContain('Runbook');
    expect(r).toHaveProperty('_links');
  });

  it('confluence_search returns result array with excerpts', () => {
    const r = callTool('confluence_search', { cql: 'text~"credentials"' });
    expect(isNonEmptyArray(r.results)).toBe(true);
    expect(r).toHaveProperty('totalSize');
    expect(r.results[0]).toHaveProperty('title');
    expect(r.results[0]).toHaveProperty('excerpt');
  });
});

// ── GitHub ────────────────────────────────────────────────────────────────────

describe('callTool - GitHub', () => {
  it('github_search_repositories returns repo objects', () => {
    const r = callTool('github_search_repositories', { query: 'auth' });
    expect(r).toHaveProperty('total_count');
    expect(isNonEmptyArray(r.items)).toBe(true);
    expect(r.items[0]).toHaveProperty('full_name');
    expect(r.items[0]).toHaveProperty('html_url');
  });

  it('github_search_code returns code results with file path', () => {
    const r = callTool('github_search_code', { query: 'SECRET_KEY' });
    expect(isNonEmptyArray(r.items)).toBe(true);
    expect(r.items[0]).toHaveProperty('path');
    expect(r.items[0]).toHaveProperty('repository');
    expect(r.items[0].text_matches[0].fragment).toContain('SECRET_KEY');
  });

  it('github_list_commits returns commit objects with SHA', () => {
    const r = callTool('github_list_commits', { owner: 'corp-org', repo: 'backend-api' });
    expect(isNonEmptyArray(r)).toBe(true);
    expect(r[0]).toHaveProperty('sha');
    expect(r[0].sha).toHaveLength(40);
    expect(r[0]).toHaveProperty('message');
  });

  it('github_get_pull_request_comments returns comment objects', () => {
    const r = callTool('github_get_pull_request_comments', { owner: 'corp-org', repo: 'backend-api', pull_number: 42 });
    expect(isNonEmptyArray(r)).toBe(true);
    expect(r[0]).toHaveProperty('body');
    expect(r[0]).toHaveProperty('user');
    expect(r[0]).toHaveProperty('path');
  });
});

// ── GitLab ────────────────────────────────────────────────────────────────────

describe('callTool - GitLab', () => {
  it('gitlab_search_repositories returns project objects', () => {
    const r = callTool('gitlab_search_repositories', { query: 'infra' });
    expect(isNonEmptyArray(r.items)).toBe(true);
    expect(r.items[0]).toHaveProperty('web_url');
    expect(r.items[0].visibility).toBe('private');
  });

  it('gitlab_search_code returns code results', () => {
    const r = callTool('gitlab_search_code', { query: 'database_url' });
    expect(isNonEmptyArray(r.items)).toBe(true);
    expect(r.items[0]).toHaveProperty('path');
    expect(r.items[0]).toHaveProperty('project');
  });

  it('gitlab_list_commits returns commits with id field', () => {
    const r = callTool('gitlab_list_commits', { project_id: 'corp-group/backend-api' });
    expect(isNonEmptyArray(r)).toBe(true);
    expect(r[0]).toHaveProperty('id');
    expect(r[0]).toHaveProperty('message');
  });

  it('gitlab_get_pull_request_comments returns notes with author', () => {
    const r = callTool('gitlab_get_pull_request_comments', { project_id: 'corp-group/backend-api', merge_request_iid: 7 });
    expect(isNonEmptyArray(r)).toBe(true);
    expect(r[0]).toHaveProperty('body');
    expect(r[0].author).toHaveProperty('username');
  });
});

// ── Google ────────────────────────────────────────────────────────────────────

describe('callTool - Google', () => {
  it('google_search_drive_files returns file list with mimeType', () => {
    const r = callTool('google_search_drive_files', { query: 'credentials' });
    expect(isNonEmptyArray(r.files)).toBe(true);
    expect(r.files[0]).toHaveProperty('mimeType');
    expect(r.files[0]).toHaveProperty('name');
    expect(r.files[0].name).toContain('credentials');
  });

  it('google_sheets_read returns spreadsheet with values', () => {
    const r = callTool('google_sheets_read', { file_name: 'User Access List' });
    expect(r.title).toBe('User Access List');
    expect(isNonEmptyArray(r.values)).toBe(true);
    expect(r.values[0]).toContain('Email');
  });

  it('google_docs_read returns document with body content', () => {
    const r = callTool('google_docs_read', { file_name: 'Security Policy' });
    expect(r.title).toBe('Security Policy');
    expect(r.body.content).toContain('Security Policy');
  });

  it('google_chat_search_message returns messages with sender', () => {
    const r = callTool('google_chat_search_message', { query: 'deployment' });
    expect(isNonEmptyArray(r.messages)).toBe(true);
    expect(r.messages[0]).toHaveProperty('sender');
    expect(r.messages[0].text).toContain('deployment');
  });

  it('google_slides_get_presentation returns slides', () => {
    const r = callTool('google_slides_get_presentation', { file_name: 'Q1 Review' });
    expect(r.title).toBe('Q1 Review');
    expect(isNonEmptyArray(r.slides)).toBe(true);
  });
});

// ── Jenkins ───────────────────────────────────────────────────────────────────

describe('callTool - Jenkins', () => {
  it('jenkins_searchbuildlog returns log matches with line numbers', () => {
    const r = callTool('jenkins_searchbuildlog', { job_name: 'deploy-prod', pattern: 'ERROR' });
    expect(r.job).toBe('deploy-prod');
    expect(isNonEmptyArray(r.matches)).toBe(true);
    expect(r.matches[0]).toHaveProperty('line_number');
    expect(r.matches[0]).toHaveProperty('content');
    expect(r.matches[0].content).toContain('ERROR');
  });

  it('jenkins_getjobscm returns SCM config with repo URL', () => {
    const r = callTool('jenkins_getjobscm', { job_name: 'deploy-prod' });
    expect(r.job).toBe('deploy-prod');
    expect(r.scm.type).toBe('GitSCM');
    expect(isNonEmptyArray(r.scm.repositories)).toBe(true);
    expect(r.scm.repositories[0].url).toMatch(/git@github\.com/);
    expect(r.scm.repositories[0]).toHaveProperty('credentialsId');
  });
});

// ── Jira ──────────────────────────────────────────────────────────────────────

describe('callTool - Jira', () => {
  it('jira_search_issues returns issue list with pagination metadata', () => {
    const r = callTool('jira_search_issues', { jql: 'project = SEC' });
    expect(r).toHaveProperty('total');
    expect(r).toHaveProperty('startAt');
    expect(r).toHaveProperty('maxResults');
    expect(isNonEmptyArray(r.issues)).toBe(true);
    expect(r.issues[0]).toHaveProperty('key');
    expect(r.issues[0].fields).toHaveProperty('summary');
    expect(r.issues[0].fields).toHaveProperty('status');
  });

  it('jira_get_issue returns issue with transitions', () => {
    const r = callTool('jira_get_issue', { issue_key: 'SEC-123' });
    expect(r.key).toBe('SEC-123');
    expect(r).toHaveProperty('id');
    expect(isNonEmptyArray(r.transitions)).toBe(true);
  });
});

// ── Slack ─────────────────────────────────────────────────────────────────────

describe('callTool - Slack', () => {
  it('slack_get_user_info returns user profile', () => {
    const r = callTool('slack_get_user_info', { user: 'U0A1B2C3D' });
    expect(r.ok).toBe(true);
    expect(r.user.id).toBe('U0A1B2C3D');
    expect(r.user).toHaveProperty('real_name');
    expect(r.user.profile).toHaveProperty('email');
    expect(r.user.profile).toHaveProperty('image_192');
  });

  it('slack_get_user_info throws user_not_found for unknown id', () => {
    expect(() => callTool('slack_get_user_info', { user: 'UNKNOWN' })).toThrow('user_not_found');
  });

  it('slack_conversations_search_messages returns message matches', () => {
    const r = callTool('slack_conversations_search_messages', { query: 'deploy' });
    expect(r.ok).toBe(true);
    expect(isNonEmptyArray(r.messages.matches)).toBe(true);
    expect(r.messages.matches[0]).toHaveProperty('channel');
    expect(r.messages.matches[0].text).toContain('deploy');
  });

  it('slack_channels_list returns all channels with membership count', () => {
    const r = callTool('slack_channels_list', {});
    expect(r.ok).toBe(true);
    expect(isNonEmptyArray(r.channels)).toBe(true);
    expect(r.channels[0]).toHaveProperty('id');
    expect(r.channels[0]).toHaveProperty('name');
    expect(r.channels[0]).toHaveProperty('num_members');
    expect(r.channels.find(c => c.name === 'security-alerts')?.is_private).toBe(true);
  });
});

// ── Salesforce ────────────────────────────────────────────────────────────────

describe('callTool - Salesforce', () => {
  it('salesforce_query_soql returns record list', () => {
    const r = callTool('salesforce_query_soql', { query: 'SELECT Id, Name FROM Account' });
    expect(r.done).toBe(true);
    expect(r.totalSize).toBe(r.records.length);
    expect(r.records[0]).toHaveProperty('Name');
    expect(r.records[0].attributes.type).toBe('Account');
  });

  it('salesforce_list_reports returns report metadata', () => {
    const r = callTool('salesforce_list_reports', {});
    expect(isNonEmptyArray(r.reports)).toBe(true);
    expect(r.reports[0]).toHaveProperty('name');
    expect(r.reports[0]).toHaveProperty('folder');
    expect(r.reports[0]).toHaveProperty('lastRunDate');
  });

  it('salesforce_get_report returns report data and columns', () => {
    const r = callTool('salesforce_get_report', { report_name: 'Pipeline Summary' });
    expect(r.reportMetadata.name).toBe('Pipeline Summary');
    expect(isNonEmptyArray(r.columns)).toBe(true);
    expect(r.factMap['T!T'].rows).toBeInstanceOf(Array);
  });

  it('salesforce_get_account returns account with contacts and opportunities', () => {
    const r = callTool('salesforce_get_account', { company_name: 'Acme Corporation' });
    expect(r.Name).toBe('Acme Corporation');
    expect(isNonEmptyArray(r.Contacts)).toBe(true);
    expect(r.Contacts[0]).toHaveProperty('Email');
    expect(isNonEmptyArray(r.Opportunities)).toBe(true);
    expect(isNonEmptyArray(r.Cases)).toBe(true);
    expect(isNonEmptyArray(r.AccountTeamMembers)).toBe(true);
  });
});
