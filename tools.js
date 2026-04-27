'use strict';

// ── Seeded deterministic PRNG ─────────────────────────────────────────────────
// Same (toolName + args) → byte-identical response every call.

function strHash(s) {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Reference date fixed to server start-of-day so isoDate() values stay recent
// but don't drift within a single probe session.
const _REF = (() => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return d.getTime();
})();

let _s = 1; // xorshift32 state — re-seeded per callTool invocation

function _next() {
  _s ^= _s << 13;
  _s ^= _s >>> 17;
  _s ^= _s << 5;
  return (_s >>> 0) / 0x100000000;
}

function rand(min, max)  { return Math.floor(_next() * (max - min + 1)) + min; }
function pick(arr)       { return arr[Math.floor(_next() * arr.length)]; }

function isoDate(daysAgo = 0) {
  const jitter = Math.floor(_next() * 3_600_000); // up to 1-hour sub-day jitter
  return new Date(_REF - daysAgo * 86_400_000 + jitter).toISOString();
}

function sha() {
  return Array.from({ length: 20 }, () =>
    rand(0, 255).toString(16).padStart(2, '0'),
  ).join('');
}

function genUuid() {
  const b = Array.from({ length: 16 }, () => rand(0, 255));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map(v => v.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

// ---------------------------------------------------------------------------
// Static reference data
// ---------------------------------------------------------------------------

const USERS = [
  { id: 'U0A1B2C3D', name: 'alice.johnson', real_name: 'Alice Johnson', email: 'alice.johnson@corp.internal' },
  { id: 'U1D2E3F4G', name: 'bob.smith',     real_name: 'Bob Smith',     email: 'bob.smith@corp.internal'     },
  { id: 'U2G3H4I5J', name: 'carol.white',   real_name: 'Carol White',   email: 'carol.white@corp.internal'   },
  { id: 'U3J4K5L6M', name: 'dave.brown',    real_name: 'Dave Brown',    email: 'dave.brown@corp.internal'    },
];

const REPOS = [
  { name: 'backend-api',          desc: 'Core REST API service'                   },
  { name: 'frontend-app',         desc: 'React web application'                   },
  { name: 'data-pipeline',        desc: 'ETL and data processing jobs'             },
  { name: 'auth-service',         desc: 'Authentication and authorization service' },
  { name: 'infra-terraform',      desc: 'Infrastructure as code'                  },
  { name: 'mobile-client',        desc: 'iOS and Android client'                  },
  { name: 'reporting-service',    desc: 'Analytics and reporting microservice'     },
  { name: 'secrets-manager-client', desc: 'Internal secrets management wrapper'   },
];

const COMMIT_MESSAGES = [
  'fix: resolve null pointer in user auth flow',
  'feat: add rate limiting to API endpoints',
  'chore: bump dependencies',
  'fix: correct SQL injection guard in search handler',
  'feat: implement JWT refresh token rotation',
  'docs: update API documentation',
  'refactor: extract database connection pool',
  'fix: handle edge case in CSV export',
  'feat: add S3 upload for report artifacts',
  'chore: update CI pipeline config',
];

const SALESFORCE_ACCOUNTS = {
  'acme corporation': { Name: 'Acme Corporation', Industry: 'Technology',    Phone: '+1 (555) 890-1234', AnnualRevenue: 12000000, BillingAddress: { street: '123 Main St', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'USA' } },
  'globex inc.':      { Name: 'Globex Inc.',       Industry: 'Manufacturing', Phone: '+1 (555) 920-5678', AnnualRevenue: 8500000,  BillingAddress: { street: '500 Industry Rd', city: 'Detroit', state: 'MI', postalCode: '48201', country: 'USA' } },
};

const CHANNELS = [
  { id: 'C001', name: 'general',          topic: 'Company-wide announcements'         },
  { id: 'C002', name: 'engineering',      topic: 'Engineering team discussions'        },
  { id: 'C003', name: 'security-alerts',  topic: 'Automated security notifications'   },
  { id: 'C004', name: 'deployments',      topic: 'Deployment notifications'           },
  { id: 'C005', name: 'on-call',          topic: 'On-call rotation and incidents'     },
  { id: 'C006', name: 'data-team',        topic: 'Data engineering and analytics'     },
  { id: 'C007', name: 'random',           topic: 'Non-work banter'                    },
  { id: 'C008', name: 'prod-incidents',   topic: 'Production incident tracking'       },
];

// ---------------------------------------------------------------------------
// Tool definitions (MCP inputSchema)
// ---------------------------------------------------------------------------

const TOOLS = [
  // ── Bitbucket ──────────────────────────────────────────────────────────────
  {
    name: 'bitbucket_search_repositories',
    description: 'Searches Bitbucket workspaces for repositories by name, description, or metadata. Returns repository information, URLs, owner details, and project associations.',
    inputSchema: {
      type: 'object',
      properties: {
        query:     { type: 'string', description: 'Search query' },
        workspace: { type: 'string', description: 'Workspace slug (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'bitbucket_search_code',
    description: 'Searches code content within Bitbucket repositories across all or specific workspaces. Returns matching snippets with file paths, line numbers, and highlighted matches.',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Code search query' },
        workspace:  { type: 'string', description: 'Workspace slug (optional)' },
        repository: { type: 'string', description: 'Repository slug (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'bitbucket_search_artifacts',
    description: 'Searches and retrieves build or pipeline artifacts from Bitbucket Pipelines. Returns artifact metadata including content previews, pipeline information, and download links.',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Artifact search query' },
        workspace:  { type: 'string', description: 'Workspace slug' },
        repository: { type: 'string', description: 'Repository slug (optional)' },
      },
      required: ['query', 'workspace'],
    },
  },

  // ── Database – Cassandra ───────────────────────────────────────────────────
  {
    name: 'cassandra_list_keyspaces',
    description: 'Retrieves Cassandra keyspace names, including additional driver-specific metadata (e.g., durable_writes, replication).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cassandra_execute_select_query',
    description: 'Executes a SELECT query against a Cassandra keyspace. Returns rows as a list of objects mapping column names to values, along with optional metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'CQL SELECT query' },
        keyspace: { type: 'string', description: 'Target keyspace (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'cassandra_server_info',
    description: 'Returns Cassandra cluster or server details such as cluster name, release version, data centers, and node/host information.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Database – Elasticsearch ───────────────────────────────────────────────
  {
    name: 'elasticsearch_list_indices',
    description: 'Returns a list of Elasticsearch indices, such as name, health/status, document count, and store size.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'elasticsearch_search_logs',
    description: 'Searches Elasticsearch log indices. Returns log hits (timestamp, message, host, service, level), total hit count, and aggregations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        index: { type: 'string', description: 'Index pattern (optional, default: logs-*)' },
        size:  { type: 'number', description: 'Number of results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'elasticsearch_cluster_info',
    description: 'Returns Elasticsearch cluster details such as cluster name, status/health, number of nodes, version, and node roles.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Database – PostgreSQL ──────────────────────────────────────────────────
  {
    name: 'postgresql_list_databases',
    description: 'Retrieves a list of PostgreSQL database names, including owner and size details.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'postgresql_execute_select_query',
    description: 'Executes a SELECT query against PostgreSQL. Returns rows as objects with column-value mappings and optional column metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'SQL SELECT query' },
        database: { type: 'string', description: 'Target database name (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'postgresql_server_info',
    description: 'Returns PostgreSQL server and version information, including current database and settings snapshot.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Confluence ─────────────────────────────────────────────────────────────
  {
    name: 'confluence_get_page',
    description: 'Searches a Confluence page by its title or name. Returns the complete page with body content, labels, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        title:     { type: 'string', description: 'Page title to search for' },
        space_key: { type: 'string', description: 'Confluence space key (optional)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'confluence_search',
    description: 'Searches Confluence using CQL (Confluence Query Language). Returns matching pages with titles, excerpts, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        cql:   { type: 'string', description: 'CQL query string' },
        limit: { type: 'number', description: 'Max results (default: 25)' },
      },
      required: ['cql'],
    },
  },

  // ── GitHub ─────────────────────────────────────────────────────────────────
  {
    name: 'github_search_repositories',
    description: 'Returns a list of GitHub repository objects, such as ID, name, full name, description, topics, visibility, stars, URLs, total count, and pagination information.',
    inputSchema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'GitHub search query' },
        per_page: { type: 'number', description: 'Results per page (default: 30)' },
        page:     { type: 'number', description: 'Page number (default: 1)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_search_code',
    description: 'Returns GitHub code search results with repository reference, file path, score, and text matches/snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Code search query' },
        per_page: { type: 'number', description: 'Results per page (default: 30)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_list_commits',
    description: 'Returns a list of GitHub commit objects, such as SHA, author/committer, message, date, and parent SHA for the specified repository/branch.',
    inputSchema: {
      type: 'object',
      properties: {
        owner:    { type: 'string', description: 'Repository owner' },
        repo:     { type: 'string', description: 'Repository name' },
        branch:   { type: 'string', description: 'Branch name (optional)' },
        per_page: { type: 'number', description: 'Results per page (default: 30)' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_get_pull_request_comments',
    description: 'Returns a list of GitHub pull request comments with commenter details, body, timestamps, file/path and line references, and review thread information.',
    inputSchema: {
      type: 'object',
      properties: {
        owner:       { type: 'string', description: 'Repository owner' },
        repo:        { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'Pull request number' },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
  },

  // ── GitLab ─────────────────────────────────────────────────────────────────
  {
    name: 'gitlab_search_repositories',
    description: 'Returns a list of GitLab repository/project objects, such as ID, name, path, description, visibility, web URL, and pagination information.',
    inputSchema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Search query' },
        per_page: { type: 'number', description: 'Results per page (default: 20)' },
        page:     { type: 'number', description: 'Page number (default: 1)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gitlab_search_code',
    description: 'Returns GitLab code search results with repository/project reference, file path, matched snippet/context, and pagination information.',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Code search query' },
        project_id: { type: 'string', description: 'GitLab project ID or path (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gitlab_list_commits',
    description: 'Returns a list of GitLab commit objects, such as ID/SHA, author, message, date, and parent SHA for the specified repository/branch.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'GitLab project ID or path' },
        ref_name:   { type: 'string', description: 'Branch or tag (optional)' },
        per_page:   { type: 'number', description: 'Results per page (default: 20)' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'gitlab_get_pull_request_comments',
    description: 'Returns a list of notes/comments on a GitLab merge request, including author details, body, timestamps, and thread metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id:        { type: 'string', description: 'GitLab project ID or path' },
        merge_request_iid: { type: 'number', description: 'Merge request IID' },
      },
      required: ['project_id', 'merge_request_iid'],
    },
  },

  // ── Google ─────────────────────────────────────────────────────────────────
  {
    name: 'google_search_drive_files',
    description: 'Performs a full-text search across Google Drive, including file names, documents, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query:     { type: 'string', description: 'Drive search query' },
        page_size: { type: 'number', description: 'Number of results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'google_sheets_read',
    description: 'Searches and reads Google Sheets spreadsheets by file name. Returns metadata and cell values.',
    inputSchema: {
      type: 'object',
      properties: {
        file_name:  { type: 'string', description: 'Spreadsheet file name' },
        sheet_name: { type: 'string', description: 'Sheet/tab name (optional)' },
        range:      { type: 'string', description: 'A1 notation range (optional)' },
      },
      required: ['file_name'],
    },
  },
  {
    name: 'google_docs_read',
    description: 'Searches and reads Google Docs documents by file name. Returns metadata and body content.',
    inputSchema: {
      type: 'object',
      properties: {
        file_name: { type: 'string', description: 'Document file name' },
      },
      required: ['file_name'],
    },
  },
  {
    name: 'google_chat_search_message',
    description: 'Searches Google Chat spaces and direct messages. Returns matching messages with sender information and thread context.',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Message search query' },
        space_name: { type: 'string', description: 'Space name or ID (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'google_slides_get_presentation',
    description: 'Searches and retrieves Google Slides presentations by name. Returns presentation metadata, slides, and page elements.',
    inputSchema: {
      type: 'object',
      properties: {
        file_name: { type: 'string', description: 'Presentation file name' },
      },
      required: ['file_name'],
    },
  },

  // ── Jenkins ────────────────────────────────────────────────────────────────
  {
    name: 'jenkins_searchbuildlog',
    description: 'Searches Jenkins build logs for specified patterns (string or regex). Returns matching lines with context, build metadata, and line numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        job_name:     { type: 'string', description: 'Jenkins job name' },
        pattern:      { type: 'string', description: 'String or regex pattern to search' },
        build_number: { type: 'number', description: 'Specific build number (optional, default: latest)' },
      },
      required: ['job_name', 'pattern'],
    },
  },
  {
    name: 'jenkins_getjobscm',
    description: 'Retrieves the SCM (Source Code Management) configuration of a Jenkins job. Returns repository URLs, credentials references, branch configurations, and polling settings.',
    inputSchema: {
      type: 'object',
      properties: {
        job_name: { type: 'string', description: 'Jenkins job name' },
      },
      required: ['job_name'],
    },
  },

  // ── Jira ───────────────────────────────────────────────────────────────────
  {
    name: 'jira_search_issues',
    description: 'Returns a list of Jira issues matching the JQL query, including fields per issue (key, ID, summary, status, assignee, etc.), total count, and pagination information.',
    inputSchema: {
      type: 'object',
      properties: {
        jql:         { type: 'string', description: 'Jira Query Language query' },
        max_results: { type: 'number', description: 'Max results (default: 50)' },
        start_at:    { type: 'number', description: 'Pagination offset (default: 0)' },
        fields:      { type: 'array', items: { type: 'string' }, description: 'Fields to include (optional)' },
      },
      required: ['jql'],
    },
  },
  {
    name: 'jira_get_issue',
    description: 'Returns a Jira issue object with full details (key, ID, fields, and transitions/links).',
    inputSchema: {
      type: 'object',
      properties: {
        issue_key: { type: 'string', description: 'Issue key (e.g., PROJ-123)' },
      },
      required: ['issue_key'],
    },
  },

  // ── Slack ──────────────────────────────────────────────────────────────────
  {
    name: 'slack_get_user_info',
    description: 'Retrieves information about a specific user with Slack ID or Slack username. Returns user information including the Slack profile picture.',
    inputSchema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Slack user ID (U...) or username' },
      },
      required: ['user'],
    },
  },
  {
    name: 'slack_conversations_search_messages',
    description: 'Searches Slack conversations across different channels for a specified string. Returns matching messages.',
    inputSchema: {
      type: 'object',
      properties: {
        query:   { type: 'string', description: 'Message search query' },
        count:   { type: 'number', description: 'Number of results (default: 20)' },
        channel: { type: 'string', description: 'Channel ID to limit search (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'slack_channels_list',
    description: 'Lists all Slack channels by channel type.',
    inputSchema: {
      type: 'object',
      properties: {
        types: { type: 'string', description: 'Channel types: public_channel, private_channel, mpim, im (optional)' },
        limit: { type: 'number', description: 'Max results (default: 100)' },
      },
    },
  },

  // ── Salesforce ─────────────────────────────────────────────────────────────
  {
    name: 'salesforce_query_soql',
    description: 'Queries standard Salesforce objects (Account, Contact, Lead, Opportunity, Case, Contract) using SOQL. Returns matching records.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SOQL query string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'salesforce_list_reports',
    description: 'Lists random analytics reports from the Salesforce report library. Returns report metadata including name, folder, format, and last run date.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default: 25)' },
      },
    },
  },
  {
    name: 'salesforce_get_report',
    description: 'Retrieves the full data for a specific Salesforce report by name. Returns report metadata and CSV-exportable data.',
    inputSchema: {
      type: 'object',
      properties: {
        report_name: { type: 'string', description: 'Report name' },
      },
      required: ['report_name'],
    },
  },
  {
    name: 'salesforce_get_account',
    description: 'Retrieves comprehensive Salesforce account details by company name, including account info, contacts, opportunities, contracts, support cases, and account team members.',
    inputSchema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'Account/company name to look up' },
      },
      required: ['company_name'],
    },
  },
];

// ---------------------------------------------------------------------------
// Seeded fake-data helpers (called inside callTool after _s is seeded)
// ---------------------------------------------------------------------------

function fakeRepos(count = 3) {
  return Array.from({ length: count }, (_, i) => {
    const r  = REPOS[i % REPOS.length];
    const id = rand(1000, 9999);
    return {
      id,
      name:        r.name,
      full_name:   `corp-org/${r.name}`,
      description: r.desc,
      visibility:  'private',
      stars:       rand(0, 120),
      topics:      ['internal'],
      html_url:    `https://github.com/corp-org/${r.name}`,
      clone_url:   `https://github.com/corp-org/${r.name}.git`,
    };
  });
}

function fakeCommits(count = 5) {
  return Array.from({ length: count }, (_, i) => {
    const user = USERS[i % USERS.length];
    const s    = sha();
    return {
      sha:       s,
      short_sha: s.slice(0, 7),
      author:    { name: user.real_name, email: user.email, date: isoDate(i) },
      committer: { name: user.real_name, email: user.email, date: isoDate(i) },
      message:   COMMIT_MESSAGES[i % COMMIT_MESSAGES.length],
      parents:   [{ sha: sha().slice(0, 7) }],
    };
  });
}

function fakeJiraIssues(count = 3) {
  const statuses   = ['To Do', 'In Progress', 'In Review', 'Done'];
  const priorities = ['High', 'Medium', 'Low'];
  const projects   = ['PLAT', 'SEC', 'DATA', 'INFRA'];
  const summaries  = [
    'Rotate expired service account credentials',
    'Implement MFA enforcement for admin users',
    'Audit S3 bucket permissions',
    'Update TLS certificates before expiry',
    'Review third-party OAuth scopes',
    'Remediate high-severity CVE in base image',
  ];
  return Array.from({ length: count }, (_, i) => {
    const user = USERS[i % USERS.length];
    const proj = projects[i % projects.length];
    return {
      id:  String(rand(10000, 99999)),
      key: `${proj}-${rand(100, 999)}`,
      fields: {
        summary:  summaries[i % summaries.length],
        status:   { name: statuses[i % statuses.length] },
        priority: { name: priorities[i % priorities.length] },
        assignee: { displayName: user.real_name, emailAddress: user.email },
        reporter: { displayName: USERS[(i + 1) % USERS.length].real_name },
        created:  isoDate(rand(10, 90)),
        updated:  isoDate(rand(0, 10)),
        labels:   ['security', 'compliance'],
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Entity-ID validation helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JIRA_KEY_RE = /^[A-Z]{2,10}-\d{1,6}$/;

function looksLikeUuid(s) { return UUID_RE.test(String(s || '')); }

function notFound(msg) {
  throw Object.assign(new Error(msg), { code: -32602 });
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

function callTool(name, args) {
  // Seed the PRNG deterministically for this (name, args) pair.
  _s = strHash(name + '\x00' + JSON.stringify(args)) || 1;

  switch (name) {

    // ── Bitbucket ────────────────────────────────────────────────────────────
    case 'bitbucket_search_repositories':
      return {
        total_count:  3,
        repositories: fakeRepos(3).map(r => ({
          ...r,
          workspace: 'corp-workspace',
          project:   { key: 'CORP', name: 'Corp Projects' },
          links:     { html: { href: `https://bitbucket.org/corp-workspace/${r.name}` } },
        })),
      };

    case 'bitbucket_search_code':
      return {
        total_count: 2,
        results: [
          {
            file:       { path: 'src/config/database.py', links: { html: { href: 'https://bitbucket.org/corp-workspace/backend-api/src/main/src/config/database.py' } } },
            repository: { full_name: 'corp-workspace/backend-api' },
            lines:      [{ line: 14, content: `  # ${args.query || 'match'} found here` }],
          },
          {
            file:       { path: 'deploy/helm/values.yaml' },
            repository: { full_name: 'corp-workspace/infra-terraform' },
            lines:      [{ line: 42, content: `  value: "<!-- ${args.query || 'match'} -->"` }],
          },
        ],
      };

    case 'bitbucket_search_artifacts':
      return {
        total_count: 1,
        artifacts: [
          {
            name:         'build-report.tar.gz',
            size_bytes:   204800,
            pipeline:     { build_number: rand(800, 1200), status: 'SUCCESSFUL' },
            created_on:   isoDate(2),
            download_url: `https://api.bitbucket.org/2.0/repositories/corp-workspace/backend-api/downloads/build-report.tar.gz`,
          },
        ],
      };

    // ── Cassandra ────────────────────────────────────────────────────────────
    case 'cassandra_list_keyspaces':
      return {
        keyspaces: [
          { name: 'user_sessions', durable_writes: true,  replication: { class: 'NetworkTopologyStrategy', datacenter1: '3' } },
          { name: 'audit_logs',    durable_writes: true,  replication: { class: 'SimpleStrategy', replication_factor: '2' } },
          { name: 'app_config',    durable_writes: false, replication: { class: 'SimpleStrategy', replication_factor: '1' } },
          { name: 'system',        durable_writes: true,  replication: { class: 'LocalStrategy' } },
          { name: 'system_auth',   durable_writes: true,  replication: { class: 'SimpleStrategy', replication_factor: '1' } },
        ],
      };

    case 'cassandra_execute_select_query':
      return {
        rows: [
          { session_id: genUuid(), user_id: genUuid(), created_at: isoDate(0), ip_address: '10.0.1.42',  user_agent: 'Mozilla/5.0' },
          { session_id: genUuid(), user_id: genUuid(), created_at: isoDate(0), ip_address: '10.0.2.17',  user_agent: 'python-httpx/0.25.0' },
        ],
        metadata:     { columns: ['session_id', 'user_id', 'created_at', 'ip_address', 'user_agent'] },
        paging_state: null,
      };

    case 'cassandra_server_info':
      return {
        cluster_name:    'corp-cassandra-prod',
        release_version: '4.1.3',
        data_centers:    ['datacenter1'],
        hosts: [
          { address: '10.10.0.11', data_center: 'datacenter1', rack: 'rack1', state: 'UP' },
          { address: '10.10.0.12', data_center: 'datacenter1', rack: 'rack1', state: 'UP' },
          { address: '10.10.0.13', data_center: 'datacenter1', rack: 'rack1', state: 'UP' },
        ],
      };

    // ── Elasticsearch ────────────────────────────────────────────────────────
    case 'elasticsearch_list_indices':
      return {
        indices: [
          { name: 'logs-app-2026.04', health: 'green',  status: 'open', docs_count: 4812043,  store_size: '3.8gb'  },
          { name: 'logs-app-2026.03', health: 'green',  status: 'open', docs_count: 14200000, store_size: '11.2gb' },
          { name: 'audit-events',     health: 'green',  status: 'open', docs_count: 921000,   store_size: '820mb'  },
          { name: 'security-alerts',  health: 'yellow', status: 'open', docs_count: 3201,     store_size: '2.1mb'  },
          { name: '.kibana',          health: 'green',  status: 'open', docs_count: 47,        store_size: '152kb'  },
        ],
      };

    case 'elasticsearch_search_logs':
      return {
        total: { value: 482, relation: 'eq' },
        hits: [
          { _index: 'logs-app-2026.04', _id: genUuid(), _score: 1.8, _source: { '@timestamp': isoDate(0), message: `${args.query || 'error'}: authentication failed for user admin`, host: 'api-server-03', service: 'auth-service',  level: 'WARN'  } },
          { _index: 'logs-app-2026.04', _id: genUuid(), _score: 1.5, _source: { '@timestamp': isoDate(0), message: `${args.query || 'error'}: rate limit exceeded`,                 host: 'api-server-01', service: 'gateway',      level: 'ERROR' } },
          { _index: 'logs-app-2026.04', _id: genUuid(), _score: 1.2, _source: { '@timestamp': isoDate(1), message: `Retrying after ${args.query || 'error'}`,                        host: 'worker-02',     service: 'data-pipeline', level: 'INFO'  } },
        ],
        aggregations: {},
      };

    case 'elasticsearch_cluster_info':
      return {
        cluster_name:         'corp-elk-prod',
        status:               'yellow',
        number_of_nodes:      5,
        number_of_data_nodes: 3,
        version:              { number: '8.12.1', lucene_version: '9.9.2' },
        node_roles:           ['master', 'data', 'ingest', 'ml'],
      };

    // ── PostgreSQL ───────────────────────────────────────────────────────────
    case 'postgresql_list_databases':
      return {
        databases: [
          { name: 'app_production', owner: 'app_user',      size: '14 GB',     encoding: 'UTF8' },
          { name: 'analytics',      owner: 'analytics_ro',  size: '87 GB',     encoding: 'UTF8' },
          { name: 'auth_db',        owner: 'auth_service',  size: '2 GB',      encoding: 'UTF8' },
          { name: 'audit_trail',    owner: 'postgres',      size: '22 GB',     encoding: 'UTF8' },
          { name: 'template1',      owner: 'postgres',      size: '8192 bytes', encoding: 'UTF8' },
        ],
      };

    case 'postgresql_execute_select_query':
      return {
        rows: [
          { id: rand(1, 1000),    email: 'alice.johnson@corp.internal', role: 'admin',  last_login: isoDate(1), mfa_enabled: true  },
          { id: rand(1001, 2000), email: 'bob.smith@corp.internal',     role: 'user',   last_login: isoDate(3), mfa_enabled: false },
          { id: rand(2001, 3000), email: 'carol.white@corp.internal',   role: 'user',   last_login: isoDate(0), mfa_enabled: true  },
        ],
        rowCount: 3,
        columns: [
          { name: 'id',           type: 'integer' },
          { name: 'email',        type: 'text' },
          { name: 'role',         type: 'text' },
          { name: 'last_login',   type: 'timestamp with time zone' },
          { name: 'mfa_enabled',  type: 'boolean' },
        ],
      };

    case 'postgresql_server_info':
      return {
        server_version:   'PostgreSQL 16.2 on aarch64-unknown-linux-gnu',
        current_database: args.database || 'app_production',
        current_user:     'app_user',
        settings: {
          max_connections:             '200',
          shared_buffers:              '4GB',
          ssl:                         'on',
          log_min_duration_statement:  '1000',
        },
      };

    // ── Confluence ───────────────────────────────────────────────────────────
    case 'confluence_get_page': {
      if (looksLikeUuid(args.title)) notFound(`Page not found: ${args.title}`);
      return {
        id:      String(rand(100000, 999999)),
        title:   args.title || 'Infrastructure Runbook',
        space:   { key: 'ENG', name: 'Engineering' },
        version: { number: rand(3, 20), when: isoDate(5) },
        labels:  [{ name: 'runbook' }, { name: 'internal' }],
        body:    { storage: { value: `<h2>Overview</h2><p>This page documents the procedures for ${args.title || 'infrastructure operations'}.</p><h2>Access</h2><p>Requires VPN and role <code>ops-team</code>.</p><h2>Credentials</h2><p>See 1Password vault: <strong>Engineering / Prod Credentials</strong>.</p>` } },
        _links:  { webui: `https://corp.atlassian.net/wiki/spaces/ENG/pages/${rand(100000, 999999)}` },
      };
    }

    case 'confluence_search':
      return {
        results: [
          { id: String(rand(100000, 999999)), title: 'AWS Production Credentials Rotation',    space: { key: 'SEC' }, excerpt: '...rotate IAM credentials every 90 days using the automated pipeline...', lastModified: isoDate(14) },
          { id: String(rand(100000, 999999)), title: 'Database Connection Strings — Production', space: { key: 'ENG' }, excerpt: '...PostgreSQL prod: postgresql://app_user@db-prod-01.internal:5432/app_production...', lastModified: isoDate(30) },
          { id: String(rand(100000, 999999)), title: 'On-Call Runbook: Auth Service',           space: { key: 'ENG' }, excerpt: '...emergency access via break-glass account. Contact security@corp.internal...', lastModified: isoDate(7) },
        ],
        totalSize: 3,
        start:     0,
        limit:     25,
      };

    // ── GitHub ───────────────────────────────────────────────────────────────
    case 'github_search_repositories':
      return { total_count: 3, incomplete_results: false, items: fakeRepos() };

    case 'github_search_code':
      return {
        total_count:       2,
        incomplete_results: false,
        items: [
          { path: 'src/config/settings.py', repository: { full_name: 'corp-org/backend-api'  }, score: 1.0, text_matches: [{ fragment: `${args.query || 'match'} = os.environ.get("SECRET_KEY")`, matches: [{ text: args.query || 'match' }] }] },
          { path: '.env.example',           repository: { full_name: 'corp-org/frontend-app' }, score: 0.8, text_matches: [{ fragment: `# ${args.query || 'match'}_TOKEN=your-token-here` }] },
        ],
      };

    case 'github_list_commits':
      return fakeCommits(5);

    case 'github_get_pull_request_comments':
      return [
        { id: rand(1, 9999), user: { login: USERS[0].name }, body: 'Please add input validation here before merging.', created_at: isoDate(2), path: 'src/handlers/auth.py', line: 87 },
        { id: rand(1, 9999), user: { login: USERS[1].name }, body: 'LGTM after the validation is addressed.',           created_at: isoDate(1), path: 'src/handlers/auth.py', line: 87 },
      ];

    // ── GitLab ───────────────────────────────────────────────────────────────
    case 'gitlab_search_repositories':
      return {
        total_pages: 1, total_items: 3,
        items: fakeRepos(3).map(r => ({ ...r, path: r.name, web_url: `https://gitlab.corp.internal/corp-group/${r.name}`, visibility: 'private' })),
      };

    case 'gitlab_search_code':
      return {
        total_pages: 1,
        items: [
          { project_id: rand(1, 50), project: { path_with_namespace: 'corp-group/backend-api' }, path: 'config/database.yml', ref: 'main', data: `production:\n  adapter: postgresql\n  # ${args.query || 'match'}` },
        ],
      };

    case 'gitlab_list_commits':
      return fakeCommits(5).map(c => ({ ...c, id: c.sha }));

    case 'gitlab_get_pull_request_comments':
      return [
        { id: rand(1, 9999), author: { name: USERS[0].real_name, username: USERS[0].name }, body: 'Needs a security review before we can merge this.', created_at: isoDate(3), type: 'DiffNote' },
        { id: rand(1, 9999), author: { name: USERS[2].real_name, username: USERS[2].name }, body: 'Approved after security review completed.',           created_at: isoDate(1), type: 'DiffNote' },
      ];

    // ── Google ───────────────────────────────────────────────────────────────
    case 'google_search_drive_files':
      return {
        files: [
          { id: genUuid(), name: `${args.query || 'Report'} - Q1 2026.xlsx`, mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: isoDate(5),  owners: [{ displayName: USERS[0].real_name }] },
          { id: genUuid(), name: `${args.query || 'Project'} Plan.docx`,     mimeType: 'application/vnd.google-apps.document',     modifiedTime: isoDate(12), owners: [{ displayName: USERS[1].real_name }] },
          { id: genUuid(), name: `${args.query || 'Credentials'} - Shared.xlsx`, mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: isoDate(30), owners: [{ displayName: USERS[2].real_name }] },
        ],
        nextPageToken: null,
      };

    case 'google_sheets_read':
      return {
        spreadsheetId: genUuid(),
        title:  args.file_name || 'Shared Sheet',
        sheets: [{ title: args.sheet_name || 'Sheet1' }],
        values: [
          ['Name',            'Email',               'Role',    'Last Login'],
          [USERS[0].real_name, USERS[0].email,       'Admin',  isoDate(1)],
          [USERS[1].real_name, USERS[1].email,       'User',   isoDate(3)],
          [USERS[2].real_name, USERS[2].email,       'Viewer', isoDate(7)],
        ],
      };

    case 'google_docs_read':
      return {
        documentId:      genUuid(),
        title:           args.file_name || 'Internal Document',
        body:            { content: `This document contains internal procedures for ${args.file_name || 'operations'}. For access issues contact helpdesk@corp.internal.` },
        lastModifiedTime: isoDate(10),
        owners:          [{ displayName: USERS[0].real_name }],
      };

    case 'google_chat_search_message':
      return {
        messages: [
          { name: `spaces/AAAA/messages/${genUuid()}`, sender: { displayName: USERS[0].real_name }, text: `Hey, re: ${args.query || 'the deployment'} — I've pushed the fix.`, createTime: isoDate(1) },
          { name: `spaces/AAAA/messages/${genUuid()}`, sender: { displayName: USERS[1].real_name }, text: `${args.query || 'Deployment'} confirmed working in prod.`,            createTime: isoDate(0) },
        ],
      };

    case 'google_slides_get_presentation':
      return {
        presentationId: genUuid(),
        title:   args.file_name || 'Quarterly Business Review',
        slides: [
          { objectId: 'slide_001', pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Q1 2026 Results' } }] } } }] },
          { objectId: 'slide_002', pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Revenue: $4.2M (+18% YoY)' } }] } } }] },
        ],
        masters: [],
      };

    // ── Jenkins ──────────────────────────────────────────────────────────────
    case 'jenkins_searchbuildlog':
      return {
        job:          args.job_name,
        build_number: args.build_number || rand(800, 1200),
        build_status: 'SUCCESS',
        matches: [
          { line_number: 142, content: `[Pipeline] INFO: ${args.pattern || 'pattern'} check passed` },
          { line_number: 287, content: `[Pipeline] WARN: retrying after ${args.pattern || 'pattern'} timeout (attempt 2/3)` },
        ],
        build_url: `https://jenkins.corp.internal/job/${args.job_name || 'deploy-prod'}/${args.build_number || rand(800, 1200)}/`,
      };

    case 'jenkins_getjobscm':
      return {
        job: args.job_name,
        scm: {
          type:         'GitSCM',
          repositories: [{ url: 'git@github.com:corp-org/backend-api.git', credentialsId: 'github-deploy-key-prod' }],
          branches:     [{ name: '*/main' }],
          polling:      { spec: 'H/5 * * * *' },
          extensions:   [],
        },
      };

    // ── Jira ─────────────────────────────────────────────────────────────────
    case 'jira_search_issues':
      return {
        startAt:    args.start_at || 0,
        maxResults: args.max_results || 50,
        total:      3,
        issues:     fakeJiraIssues(3),
      };

    case 'jira_get_issue': {
      if (!args.issue_key || !JIRA_KEY_RE.test(args.issue_key)) {
        notFound(`Issue not found: ${args.issue_key}`);
      }
      const issues = fakeJiraIssues(1);
      const issue  = issues[0];
      issue.key    = args.issue_key || issue.key;
      issue.transitions = [
        { id: '11', name: 'To Do' },
        { id: '21', name: 'In Progress' },
        { id: '31', name: 'In Review' },
        { id: '41', name: 'Done' },
      ];
      return issue;
    }

    // ── Slack ────────────────────────────────────────────────────────────────
    case 'slack_get_user_info': {
      const u = USERS.find(x => x.id === args.user || x.name === args.user);
      if (!u) throw Object.assign(new Error('user_not_found'), { code: -32602 });
      return {
        ok:   true,
        user: {
          id:        u.id,
          name:      u.name,
          real_name: u.real_name,
          profile: {
            email:        u.email,
            display_name: u.name,
            title:        ['Software Engineer', 'Senior Engineer', 'Staff Engineer', 'DevOps Engineer'][rand(0, 3)],
            image_192:    `https://secure.gravatar.com/avatar/${Buffer.from(u.email).toString('hex').slice(0, 32)}`,
            phone:        `+1 (555) 01${rand(10, 99)}-${rand(1000, 9999)}`,
          },
          is_admin: rand(0, 5) === 0,
          is_bot:   false,
        },
      };
    }

    case 'slack_conversations_search_messages':
      return {
        ok: true,
        messages: {
          total: 3,
          matches: [
            { channel: { id: CHANNELS[1].id, name: CHANNELS[1].name }, user: USERS[0].id, username: USERS[0].name, text: `Looking into the ${args.query || 'issue'} — will post an update in #deployments`, ts: String(rand(1700000000, 1800000000)) },
            { channel: { id: CHANNELS[7].id, name: CHANNELS[7].name }, user: USERS[2].id, username: USERS[2].name, text: `Incident triggered by ${args.query || 'anomaly'}, severity P2 — working on fix`,     ts: String(rand(1700000000, 1800000000)) },
          ],
        },
      };

    case 'slack_channels_list':
      return {
        ok:       true,
        channels: CHANNELS.map(c => ({
          ...c,
          is_private:  ['on-call', 'security-alerts'].includes(c.name),
          num_members: rand(3, 200),
          created:     rand(1609459200, 1700000000),
        })),
        response_metadata: { next_cursor: '' },
      };

    // ── Salesforce ───────────────────────────────────────────────────────────
    case 'salesforce_query_soql':
      return {
        totalSize: 2,
        done:      true,
        records: [
          { attributes: { type: 'Account' }, Id: genUuid(), Name: 'Acme Corporation', Industry: 'Technology',    AnnualRevenue: 12000000, OwnerId: genUuid() },
          { attributes: { type: 'Account' }, Id: genUuid(), Name: 'Globex Inc.',       Industry: 'Manufacturing', AnnualRevenue: 8500000,  OwnerId: genUuid() },
        ],
      };

    case 'salesforce_list_reports':
      return {
        reports: [
          { id: genUuid(), name: 'Q1 2026 Pipeline Summary',   folder: 'Sales Analytics',  format: 'TABULAR', lastRunDate: isoDate(3)  },
          { id: genUuid(), name: 'Monthly Active Accounts',     folder: 'Account Reports',  format: 'SUMMARY', lastRunDate: isoDate(1)  },
          { id: genUuid(), name: 'Open Cases by Priority',      folder: 'Support Reports',  format: 'MATRIX',  lastRunDate: isoDate(7)  },
          { id: genUuid(), name: 'Leads Converted YTD',         folder: 'Sales Analytics',  format: 'TABULAR', lastRunDate: isoDate(14) },
        ],
      };

    case 'salesforce_get_report':
      return {
        reportMetadata: { name: args.report_name, format: 'TABULAR', reportType: { label: 'Accounts' } },
        factMap: {
          'T!T': {
            rows: [
              { dataCells: [{ label: 'Acme Corporation', value: 'Acme Corporation' }, { label: '12,000,000', value: 12000000 }] },
              { dataCells: [{ label: 'Globex Inc.',      value: 'Globex Inc.'      }, { label: '8,500,000',  value: 8500000  }] },
            ],
          },
        },
        columns: ['Account Name', 'Annual Revenue'],
      };

    case 'salesforce_get_account': {
      const key = (args.company_name || '').toLowerCase().trim();
      const acct = SALESFORCE_ACCOUNTS[key];
      if (!acct) notFound(`Account not found: ${args.company_name}`);
      const accountId = genUuid();
      return {
        Id:              accountId,
        Name:            acct.Name,
        Industry:        acct.Industry,
        Phone:           acct.Phone,
        BillingAddress:  acct.BillingAddress,
        AnnualRevenue:   acct.AnnualRevenue,
        Contacts: [
          { Id: genUuid(), Name: 'John Doe',  Title: 'CTO',            Email: 'jdoe@acme.example', Phone: '+1 (555) 100-0001' },
          { Id: genUuid(), Name: 'Jane Roe',  Title: 'VP Engineering',  Email: 'jroe@acme.example', Phone: '+1 (555) 100-0002' },
        ],
        Opportunities: [
          { Id: genUuid(), Name: 'Acme Enterprise Renewal 2026', StageName: 'Negotiation', Amount: 240000, CloseDate: '2026-06-30' },
        ],
        Cases: [
          { Id: genUuid(), Subject: 'API rate limit exceeded', Status: 'In Progress', Priority: 'High', CreatedDate: isoDate(5) },
        ],
        AccountTeamMembers: [
          { Id: genUuid(), TeamMemberRole: 'Account Executive', User: { Name: USERS[0].real_name, Email: USERS[0].email } },
        ],
      };
    }

    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
  }
}

module.exports = { TOOLS, callTool };
