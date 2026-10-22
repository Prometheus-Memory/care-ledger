// One small Node server:
//   POST /mcp           MCP over Streamable HTTP (stateless, JSON responses)
//   POST /api/understand  sentence -> intent (Bedrock if configured, rules otherwise); keys stay here
//   GET  /               the web simulator
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Ledger } from './ledger.js';
import { JsonStore } from './store/json.js';
import { buildMcpServer } from './mcp.js';
import { understand } from './brain.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function makeStore() {
  if (process.env.CARE_STORE === 'dynamo') {
    const { DynamoStore } = await import('./store/dynamo.js');
    return new DynamoStore({ table: process.env.CARE_TABLE || 'care-ledger', household: process.env.CARE_HOUSEHOLD || 'demo' });
  }
  return new JsonStore(process.env.CARE_DATA || path.join(root, 'data', 'ledger.jsonl'));
}

const CORS = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
  Vary: 'Origin',
};

// MCP transport rule: validate Origin on every request. Allowed: no Origin (curl, server-side clients),
// the page's own origin on a loopback host, or an origin listed in CARE_ORIGINS (comma separated).
// Anything else gets 403 and no data. This is the browser fence only; a real deployment adds auth per household.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function originAllowed(origin, host, extra = process.env.CARE_ORIGINS) {
  if (!origin) return true;
  const listed = String(extra || '').split(',').map(s => s.trim()).filter(Boolean);
  if (listed.includes(origin)) return true;
  try {
    const o = new URL(origin);
    return LOOPBACK.has(o.hostname) && o.host === host;
  } catch {
    return false;
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function createApp(ledger) {
  return async (req, res) => {
    const origin = req.headers.origin;
    if (!originAllowed(origin, req.headers.host)) return json(res, 403, { error: 'origin not allowed' });
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname === '/mcp') return await handleMcp(ledger, req, res);
      if (url.pathname === '/api/understand' && req.method === 'POST') {
        const { text } = JSON.parse(await readBody(req) || '{}');
        return json(res, 200, await understand(String(text || '')));
      }
      if (url.pathname === '/api/config') {
        return json(res, 200, { brain: process.env.BEDROCK_MODEL_ID ? 'bedrock' : 'rules' });
      }
      if (req.method === 'GET') return serveStatic(url.pathname, res);
      json(res, 404, { error: 'not found' });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: err.message });
    }
  };
}

async function handleMcp(ledger, req, res) {
  if (req.method !== 'POST') return json(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server)' }, id: null });
  const body = JSON.parse(await readBody(req));
  // Stateless mode: a fresh server and transport per request, the ledger is the only state.
  const server = buildMcpServer(ledger);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.join(root, 'web', path.normalize(rel));
  if (!file.startsWith(path.join(root, 'web')) || !fs.existsSync(file)) return json(res, 404, { error: 'not found' });
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ledger = new Ledger(await makeStore());
  const port = Number(process.env.PORT || 8787);
  const host = process.env.CARE_HOST || '127.0.0.1';
  http.createServer(createApp(ledger)).listen(port, host, () => {
    console.log(`Care Ledger on http://${host}:${port}  (MCP endpoint: /mcp, brain: ${process.env.BEDROCK_MODEL_ID ? 'Bedrock ' + process.env.BEDROCK_MODEL_ID : 'rules'})`);
  });
}
