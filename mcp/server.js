const { env, stdin, stdout, stderr, exit } = require('node:process');

const BASE_URL = (env.HEDGEDOC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let apiToken = env.HEDGEDOC_API_TOKEN || null;
const BOOTSTRAP_USERNAME = env.HEDGEDOC_USERNAME || null;
const BOOTSTRAP_PASSWORD = env.HEDGEDOC_PASSWORD || null;
const BOOTSTRAP_TOKEN_LABEL = env.HEDGEDOC_BOOTSTRAP_TOKEN_LABEL || 'spicomellus-mcp-auto';
const SERVER_NAME = 'spicomellus-mcp';
const SERVER_VERSION = '0.1.0';
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const DEBUG_ENABLED = /^(1|true|yes|on)$/i.test(env.HEDGEDOC_MCP_DEBUG || '');
const OUTPUT_MODE = (env.HEDGEDOC_MCP_OUTPUT_MODE || 'auto').toLowerCase(); // auto | framed | ndjson

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

let inputBuffer = Buffer.alloc(0);
let shuttingDown = false;
const noteCache = new Map();
let bootstrapPromise = null;
let negotiatedOutputMode = OUTPUT_MODE === 'framed' || OUTPUT_MODE === 'ndjson' ? OUTPUT_MODE : 'ndjson';

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function logDebug(message, data) {
  if (!DEBUG_ENABLED) {
    return;
  }
  const suffix = data === undefined ? '' : ` ${safeStringify(data)}`;
  stderr.write(`[${SERVER_NAME} debug] ${message}${suffix}\n`);
}

function writeMessage(message) {
  const payload = JSON.stringify(message);
  const mode = OUTPUT_MODE === 'auto' ? negotiatedOutputMode : OUTPUT_MODE;
  if (mode === 'framed') {
    stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
    return;
  }
  stdout.write(`${payload}\n`);
}

function ok(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  writeMessage({ jsonrpc: '2.0', id, error });
}

function notification(method, params) {
  writeMessage({ jsonrpc: '2.0', method, params });
}

function headersForJson() {
  if (!apiToken) {
    throw new Error(
      'No API token available. Set HEDGEDOC_API_TOKEN, or set HEDGEDOC_USERNAME/HEDGEDOC_PASSWORD for auto bootstrap.',
    );
  }
  return {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };
}

function buildUrl(path) {
  return `${BASE_URL}${path}`;
}

async function request(path, options = {}) {
  if (!apiToken) {
    await bootstrapApiToken();
  }
  const method = options.method || 'GET';
  const start = Date.now();
  logDebug('HTTP request start', { method, path });
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: {
      ...headersForJson(),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let body = text;
  if (text && contentType.includes('application/json')) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    logDebug('HTTP request failed', {
      method,
      path,
      status: response.status,
      durationMs: Date.now() - start,
    });
    throw error;
  }

  logDebug('HTTP request done', {
    method,
    path,
    status: response.status,
    durationMs: Date.now() - start,
  });

  return body;
}

function extractSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function mergeCookieJar(currentCookieHeader, setCookieHeaders) {
  const jar = new Map();
  if (currentCookieHeader) {
    for (const part of currentCookieHeader.split(';')) {
      const [rawName, ...rawValueParts] = part.trim().split('=');
      if (!rawName || rawValueParts.length === 0) {
        continue;
      }
      jar.set(rawName, rawValueParts.join('='));
    }
  }
  for (const setCookie of setCookieHeaders) {
    const firstPart = setCookie.split(';')[0];
    const eqIndex = firstPart.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const name = firstPart.slice(0, eqIndex).trim();
    const value = firstPart.slice(eqIndex + 1).trim();
    if (!name) {
      continue;
    }
    jar.set(name, value);
  }
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function fetchJsonWithSession(path, options = {}, cookieHeader = '') {
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  const setCookies = extractSetCookies(response.headers);
  const nextCookieHeader = mergeCookieJar(cookieHeader, setCookies);

  const text = await response.text();
  let body = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return { body, cookieHeader: nextCookieHeader };
}

async function bootstrapApiToken() {
  if (apiToken) {
    logDebug('Skip bootstrap', { hasToken: true, reason: 'token-already-present' });
    return;
  }

  if (bootstrapPromise) {
    logDebug('Await bootstrap in-flight');
    await bootstrapPromise;
    return;
  }

  bootstrapPromise = (async () => {
    logDebug('Bootstrap token start', { baseUrl: BASE_URL, tokenLabel: BOOTSTRAP_TOKEN_LABEL });

    if (!BOOTSTRAP_USERNAME || !BOOTSTRAP_PASSWORD) {
      throw new Error(
        'Missing credentials for token bootstrap. Provide HEDGEDOC_API_TOKEN or HEDGEDOC_USERNAME/HEDGEDOC_PASSWORD.',
      );
    }

    let cookieHeader = '';

    const csrfResponse = await fetchJsonWithSession('/api/private/csrf/token', {
      method: 'GET',
    }, cookieHeader);
    logDebug('Bootstrap step complete', { step: 'csrf-token' });
    cookieHeader = csrfResponse.cookieHeader;
    const csrfToken = csrfResponse.body && csrfResponse.body.token;
    if (typeof csrfToken !== 'string' || csrfToken.length === 0) {
      throw new Error('Failed to acquire CSRF token for bootstrap');
    }

    const loginResponse = await fetchJsonWithSession(
      '/api/private/auth/local/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'csrf-token': csrfToken,
        },
        body: JSON.stringify({ username: BOOTSTRAP_USERNAME, password: BOOTSTRAP_PASSWORD }),
      },
      cookieHeader,
    );
    logDebug('Bootstrap step complete', { step: 'local-login' });
    cookieHeader = loginResponse.cookieHeader;

    const tokenResponse = await fetchJsonWithSession(
      '/api/private/tokens',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'csrf-token': csrfToken,
        },
        body: JSON.stringify({ label: BOOTSTRAP_TOKEN_LABEL }),
      },
      cookieHeader,
    );
    logDebug('Bootstrap step complete', { step: 'create-api-token' });

    const secret = tokenResponse.body && tokenResponse.body.secret;
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new Error('Token bootstrap succeeded but no token secret was returned');
    }
    apiToken = secret;
    stderr.write('Bootstrapped API token via local auth\n');
    logDebug('Bootstrap token done');
  })();

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

async function getJson(path) {
  return await request(path, { method: 'GET' });
}

async function getText(path) {
  if (!apiToken) {
    await bootstrapApiToken();
  }
  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers: headersForJson(),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return text;
}

async function postJson(path, body) {
  return await request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function postMarkdown(path, body) {
  return await request(path, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'text/markdown',
    },
  });
}

async function putJson(path, body) {
  return await request(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function putMarkdown(path, body) {
  return await request(path, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': 'text/markdown',
    },
  });
}

async function deleteJson(path, body) {
  return await request(path, {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
}

async function postJsonWithFallback(paths, body) {
  let lastError = null;
  for (const path of paths) {
    try {
      if (lastError) {
        logDebug('Retry POST with fallback path', { path });
      }
      return await postJson(path, body);
    } catch (error) {
      if (error?.status === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('All POST fallback paths failed');
}

async function deleteJsonWithFallback(paths, body) {
  let lastError = null;
  for (const path of paths) {
    try {
      if (lastError) {
        logDebug('Retry DELETE with fallback path', { path });
      }
      return await deleteJson(path, body);
    } catch (error) {
      if (error?.status === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('All DELETE fallback paths failed');
}

async function requestPrivateJson(path, method, body) {
  if (!BOOTSTRAP_USERNAME || !BOOTSTRAP_PASSWORD) {
    throw new Error('Missing credentials for private API fallback');
  }

  let cookieHeader = '';
  const csrfResponse = await fetchJsonWithSession('/api/private/csrf/token', {
    method: 'GET',
  }, cookieHeader);
  cookieHeader = csrfResponse.cookieHeader;
  const csrfToken = csrfResponse.body && csrfResponse.body.token;
  if (typeof csrfToken !== 'string' || csrfToken.length === 0) {
    throw new Error('Failed to acquire CSRF token for private API fallback');
  }

  const loginResponse = await fetchJsonWithSession(
    '/api/private/auth/local/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: BOOTSTRAP_USERNAME, password: BOOTSTRAP_PASSWORD }),
    },
    cookieHeader,
  );
  cookieHeader = loginResponse.cookieHeader;

  const response = await fetchJsonWithSession(
    path,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'csrf-token': csrfToken,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    cookieHeader,
  );
  return response.body;
}

async function getPrivateJson(path) {
  return await requestPrivateJson(path, 'GET');
}

async function postJsonWithPrivateFallback(paths, body) {
  try {
    return await postJsonWithFallback(paths, body);
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }
  }

  const privatePath = paths[0].replace('/api/v2/', '/api/private/');
  logDebug('Retry POST with private API fallback', { privatePath });
  return await requestPrivateJson(privatePath, 'POST', body);
}

async function deleteJsonWithPrivateFallback(paths, body) {
  try {
    return await deleteJsonWithFallback(paths, body);
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }
  }

  const privatePath = paths[0].replace('/api/v2/', '/api/private/');
  logDebug('Retry DELETE with private API fallback', { privatePath });
  return await requestPrivateJson(privatePath, 'DELETE', body);
}

async function getJsonOrDefault(path, defaultValue) {
  try {
    return await getJson(path);
  } catch (error) {
    if (error?.status === 404) {
      logDebug('Optional endpoint missing, use default JSON value', { path });
      return defaultValue;
    }
    throw error;
  }
}

async function getJsonWithPrivateFallback(path) {
  try {
    return await getJson(path);
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }
  }

  const privatePath = path.replace('/api/v2/', '/api/private/');
  logDebug('Retry GET with private API fallback', { privatePath });
  return await getPrivateJson(privatePath);
}

async function getJsonWithPrivateFallbackOrDefault(path, defaultValue) {
  try {
    return await getJsonWithPrivateFallback(path);
  } catch (error) {
    if (error?.status === 404) {
      logDebug('Optional endpoint missing on both public/private API, use default JSON value', { path });
      return defaultValue;
    }
    throw error;
  }
}

function normalizeLinkRecord(link) {
  if (!link || typeof link !== 'object') {
    return null;
  }

  const sourceCardKey = link.sourceCardKey ?? link.source_card_key;
  const targetCardKey = link.targetCardKey ?? link.target_card_key;
  const edgeType = link.edgeType ?? link.edge_type;
  const noteId = link.noteId ?? link.note_id;
  const createdAt = link.createdAt ?? link.created_at;

  return {
    ...link,
    sourceCardKey,
    targetCardKey,
    edgeType,
    noteId,
    createdAt,
  };
}

function normalizeLinkRecords(links) {
  if (!Array.isArray(links)) {
    return [];
  }
  return links
    .map((link) => normalizeLinkRecord(link))
    .filter((link) => link !== null);
}

async function getTextOrDefault(path, defaultValue) {
  try {
    return await getText(path);
  } catch (error) {
    if (error?.status === 404) {
      logDebug('Optional endpoint missing, use default text value', { path });
      return defaultValue;
    }
    throw error;
  }
}

function buildGraphFromLinks(links) {
  const cardsById = new Map();
  const edges = [];
  const edgeKeys = new Set();

  for (const link of normalizeLinkRecords(links)) {
    const source = link?.sourceCardKey;
    const target = link?.targetCardKey;
    const edgeType = link?.edgeType;
    if (typeof source !== 'string' || source.length === 0 || typeof target !== 'string' || target.length === 0) {
      continue;
    }

    if (!cardsById.has(source)) {
      cardsById.set(source, { id: source, title: source, body: '' });
    }
    if (!cardsById.has(target)) {
      cardsById.set(target, { id: target, title: target, body: '' });
    }

    const edgeKey = `${source}::${target}::${edgeType ?? 'unknown'}`;
    if (edgeKeys.has(edgeKey)) {
      continue;
    }
    edgeKeys.add(edgeKey);
    edges.push({ source, target, edgeType });
  }

  return {
    cards: Array.from(cardsById.values()),
    edges,
  };
}

async function fetchNoteBundle(alias) {
  if (noteCache.has(alias)) {
    return noteCache.get(alias);
  }

  try {
    const encodedAlias = encodeURIComponent(alias);
    const note = await getJsonWithPrivateFallback(`/api/v2/notes/${encodedAlias}`);
    const [metadata, content, graph, links, backlinks] = await Promise.all([
      getJsonWithPrivateFallbackOrDefault(`/api/v2/notes/${encodedAlias}/metadata`, {}),
      getTextOrDefault(`/api/v2/notes/${encodedAlias}/content`, ''),
      getJsonWithPrivateFallbackOrDefault(`/api/v2/notes/${encodedAlias}/graph?depth=1`, { cards: [], edges: [] }),
      getJsonWithPrivateFallbackOrDefault(`/api/v2/notes/${encodedAlias}/links`, []),
      getJsonWithPrivateFallbackOrDefault(`/api/v2/notes/${encodedAlias}/cross-backlinks/aliases`, []),
    ]);

    const bundle = {
      alias,
      note,
      metadata,
      content,
      graph,
      links: normalizeLinkRecords(links),
      backlinks,
    };
    noteCache.set(alias, bundle);
    return bundle;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

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

function normalizeArgs(args) {
  return args && typeof args === 'object' ? args : {};
}

async function handleToolCall(name, args) {
  const normalizedName = LEGACY_TOOL_ALIASES[name] || name;
  const input = normalizeArgs(args);
  logDebug('Tool call start', { name, normalizedName });

  switch (normalizedName) {
    case 'note_create': {
      if (typeof input.content !== 'string') {
        throw new Error('content is required');
      }
      const path = input.alias
        ? `/api/v2/notes/${encodeURIComponent(input.alias)}`
        : '/api/v2/notes';
      const created = input.alias
        ? await postMarkdown(path, input.content)
        : await postMarkdown(path, input.content);
      if (typeof input.alias === 'string' && input.alias.length > 0) {
        noteCache.delete(input.alias);
      }
      if (created && typeof created.alias === 'string' && created.alias.length > 0) {
        noteCache.delete(created.alias);
      }
      return toTextResult({ created });
    }
    case 'note_update': {
      if (typeof input.alias !== 'string' || typeof input.content !== 'string') {
        throw new Error('alias and content are required');
      }
      const updated = await putMarkdown(`/api/v2/notes/${encodeURIComponent(input.alias)}`, input.content);
      noteCache.delete(input.alias);
      return toTextResult({ updated });
    }
    case 'note_delete': {
      if (typeof input.alias !== 'string') {
        throw new Error('alias is required');
      }
      await deleteJson(`/api/v2/notes/${encodeURIComponent(input.alias)}`, {
        keepMedia: Boolean(input.keepMedia),
      });
      noteCache.delete(input.alias);
      return toTextResult({ deleted: true, alias: input.alias, keepMedia: Boolean(input.keepMedia) });
    }
    case 'note_list_all': {
      const notes = await getJsonOrDefault('/api/v2/me/notes', []);
      if (!Array.isArray(notes)) {
        throw new Error('Unexpected response from /api/v2/me/notes');
      }

      const aliases = Array.from(
        new Set(
          notes
            .map((note) => {
              if (typeof note?.primaryAlias === 'string' && note.primaryAlias.length > 0) {
                return note.primaryAlias;
              }
              if (Array.isArray(note?.aliases)) {
                const alias = note.aliases.find((candidate) => typeof candidate === 'string' && candidate.length > 0);
                if (alias) {
                  return alias;
                }
              }
              return typeof note?.alias === 'string' ? note.alias : null;
            })
            .filter((alias) => typeof alias === 'string' && alias.length > 0),
        ),
      );

      return toTextResult({
        count: notes.length,
        aliasCount: aliases.length,
        aliases,
        notes,
      });
    }
    case 'note_get': {
      if (typeof input.alias !== 'string') {
        throw new Error('alias is required');
      }
      const bundle = await fetchNoteBundle(input.alias);
      if (!bundle) {
        throw new Error(`Note not found: ${input.alias}`);
      }
      return toTextResult(bundle);
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
      const encodedAlias = encodeURIComponent(input.alias);
      const graph = await getJsonWithPrivateFallbackOrDefault(
        `/api/v2/notes/${encodedAlias}/graph?${params.toString()}`,
        { cards: [], edges: [] },
      );

      const cardCount = Array.isArray(graph?.cards) ? graph.cards.length : 0;
      const edgeCount = Array.isArray(graph?.edges) ? graph.edges.length : 0;
      if (cardCount === 0 && edgeCount === 0) {
        const links = await getJsonWithPrivateFallbackOrDefault(`/api/v2/notes/${encodedAlias}/links`, []);
        const fallbackGraph = buildGraphFromLinks(links);
        if (fallbackGraph.edges.length > 0) {
          return toTextResult({ alias: input.alias, graph: fallbackGraph, derivedFrom: 'links' });
        }
      }

      return toTextResult({ alias: input.alias, graph });
    }
    case 'note_link_create': {
      if (typeof input.alias !== 'string' || typeof input.targetAlias !== 'string' || typeof input.edgeType !== 'string') {
        throw new Error('alias, targetAlias, and edgeType are required');
      }
      const encodedAlias = encodeURIComponent(input.alias);
      await postJsonWithPrivateFallback(
        [
          `/api/v2/notes/${encodedAlias}/note-links`,
          `/api/v2/notes/${encodedAlias}/links`,
        ],
        {
          targetAlias: input.targetAlias,
          edgeType: input.edgeType,
        },
      );
      noteCache.delete(input.alias);
      noteCache.delete(input.targetAlias);
      return toTextResult({ created: true, alias: input.alias, targetAlias: input.targetAlias, edgeType: input.edgeType });
    }
    case 'note_link_delete': {
      if (typeof input.alias !== 'string' || typeof input.targetAlias !== 'string') {
        throw new Error('alias and targetAlias are required');
      }
      const encodedAlias = encodeURIComponent(input.alias);
      const encodedTargetAlias = encodeURIComponent(input.targetAlias);
      await deleteJsonWithPrivateFallback(
        [
          `/api/v2/notes/${encodedAlias}/note-links/${encodedTargetAlias}`,
          `/api/v2/notes/${encodedAlias}/links/${encodedTargetAlias}`,
        ],
        {},
      );
      noteCache.delete(input.alias);
      noteCache.delete(input.targetAlias);
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
      const relationKeys = new Set();

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current.alias)) {
          continue;
        }
        visited.add(current.alias);

        const bundle = await fetchNoteBundle(current.alias);
        if (!bundle) {
          continue;
        }

        notes.push(bundle);

        for (const link of bundle.links || []) {
          const targetAlias = link.targetCardKey;
          if (typeof targetAlias !== 'string' || !targetAlias) {
            continue;
          }
          const targetBundle = await fetchNoteBundle(targetAlias);
          if (!targetBundle) {
            continue;
          }
          const relationKey = `${bundle.alias}::${targetAlias}::${link.edgeType ?? 'unknown'}::outgoing`;
          if (!relationKeys.has(relationKey)) {
            relationKeys.add(relationKey);
            relations.push({
              direction: 'outgoing',
              sourceAlias: bundle.alias,
              targetAlias,
              edgeType: link.edgeType,
              sourceCardKey: link.sourceCardKey,
              targetCardKey: link.targetCardKey,
            });
          }
          if (current.depth < maxDepth && !visited.has(targetAlias)) {
            queue.push({ alias: targetAlias, depth: current.depth + 1 });
          }
        }

        for (const sourceAlias of bundle.backlinks || []) {
          if (typeof sourceAlias !== 'string' || !sourceAlias) {
            continue;
          }
          const sourceBundle = await fetchNoteBundle(sourceAlias);
          if (!sourceBundle) {
            continue;
          }
          const relationKey = `${sourceAlias}::${bundle.alias}::backlink`;
          if (!relationKeys.has(relationKey)) {
            relationKeys.add(relationKey);
            relations.push({
              direction: 'backlink',
              sourceAlias,
              targetAlias: bundle.alias,
            });
          }
          if (current.depth < maxDepth && !visited.has(sourceAlias)) {
            queue.push({ alias: sourceAlias, depth: current.depth + 1 });
          }
        }
      }

      return toTextResult({
        rootAlias: input.rootAlias,
        maxDepth,
        noteCount: notes.length,
        relationCount: relations.length,
        notes,
        relations,
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function toolListResult() {
  return { tools: toolDefinitionsWithLegacyAliases };
}

async function handleRequest(message) {
  const { id, method, params } = message;
  logDebug('JSON-RPC request', { id, method });

  try {
    switch (method) {
      case 'initialize': {
        logDebug('Initialize request params', {
          protocolVersion: params?.protocolVersion,
        });
        ok(id, {
          protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        });
        return;
      }
      case 'notifications/initialized':
      case 'initialized':
        return;
      case 'ping':
        ok(id, {});
        return;
      case 'tools/list':
        ok(id, toolListResult());
        return;
      case 'tools/call': {
        const toolName = params?.name;
        if (typeof toolName !== 'string') {
          fail(id, -32602, 'Invalid params: missing tool name');
          return;
        }
        logDebug('Dispatch tool', { id, toolName });
        const result = await handleToolCall(toolName, params?.arguments);
        ok(id, result);
        logDebug('Tool done', { id, toolName });
        return;
      }
      case 'shutdown':
        ok(id, {});
        shuttingDown = true;
        return;
      default:
        if (id !== undefined && id !== null) {
          fail(id, -32601, `Method not found: ${method}`);
        }
    }
  } catch (error) {
    const messageText = error?.message || String(error);
    logDebug('Request failed', {
      id,
      method,
      message: messageText,
      status: error?.status,
    });
    if (id !== undefined && id !== null) {
      fail(id, error?.status && Number.isInteger(error.status) ? -32000 : -32603, messageText, error?.body);
    } else {
      stderr.write(`${messageText}\n`);
    }
  }
}

function processBuffer() {
  while (true) {
    const headerEndCRLF = inputBuffer.indexOf('\r\n\r\n');
    const headerEndLF = inputBuffer.indexOf('\n\n');

    let headerEnd = -1;
    let separatorLength = 0;
    if (headerEndCRLF !== -1 && (headerEndLF === -1 || headerEndCRLF <= headerEndLF)) {
      headerEnd = headerEndCRLF;
      separatorLength = 4;
    } else if (headerEndLF !== -1) {
      headerEnd = headerEndLF;
      separatorLength = 2;
    }

    if (headerEnd === -1) {
      if (inputBuffer.length === 0) {
        return;
      }

      const textBuffer = inputBuffer.toString('utf8');
      if (textBuffer.includes('\n')) {
        const normalized = textBuffer.replace(/\r\n/g, '\n');
        const endsWithNewline = normalized.endsWith('\n');
        const lines = normalized.split('\n');
        const pending = endsWithNewline ? '' : lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          try {
            const ndjsonMessage = JSON.parse(trimmed);
            if (OUTPUT_MODE === 'auto') {
              negotiatedOutputMode = 'ndjson';
            }
            logDebug('Parsed NDJSON message', { negotiatedOutputMode });
            void handleRequest(ndjsonMessage);
          } catch (error) {
            logDebug('Failed to parse NDJSON line', {
              error: error?.message || String(error),
              linePreview: trimmed.slice(0, 160),
            });
          }
        }

        inputBuffer = Buffer.from(pending, 'utf8');
        continue;
      }

      const preview = inputBuffer
        .slice(0, 160)
        .toString('utf8')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
      logDebug('No header separator yet', { bytes: inputBuffer.length, preview });

      const rawText = inputBuffer.toString('utf8').trim();
      if (rawText.startsWith('{') || rawText.startsWith('[')) {
        try {
          const rawMessage = JSON.parse(rawText);
          if (OUTPUT_MODE === 'auto') {
            negotiatedOutputMode = 'ndjson';
          }
          logDebug('Parsed raw JSON-RPC message without Content-Length', {
            bytes: inputBuffer.length,
            negotiatedOutputMode,
          });
          inputBuffer = Buffer.alloc(0);
          void handleRequest(rawMessage);
          continue;
        } catch {
          // wait for more data
        }
      }
      return;
    }

    const headerText = inputBuffer.slice(0, headerEnd).toString('utf8');
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      logDebug('Drop frame without Content-Length', { headerText });
      inputBuffer = inputBuffer.slice(headerEnd + separatorLength);
      continue;
    }

    const contentLength = Number(match[1]);
    const totalLength = headerEnd + separatorLength + contentLength;
    if (OUTPUT_MODE === 'auto') {
      negotiatedOutputMode = 'framed';
    }
    logDebug('Frame header parsed', {
      separatorLength,
      contentLength,
      bufferedBytes: inputBuffer.length,
      negotiatedOutputMode,
    });
    if (inputBuffer.length < totalLength) {
      logDebug('Waiting for remaining frame body', {
        needBytes: totalLength,
        bufferedBytes: inputBuffer.length,
      });
      return;
    }

    const body = inputBuffer.slice(headerEnd + separatorLength, totalLength).toString('utf8');
    inputBuffer = inputBuffer.slice(totalLength);

    let message;
    try {
      message = JSON.parse(body);
    } catch (error) {
      stderr.write(`Failed to parse JSON-RPC message: ${error.message}\n`);
      logDebug('JSON parse failed', { error: error.message });
      continue;
    }

    void handleRequest(message);
  }
}

stdin.on('data', (chunk) => {
  logDebug('stdin data', { bytes: chunk.length });
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processBuffer();
});

stdin.on('end', () => {
  if (shuttingDown) {
    exit(0);
  }
});

process.on('SIGINT', () => exit(0));
process.on('SIGTERM', () => exit(0));

logDebug('Server started', {
  version: SERVER_VERSION,
  baseUrl: BASE_URL,
  hasApiToken: Boolean(apiToken),
  hasBootstrapCredentials: Boolean(BOOTSTRAP_USERNAME && BOOTSTRAP_PASSWORD),
  outputMode: OUTPUT_MODE,
  negotiatedOutputMode,
});
