// One test per issue raised in the pre-submission review (numbers match the review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { Ledger } from '../src/ledger.js';
import { MemoryStore, JsonStore } from '../src/store/json.js';
import { parseByRules } from '../src/brain.js';
import { sayLogged } from '../web/voice.js';
import { scrubNodes } from '../web/scrub.js';
import { MED_RULES, DEFAULT_MED_RULE } from '../src/rules.js';

const day = (hm, d = 22) => `2026-10-${d}T${hm}:00.000Z`;
const bp = (who, at, extra = {}) => ({ who, text: `${who} says bp pill`, kind: 'med', item: 'blood pressure pill', at, ...extra });
const make = (now = day('20:00'), store = new MemoryStore()) => ({ store, ledger: new Ledger(store, { now: () => new Date(now) }) });

async function withServer(fn) {
  const server = http.createServer(createApp(new Ledger(new MemoryStore())));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

const initBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
const mcpHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

test('1: a foreign Origin is refused with 403 and gets no care data', async () => {
  await withServer(async url => {
    const res = await fetch(`${url}/mcp`, { method: 'POST', headers: { ...mcpHeaders, Origin: 'https://untrusted.example' }, body: initBody });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    const api = await fetch(`${url}/api/understand`, { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: '{"text":"hi"}' });
    assert.equal(api.status, 403);
  });
});

test('1: the page\'s own Origin and no-Origin clients are allowed', async () => {
  await withServer(async url => {
    const own = await fetch(`${url}/mcp`, { method: 'POST', headers: { ...mcpHeaders, Origin: url }, body: initBody });
    assert.equal(own.status, 200);
    assert.equal(own.headers.get('access-control-allow-origin'), url);
    const curl = await fetch(`${url}/mcp`, { method: 'POST', headers: mcpHeaders, body: initBody });
    assert.equal(curl.status, 200);
  });
});

test('1: the server binds to loopback by default', async () => {
  const src = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(src, /CARE_HOST \|\| '127\.0\.0\.1'/);
});

test('2: a future or hypothetical dose is held as unconfirmed, not logged as given', () => {
  for (const s of ['I will give Dad his blood pressure pill tomorrow', "I'm going to give Mom her metformin", 'If he wakes up I should give Dad his pill']) {
    const r = parseByRules(s);
    assert.equal(r.intent, 'log', s);
    assert.equal(r.tentative, true, s);
  }
});

test('2: the person cared for is taken from the sentence', () => {
  assert.equal(parseByRules('I gave Mom her metformin').subject, 'Mom');
  assert.equal(parseByRules('I gave Grandma her eye drops').subject, 'Grandma');
});

test('2: an unknown medicine is not lumped under "medicine"; it is held for a check', () => {
  const r = parseByRules('I gave Dad his lisinopril pill');
  assert.equal(r.tentative, true);
  assert.notEqual(r.item, 'medicine');
});

test('3: a correction that turns a refusal into "given" passes the repeat check', async () => {
  const { ledger } = make(day('09:01'));
  await ledger.logEvent(bp('Minji', day('08:00')));
  const refused = await ledger.logEvent(bp('Joon', day('09:00'), { status: 'refused' }));
  const fix = { who: 'Joon', text: 'actually he took it', kind: 'correction', corrects: refused.event.id, status: 'given', at: day('09:01') };
  const held = await ledger.logEvent(fix);
  assert.equal(held.logged, false);
  assert.equal(held.needsConfirmation, true);
  const ok = await ledger.logEvent({ ...fix, confirmRepeat: true });
  assert.equal(ok.logged, true);
  const card = await ledger.handoff({ since: day('00:00') });
  assert.ok(card.open.some(o => /blood pressure pill/.test(o)), JSON.stringify(card.open));
});

test('3: handoff warns about two effective "given" records inside the check window', async () => {
  const { ledger, store } = make(day('12:00'));
  await ledger.logEvent(bp('Minji', day('08:00')));
  // Written straight to the store, bypassing the guard (e.g. an older client).
  await store.append({ id: 'x1', seq: 99, at: day('09:00'), recordedAt: day('09:00'), who: 'Joon', kind: 'med', subject: 'Dad', item: 'blood pressure pill', status: 'given', text: 'gave bp' });
  const card = await ledger.handoff({ since: day('00:00') });
  assert.ok(card.open.some(o => /Two "given" records/.test(o)), JSON.stringify(card.open));
});

for (const [name, mk] of [
  ['MemoryStore', () => new MemoryStore()],
  ['JsonStore', () => new JsonStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'care-')), 'l.jsonl'))],
]) {
  test(`4: two simultaneous doses on one ledger: one logged, one held (${name})`, async () => {
    const { ledger } = make(day('08:05'), mk());
    const [a, b] = await Promise.all([ledger.logEvent(bp('Minji', day('08:04'))), ledger.logEvent(bp('Joon', day('08:04')))]);
    assert.deepEqual([a.logged, b.logged].sort(), [false, true]);
    const seqs = (await ledger.all()).map(e => e.seq);
    assert.equal(new Set(seqs).size, seqs.length);
  });
}

test('4: two ledgers on one store (two servers): a seq clash is retried and re-checked', async () => {
  const store = new MemoryStore();
  const one = new Ledger(store, { now: () => new Date(day('08:05')) });
  const two = new Ledger(store, { now: () => new Date(day('08:05')) });
  const [a, b] = await Promise.all([one.logEvent(bp('Minji', day('08:04'))), two.logEvent(bp('Joon', day('08:04')))]);
  assert.deepEqual([a.logged, b.logged].sort(), [false, true]);
  assert.equal((await store.list()).length, 1);
});

test('5: forget scrubs the words from chat bubbles and the MCP log on screen', () => {
  const nodes = [{ textContent: 'Minji: I gave Dad his pill' }, { textContent: '{"said":"I gave Dad his pill"}' }, { textContent: 'Dad ate lunch' }];
  assert.equal(scrubNodes(nodes, 'I gave Dad his pill'), 2);
  assert.deepEqual(nodes.map(n => n.textContent), ['Minji: [forgotten]', '{"said":"[forgotten]"}', 'Dad ate lunch']);
});

test('5: the README says what metadata a forgotten event keeps', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /What "forget" keeps/);
});

test('6: no dosing claims: the check window is a sample-ledger setting', async () => {
  for (const r of [...Object.values(MED_RULES), DEFAULT_MED_RULE]) assert.doesNotMatch(r.label, /once a day|twice a day|every|at most/);
  const { ledger } = make();
  await ledger.logEvent(bp('Minji', day('08:04')));
  const held = await ledger.logEvent(bp('Joon', day('19:10')));
  assert.equal(held.check.nextAllowedAt, undefined);
  const said = sayLogged(held, 'UTC');
  assert.doesNotMatch(said, /usually/);
  assert.match(said, /already/);
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(readme, /stops the double dose/);
});

test('7: AWS proof and demo script tell the truth', () => {
  const proof = fs.readFileSync(new URL('../docs/aws-proof.md', import.meta.url), 'utf8');
  assert.match(proof, /bedrock:/);
  assert.doesNotMatch(proof, /AKIA|ASIA|\b\d{12}\b/);
  const demo = fs.readFileSync(new URL('../DEMO_SCRIPT.md', import.meta.url), 'utf8');
  assert.doesNotMatch(demo, /Events live in DynamoDB/);
});

test('8: asOf ignores corrections made after that time', async () => {
  const { ledger } = make(day('11:00'));
  const first = await ledger.logEvent(bp('Minji', day('08:00')));
  await ledger.logEvent({ who: 'Minji', text: 'actually no', kind: 'correction', corrects: first.event.id, status: 'not_given', at: day('10:00') });
  assert.equal((await ledger.getStatus({ asOf: day('09:00') })).items[0].status, 'given');
  assert.equal((await ledger.getStatus({ asOf: day('10:30') })).items[0].status, 'not_given');
});

test('9: package-lock matches package.json (MIT, pinned versions)', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')).packages[''];
  assert.equal(lock.license, 'MIT');
  assert.deepEqual(lock.dependencies, pkg.dependencies);
  for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/);
});

test('11: product feedback draft exists with every section', () => {
  const fb = fs.readFileSync(new URL('../docs/product-feedback.md', import.meta.url), 'utf8');
  for (const h of ['Used for', 'Worked well', 'Could be better', 'Onboarding', 'Would use again']) assert.match(fb, new RegExp(h));
});

test('voice: /speak refuses an unknown voice and /api/config lists the Polly candidates', async () => {
  await withServer(async url => {
    const cfg = await (await fetch(`${url}/api/config`)).json();
    assert.deepEqual(cfg.polly.voices, ['Joanna', 'Ruth', 'Danielle', 'Matthew', 'Stephen']);
    assert.ok(['Joanna', 'Ruth'].includes(cfg.polly.default));
    const bad = await fetch(`${url}/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hi', voice: 'Nobody' }) });
    assert.equal(bad.status, 400);
    const empty = await fetch(`${url}/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '' }) });
    assert.equal(empty.status, 400);
  });
});
