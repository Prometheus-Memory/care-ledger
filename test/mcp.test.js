import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/server.js';
import { Ledger } from '../src/ledger.js';
import { MemoryStore } from '../src/store/json.js';

async function withServer(fn) {
  const server = http.createServer(createApp(new Ledger(new MemoryStore())));
  await new Promise(r => server.listen(0, r));
  try { await fn(`http://localhost:${server.address().port}`); } finally { server.close(); }
}

let id = 0;
async function rpc(url, method, params) {
  const res = await fetch(`${url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).result;
}

test('MCP over Streamable HTTP: initialize, tools/list, tools/call', async () => {
  await withServer(async url => {
    const init = await rpc(url, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.protocolVersion, '2025-11-25');
    assert.equal(init.serverInfo.name, 'care-ledger');
    const { tools } = await rpc(url, 'tools/list');
    assert.deepEqual(tools.map(t => t.name).sort(), ['check_repeat', 'forget', 'get_status', 'handoff', 'log_event']);
    const first = await rpc(url, 'tools/call', { name: 'log_event', arguments: { who: 'Minji', text: 'gave bp pill', kind: 'med', item: 'blood pressure pill', subject: 'Dad', at: '2026-10-22T08:04:00Z' } });
    assert.equal(first.structuredContent.logged, true);
    const again = await rpc(url, 'tools/call', { name: 'check_repeat', arguments: { item: 'blood pressure pill', at: '2026-10-22T19:10:00Z' } });
    assert.equal(again.structuredContent.blocked, true);
  });
});

test('CORS preflight allows the MCP headers a browser sends', async () => {
  await withServer(async url => {
    const res = await fetch(`${url}/mcp`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    const allow = res.headers.get('access-control-allow-headers');
    for (const h of ['Content-Type', 'MCP-Protocol-Version', 'Mcp-Session-Id']) assert.ok(allow.includes(h), h);
  });
});

test('the page and the understanding endpoint are served; no key in the page', async () => {
  await withServer(async url => {
    assert.match(await (await fetch(url)).text(), /Care Ledger/);
    assert.doesNotMatch(await (await fetch(`${url}/app.js`)).text(), /AKIA|aws_secret|BEDROCK/i);
    const intent = await (await fetch(`${url}/api/understand`, { method: 'POST', body: JSON.stringify({ text: 'Did Dad take his blood pressure pill?' }) })).json();
    assert.equal(intent.intent, 'ask');
  });
});
