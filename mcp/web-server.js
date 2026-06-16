const { env } = require('node:process');
const express = require('express');

const BASE_URL = (env.HEDGEDOC_BASE_URL || 'http://backend:3000').replace(/\/$/, '');
const PUBLIC_BASE_URL = (env.HEDGEDOC_PUBLIC_BASE_URL || 'http://localhost:8081').replace(/\/$/, '');
const MCP_PORT = Number(env.MCP_PORT || 3002);
const SERVER_NAME = 'spicomellus-mcp';
const SERVER_VERSION = '0.2.0';
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

const LEGACY_TOOL_ALIASES = {
  node_create: 'note_create',
  node_update: 'note_update',
  node_delete: 'note_delete',
  node_get: 'note_get',
  node_graph_get: 'note_graph_get',
  node_link_create: 'note_link_create',
  node_link_delete: 'note_link_delete',
};

const toolDefinitions = [
  {
    name: 'note_create',
    description: 'Create a new note. Provide alias to create a named note, otherwise a random alias is generated.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Optional note alias' },
        content: { type: 'string', description: 'Markdown content of the note' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_update',
    description: 'Update the content of an existing note.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Existing note alias' },
        content: { type: 'string', description: 'New markdown content' },
      },
      required: ['alias', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_delete',
    description: 'Delete a note. Media is deleted by default.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Existing note alias' },
        keepMedia: { type: 'boolean', description: 'Keep media uploads instead of deleting them' },
      },
      required: ['alias'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_list_all',
    description: 'List all notes of the current authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'note_get',
    description: 'Read a note, including metadata, content, graph snapshot, and permissions-related fields exposed by the API.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Existing note alias' },
      },
      required: ['alias'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_graph_get',
    description: 'Read the card graph snapshot for a note.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Existing note alias' },
        focusOn: { type: 'string', description: 'Optional focus card id' },
        depth: { type: 'integer', minimum: 1, maximum: 3, default: 1 },
      },
      required: ['alias'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_link_create',
    description: 'Create a note-to-note relation.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Source note alias' },
        targetAlias: { type: 'string', description: 'Target note alias' },
        edgeType: { type: 'string', enum: ['uni', 'bid'], description: 'Edge direction/type' },
      },
      required: ['alias', 'targetAlias', 'edgeType'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_link_delete',
    description: 'Delete note-to-note relations from a source note to a target alias.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Source note alias' },
        targetAlias: { type: 'string', description: 'Target note alias' },
      },
      required: ['alias', 'targetAlias'],
      additionalProperties: false,
    },
  },
  {
    name: 'knowledge_base_read',
    description: 'Recursively collect notes connected through note links and backlinks to build a knowledge base context.',
    inputSchema: {
      type: 'object',
      properties: {
        rootAlias: { type: 'string', description: 'Starting note alias' },
        maxDepth: { type: 'integer', minimum: 0, maximum: 6, default: 2 },
      },
      required: ['rootAlias'],
      additionalProperties: false,
    },
  },
];

const toolDefinitionsWithLegacyAliases = [
  ...toolDefinitions,
  ...toolDefinitions
    .filter((tool) => Object.values(LEGACY_TOOL_ALIASES).includes(tool.name))
    .map((tool) => {
      const aliasName = Object.keys(LEGACY_TOOL_ALIASES).find((key) => LEGACY_TOOL_ALIASES[key] === tool.name);
      return {
        ...tool,
        name: aliasName,
        description: `[Legacy alias] ${tool.description}`,
      };
    }),
];

const app = express();
app.use(express.json({ limit: '1mb' }));

function toTextResult(payload) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth) {
    return null;
  }
  const [method, token] = auth.trim().split(' ');
  if (method !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

async function apiRequest(token, path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body && !options.headers?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  let body = raw;
  if (raw && contentType.includes('application/json')) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} ${response.statusText}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

function normalizeLinkRecord(link) {
  if (!link || typeof link !== 'object') {
    return null;
  }
  const sourceCardKey = link.sourceCardKey ?? link.source_card_key;
  const targetCardKey = link.targetCardKey ?? link.target_card_key;
  const edgeType = link.edgeType ?? link.edge_type;
  return {
    ...link,
    sourceCardKey,
    targetCardKey,
    edgeType,
  };
}

function normalizeLinkRecords(links) {
  if (!Array.isArray(links)) {
    return [];
  }
  return links.map((link) => normalizeLinkRecord(link)).filter((link) => link !== null);
}

async function handleToolCall(token, name, args) {
  const normalizedName = LEGACY_TOOL_ALIASES[name] || name;
  const input = args && typeof args === 'object' ? args : {};

  switch (normalizedName) {
    case 'note_create': {
      if (typeof input.content !== 'string') {
        throw new Error('content is required');
      }
      const path = typeof input.alias === 'string' && input.alias.length > 0
        ? `/api/v2/notes/${encodeURIComponent(input.alias)}`
        : '/api/v2/notes';
      const created = await apiRequest(token, path, {
        method: 'POST',
        body: input.content,
        headers: { 'Content-Type': 'text/markdown' },
      });
      return toTextResult({ created });
    }
    case 'note_update': {
      if (typeof input.alias !== 'string' || typeof input.content !== 'string') {
        throw new Error('alias and content are required');
      }
      const updated = await apiRequest(token, `/api/v2/notes/${encodeURIComponent(input.alias)}`, {
        method: 'PUT',
        body: input.content,
        headers: { 'Content-Type': 'text/markdown' },
      });
      return toTextResult({ updated });
    }
    case 'note_delete': {
      if (typeof input.alias !== 'string') {
        throw new Error('alias is required');
      }
      await apiRequest(token, `/api/v2/notes/${encodeURIComponent(input.alias)}`, {
        method: 'DELETE',
        body: JSON.stringify({ keepMedia: Boolean(input.keepMedia) }),
      });
      return toTextResult({ deleted: true, alias: input.alias, keepMedia: Boolean(input.keepMedia) });
    }
    case 'note_list_all': {
      const notes = await apiRequest(token, '/api/v2/me/notes', { method: 'GET' });
      return toTextResult({ count: Array.isArray(notes) ? notes.length : 0, notes });
    }
    case 'note_get': {
      if (typeof input.alias !== 'string') {
        throw new Error('alias is required');
      }
      const encodedAlias = encodeURIComponent(input.alias);
      const [note, metadata, graph, content, links, backlinks] = await Promise.all([
        apiRequest(token, `/api/v2/notes/${encodedAlias}`, { method: 'GET' }),
        apiRequest(token, `/api/v2/notes/${encodedAlias}/metadata`, { method: 'GET' }),
        apiRequest(token, `/api/v2/notes/${encodedAlias}/graph?depth=1`, { method: 'GET' }),
        apiRequest(token, `/api/v2/notes/${encodedAlias}/content`, { method: 'GET', headers: { Accept: 'text/plain' } }),
        apiRequest(token, `/api/v2/notes/${encodedAlias}/links`, { method: 'GET' }),
        apiRequest(token, `/api/v2/notes/${encodedAlias}/cross-backlinks/aliases`, { method: 'GET' }),
      ]);
      return toTextResult({ alias: input.alias, note, metadata, graph, content, links: normalizeLinkRecords(links), backlinks });
    }
    case 'note_graph_get': {
      if (typeof input.alias !== 'string') {
        throw new Error('alias is required');
      }
      const params = new URLSearchParams();
      if (typeof input.focusOn === 'string' && input.focusOn.length > 0) {
        params.set('focusOn', input.focusOn);
      }
      const depth = Number.isInteger(input.depth) ? input.depth : 1;
      params.set('depth', String(depth));
      const graph = await apiRequest(token, `/api/v2/notes/${encodeURIComponent(input.alias)}/graph?${params.toString()}`, { method: 'GET' });
      return toTextResult({ alias: input.alias, graph });
    }
    case 'note_link_create': {
      if (typeof input.alias !== 'string' || typeof input.targetAlias !== 'string' || typeof input.edgeType !== 'string') {
        throw new Error('alias, targetAlias, and edgeType are required');
      }
      await apiRequest(token, `/api/v2/notes/${encodeURIComponent(input.alias)}/note-links`, {
        method: 'POST',
        body: JSON.stringify({ targetAlias: input.targetAlias, edgeType: input.edgeType }),
      });
      return toTextResult({ created: true, alias: input.alias, targetAlias: input.targetAlias, edgeType: input.edgeType });
    }
    case 'note_link_delete': {
      if (typeof input.alias !== 'string' || typeof input.targetAlias !== 'string') {
        throw new Error('alias and targetAlias are required');
      }
      await apiRequest(token, `/api/v2/notes/${encodeURIComponent(input.alias)}/note-links/${encodeURIComponent(input.targetAlias)}`, {
        method: 'DELETE',
      });
      return toTextResult({ deleted: true, alias: input.alias, targetAlias: input.targetAlias });
    }
    case 'knowledge_base_read': {
      if (typeof input.rootAlias !== 'string') {
        throw new Error('rootAlias is required');
      }
      const maxDepth = Number.isInteger(input.maxDepth) ? input.maxDepth : 2;
      const visited = new Set();
      const queue = [{ alias: input.rootAlias, depth: 0 }];
      const notes = [];
      const relations = [];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current.alias)) {
          continue;
        }
        visited.add(current.alias);

        const encodedAlias = encodeURIComponent(current.alias);
        const [note, metadata, content, graph, links, backlinks] = await Promise.all([
          apiRequest(token, `/api/v2/notes/${encodedAlias}`, { method: 'GET' }),
          apiRequest(token, `/api/v2/notes/${encodedAlias}/metadata`, { method: 'GET' }),
          apiRequest(token, `/api/v2/notes/${encodedAlias}/content`, { method: 'GET', headers: { Accept: 'text/plain' } }),
          apiRequest(token, `/api/v2/notes/${encodedAlias}/graph?depth=1`, { method: 'GET' }),
          apiRequest(token, `/api/v2/notes/${encodedAlias}/links`, { method: 'GET' }),
          apiRequest(token, `/api/v2/notes/${encodedAlias}/cross-backlinks/aliases`, { method: 'GET' }),
        ]);

        notes.push({ alias: current.alias, note, metadata, content, graph });

        for (const link of normalizeLinkRecords(links)) {
          if (!link || !link.targetCardKey) {
            continue;
          }
          relations.push({ direction: 'outgoing', sourceAlias: current.alias, targetAlias: link.targetCardKey, edgeType: link.edgeType });
          if (current.depth < maxDepth && !visited.has(link.targetCardKey)) {
            queue.push({ alias: link.targetCardKey, depth: current.depth + 1 });
          }
        }

        if (Array.isArray(backlinks)) {
          for (const src of backlinks) {
            if (typeof src !== 'string') {
              continue;
            }
            relations.push({ direction: 'backlink', sourceAlias: src, targetAlias: current.alias });
            if (current.depth < maxDepth && !visited.has(src)) {
              queue.push({ alias: src, depth: current.depth + 1 });
            }
          }
        }
      }

      return toTextResult({ rootAlias: input.rootAlias, maxDepth, noteCount: notes.length, relationCount: relations.length, notes, relations });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function jsonRpcSuccess(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: '2.0', id, error };
}

app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json({
    resource: `${PUBLIC_BASE_URL}/mcp`,
    authorization_servers: [PUBLIC_BASE_URL],
    bearer_methods_supported: ['header'],
    resource_documentation: `${PUBLIC_BASE_URL}/mcp/docs`,
    scopes_supported: ['notes:read', 'notes:write'],
  });
});

app.get('/mcp/docs', (_req, res) => {
  res.json({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    transport: 'http-jsonrpc',
    endpoint: '/mcp',
    tools: toolDefinitionsWithLegacyAliases.map((tool) => ({ name: tool.name, description: tool.description })),
  });
});

app.post('/mcp', async (req, res) => {
  const token = getBearerToken(req);
  const message = req.body;
  const id = message?.id ?? null;
  const method = message?.method;

  if (!message || typeof message !== 'object' || typeof method !== 'string') {
    res.status(400).json(jsonRpcError(id, -32600, 'Invalid Request'));
    return;
  }

  try {
    switch (method) {
      case 'initialize':
        res.json(jsonRpcSuccess(id, {
          protocolVersion: message?.params?.protocolVersion || DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        }));
        return;
      case 'notifications/initialized':
      case 'initialized':
        res.status(204).send();
        return;
      case 'ping':
        res.json(jsonRpcSuccess(id, {}));
        return;
      case 'tools/list':
        if (!token) {
          res.status(401).set('WWW-Authenticate', `Bearer resource_metadata="${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`).json(jsonRpcError(id, -32001, 'Unauthorized'));
          return;
        }
        res.json(jsonRpcSuccess(id, { tools: toolDefinitionsWithLegacyAliases }));
        return;
      case 'tools/call': {
        if (!token) {
          res.status(401).set('WWW-Authenticate', `Bearer resource_metadata="${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`).json(jsonRpcError(id, -32001, 'Unauthorized'));
          return;
        }
        const toolName = message?.params?.name;
        if (typeof toolName !== 'string') {
          res.status(400).json(jsonRpcError(id, -32602, 'Invalid params: missing tool name'));
          return;
        }
        const result = await handleToolCall(token, toolName, message?.params?.arguments);
        res.json(jsonRpcSuccess(id, result));
        return;
      }
      case 'shutdown':
        res.json(jsonRpcSuccess(id, {}));
        return;
      default:
        res.status(404).json(jsonRpcError(id, -32601, `Method not found: ${method}`));
    }
  } catch (error) {
    res.status(500).json(jsonRpcError(id, -32603, error?.message || String(error), error?.body));
  }
});

app.listen(MCP_PORT, '0.0.0.0', () => {
  console.log(`${SERVER_NAME}@${SERVER_VERSION} listening on :${MCP_PORT}`);
  console.log(`HedgeDoc base URL: ${BASE_URL}`);
});
