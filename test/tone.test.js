// The voice: short, kind, fact first, the decision left to people — and never a stand-in for family.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ledger } from '../src/ledger.js';
import { MemoryStore, JsonStore } from '../src/store/json.js';
import { parseByRules } from '../src/brain.js';
import { sayStatus, sayLogged, sayHandoff, sayTentative, sayForgot, breaksTone, TONE } from '../web/voice.js';
import { seedDemo, resetDemo } from '../scripts/demo-data.mjs';

const TZ = 'UTC';
const day = (hm, d = 22) => `2026-10-${d}T${hm}:00.000Z`;
const make = () => new Ledger(new MemoryStore(), { now: () => new Date(day('20:00')) });

test('first scene: a person asks Mom, the answer is her own logged words', async () => {
  const ledger = make();
  await ledger.logEvent({ who: 'Me', kind: 'med', subject: 'Mom', item: 'blood pressure pill', status: 'given', at: day('08:04'), text: 'Mom took her blood pressure pill.' });
  const intent = parseByRules('…wait. Mom, did you take your blood pressure pill?');
  assert.deepEqual(intent, { intent: 'ask', item: 'blood pressure pill', subject: 'Mom' });
  const status = await ledger.getStatus({ item: intent.item, subject: intent.subject });
  assert.equal(sayStatus(status, intent.item, TZ, 'Me'),
    'She did — 8:04 AM this morning. You logged it yourself: "Mom took her blood pressure pill."');
});

test('tone: no reply uses pet names, acted feelings, family stand-ins or medical advice', async () => {
  const ledger = make();
  const bp = (who, at, extra = {}) => ({ who, text: `${who} says bp pill`, kind: 'med', item: 'blood pressure pill', at, ...extra });
  const first = await ledger.logEvent(bp('Minji', day('08:04')));
  const repeat = await ledger.logEvent(bp('Joon', day('19:10')));
  await ledger.logEvent(bp('Joon', day('09:30'), { item: 'metformin', status: 'not_given' }));
  await ledger.logEvent(bp('Minji', day('09:40'), { item: 'metformin' }));
  const status = await ledger.getStatus({});
  const replies = [
    sayLogged(first, TZ), sayLogged(repeat, TZ), sayStatus(status, undefined, TZ, 'Joon'),
    sayHandoff(await ledger.handoff({}), TZ), sayTentative({ reason: 'not_yet', subject: 'Dad' }),
    sayTentative({ reason: 'unknown_item', item: 'lisinopril' }), sayForgot({ forgotten: true }),
  ];
  for (const r of replies) assert.equal(breaksTone(r), false, r);
  assert.match(sayLogged(repeat, TZ), /Your call\.$/);
  // and the check itself catches what it should
  for (const bad of ['Of course, sweetie.', "I'm so worried about her.", 'As your mom, I say rest.', "It's safe to take another one.", 'You should double the dose.'])
    assert.equal(breaksTone(bad), true, bad);
  assert.ok(TONE.some(l => /Your call/.test(l)));
});

test('demo data: seed adds the 8:04 line once, reset empties the file', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'care-demo-')), 'ledger.jsonl');
  const store = new JsonStore(file);
  assert.equal((await seedDemo(store)).logged, true);
  assert.equal((await seedDemo(store)).logged, false);
  const [e] = await store.list();
  assert.equal(e.subject, 'Mom'); assert.equal(e.status, 'given');
  assert.equal(new Date(e.at).getHours(), 8); assert.equal(new Date(e.at).getMinutes(), 4);
  resetDemo(store);
  assert.equal((await store.list()).length, 0);
});
