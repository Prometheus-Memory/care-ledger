import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.js';
import { MemoryStore } from '../src/store/json.js';
import { sayStatus, sayLogged, sayHandoff } from '../web/voice.js';

const TZ = 'UTC';
const day = (hm, d = 22) => `2026-10-${d}T${hm}:00.000Z`;

function make(nowIso = day('20:00')) {
  const now = new Date(nowIso);
  const store = new MemoryStore();
  return { store, ledger: new Ledger(store, { now: () => now }) };
}

const bp = (who, at, extra = {}) => ({ who, text: `${who} says bp pill`, kind: 'med', item: 'blood pressure pill', at, ...extra });

test('guard: a second dose inside the window is held, nothing written', async () => {
  const { ledger, store } = make();
  assert.equal((await ledger.logEvent(bp('Minji', day('08:04')))).logged, true);
  const second = await ledger.logEvent(bp('Joon', day('19:10')));
  assert.equal(second.logged, false);
  assert.equal(second.needsConfirmation, true);
  assert.equal(second.check.previous.who, 'Minji');
  assert.equal(second.check.hoursSince, 11.1);
  assert.equal((await store.list()).length, 1);
  assert.match(sayLogged(second, TZ), /Minji, 8:04 AM: "Minji says bp pill"/);
});

test('guard: a person can still confirm; the repeat is flagged', async () => {
  const { ledger, store } = make();
  await ledger.logEvent(bp('Minji', day('08:04')));
  const res = await ledger.logEvent(bp('Joon', day('19:10'), { confirmRepeat: true }));
  assert.equal(res.logged, true);
  assert.equal(res.event.override, 'confirmed-repeat');
  assert.equal((await store.list()).length, 2);
});

test('guard: boundaries come from the rule table (20 h for blood pressure pill)', async () => {
  const { ledger } = make();
  await ledger.logEvent(bp('Minji', day('08:04')));
  assert.equal((await ledger.checkRepeat({ item: 'blood pressure pill', at: day('04:03', 23) })).blocked, true);
  assert.equal((await ledger.checkRepeat({ item: 'blood pressure pill', at: day('04:04', 23) })).blocked, false);
  assert.equal((await ledger.checkRepeat({ item: 'eye drops', at: day('09:00') })).blocked, false);
});

test('guard: not_given and refused never block', async () => {
  const { ledger } = make();
  await ledger.logEvent(bp('Minji', day('08:04'), { status: 'refused' }));
  assert.equal((await ledger.checkRepeat({ item: 'blood pressure pill', at: day('09:00') })).blocked, false);
});

test('evidence: the answer ends with who, when and the exact words', async () => {
  const { ledger } = make();
  await ledger.logEvent({ ...bp('Minji', day('08:04')), text: 'I gave Dad his blood pressure pill' });
  const status = await ledger.getStatus({ item: 'blood pressure pill' });
  assert.equal(status.items[0].status, 'given');
  assert.equal(
    sayStatus(status, 'blood pressure pill', TZ),
    'He did — 8:04 AM this morning. Minji logged it: "I gave Dad his blood pressure pill"',
  );
});

test('conflict: two people disagree, both are told, nothing is decided', async () => {
  const { ledger } = make();
  await ledger.logEvent(bp('Minji', day('08:04')));
  await ledger.logEvent(bp('Joon', day('09:30'), { status: 'not_given' }));
  const status = await ledger.getStatus({});
  assert.equal(status.items[0].status, 'conflict');
  assert.equal(status.items[0].evidence.length, 2);
  const said = sayStatus(status, undefined, TZ);
  assert.match(said, /Minji, 8:04 AM/);
  assert.match(said, /Joon, 9:30 AM/);
  assert.match(said, /\?/);
  assert.doesNotMatch(said, /^Yes/);
});

test('append-only: a correction adds an event and keeps the original words', async () => {
  const { ledger, store } = make();
  const first = await ledger.logEvent(bp('Minji', day('08:04')));
  await ledger.logEvent({ who: 'Minji', text: 'actually he spat it out', kind: 'correction', corrects: first.event.id, status: 'not_given', at: day('08:10') });
  const raw = await store.list();
  assert.equal(raw.length, 2);
  assert.equal(raw[0].text, 'Minji says bp pill');
  assert.equal(raw[0].status, 'given');
  const status = await ledger.getStatus({});
  assert.equal(status.items[0].status, 'not_given');
  assert.equal(status.items[0].evidence[0].correctedBy.said, 'actually he spat it out');
  assert.equal((await ledger.checkRepeat({ item: 'blood pressure pill', at: day('09:00') })).blocked, false);
});

test('forget: one forget event is added, words scrubbed, every answer excludes it', async () => {
  const { ledger, store } = make();
  const first = await ledger.logEvent(bp('Minji', day('08:04')));
  await ledger.logEvent({ who: 'Joon', text: 'Dad ate lunch', kind: 'meal', item: 'lunch', at: day('12:00') });
  assert.equal((await ledger.forget({ eventId: first.event.id, who: 'Minji' })).forgotten, true);
  const raw = await store.list();
  assert.equal(raw.length, 3);
  assert.equal(raw.find(e => e.id === first.event.id).text, '[forgotten]');
  assert.equal(raw.filter(e => e.text.includes('bp pill')).length, 0);
  assert.equal((await ledger.getStatus({})).items.length, 0);
  assert.equal((await ledger.checkRepeat({ item: 'blood pressure pill', at: day('13:00') })).blocked, false);
  const card = await ledger.handoff({ since: day('00:00') });
  assert.equal(card.count, 1);
  assert.equal(card.latest[0].said, 'Dad ate lunch');
});

test('handoff: three latest lines and open questions since a time', async () => {
  const { ledger } = make(day('09:00', 23));
  await ledger.logEvent(bp('Minji', day('08:04')));
  await ledger.logEvent(bp('Joon', day('19:10'), { confirmRepeat: true }));
  await ledger.logEvent({ who: 'Joon', text: 'Dad had soup for dinner', kind: 'meal', item: 'dinner', at: day('19:30') });
  await ledger.logEvent({ who: 'Joon', text: 'slept well', kind: 'note', at: day('22:00') });
  const card = await ledger.handoff({ since: day('00:00') });
  assert.equal(card.count, 4);
  assert.deepEqual(card.latest.map(e => e.said), ['slept well', 'Dad had soup for dinner', 'Joon says bp pill']);
  assert.deepEqual(card.open, ['Joon confirmed a repeat blood pressure pill']);
  assert.match(sayHandoff(card, TZ), /^Welcome back\. 4 updates/);
});

test('asOf: answers only see events up to the simulated time', async () => {
  const { ledger } = make(day('23:00'));
  await ledger.logEvent(bp('Minji', day('20:00')));
  assert.equal((await ledger.getStatus({ asOf: day('19:00') })).items.length, 0);
  assert.equal((await ledger.getStatus({ asOf: day('21:00') })).items.length, 1);
});
