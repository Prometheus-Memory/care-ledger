// The care ledger: an append-only list of events. Every answer is recomputed from the raw events,
// so a summary can never outrank what someone actually said.
import { randomUUID } from 'node:crypto';
import { ruleFor, normalizeItem } from './rules.js';

export const KINDS = ['med', 'meal', 'note', 'correction', 'forget'];
export const MED_STATUSES = ['given', 'not_given', 'refused'];

const HOUR = 3600_000;

export class Ledger {
  constructor(store, { now = () => new Date() } = {}) {
    this.store = store;
    this.now = now;
    this.queue = Promise.resolve();
  }

  // Writes on one ledger run one at a time: check → number → append is never interleaved.
  serial(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async all() {
    const events = await this.store.list();
    return events.sort((a, b) => a.seq - b.seq);
  }

  // Events that still count: forgotten ones drop out, corrected ones take the correction's status.
  // With asOf, only corrections made by then apply (a forget always applies: the words are gone).
  async effective({ asOf } = {}) {
    const cut = asOf ? new Date(asOf) : undefined;
    const events = await this.all();
    const forgotten = new Set(events.filter(e => e.kind === 'forget').map(e => e.forgets));
    const live = events.filter(e => !forgotten.has(e.id) && e.kind !== 'forget');
    const corrections = new Map();
    for (const e of live) if (e.kind === 'correction' && (!cut || new Date(e.at) <= cut)) corrections.set(e.corrects, e);
    return live
      .filter(e => e.kind !== 'correction')
      .map(e => {
        const c = corrections.get(e.id);
        return c ? { ...e, status: c.status, correctedBy: evidence(c) } : e;
      });
  }

  async append(fields) {
    const at = fields.at ? new Date(fields.at) : this.now();
    if (Number.isNaN(at.getTime())) throw new Error(`bad time: ${fields.at}`);
    const seq = (await this.store.maxSeq()) + 1;
    const event = {
      id: randomUUID().slice(0, 8),
      seq,
      at: at.toISOString(),
      recordedAt: this.now().toISOString(),
      who: required(fields.who, 'who'),
      kind: fields.kind,
      subject: fields.subject || 'Dad',
      item: fields.item ? normalizeItem(fields.item) : undefined,
      status: fields.status,
      text: required(fields.text, 'text'),
      corrects: fields.corrects,
      forgets: fields.forgets,
      override: fields.override || undefined,
    };
    if (!KINDS.includes(event.kind)) throw new Error(`unknown kind: ${event.kind}`);
    if (event.kind === 'med' && !MED_STATUSES.includes(event.status)) event.status = 'given';
    await this.store.append(stripUndefined(event));
    return event;
  }

  // The repeat check. Pure rule: same item, status "given", inside the sample ledger's check window.
  // It only asks "is this already in the log?" — it says nothing about when a dose is safe.
  async checkRepeat({ item, subject = 'Dad', at, exclude }) {
    const when = at ? new Date(at) : this.now();
    const rule = ruleFor(item);
    const key = normalizeItem(item);
    const given = (await this.effective())
      .filter(e => e.kind === 'med' && e.item === key && e.subject === subject && e.status === 'given' && e.id !== exclude)
      .filter(e => new Date(e.at) <= when)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    const last = given[0];
    if (!last) return { blocked: false, item: key, rule };
    const hoursSince = (when - new Date(last.at)) / HOUR;
    const blocked = hoursSince < rule.minHours;
    return {
      blocked,
      item: key,
      rule,
      hoursSince: Math.round(hoursSince * 10) / 10,
      previous: evidence(last),
    };
  }

  // Log with the check in front. A repeat is not written unless a person confirms.
  // Serialized per ledger; if another server took the same seq (store condition), look again and retry.
  logEvent(fields) {
    return this.serial(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.logOnce(fields);
        } catch (err) {
          if (err.name !== 'ConditionalCheckFailedException' || attempt >= 4) throw err;
        }
      }
    });
  }

  async logOnce(fields) {
    const check = await this.repeatFor(fields);
    if (check) {
      if (check.blocked && !fields.confirmRepeat) return { logged: false, needsConfirmation: true, check };
      const event = await this.append({ ...fields, override: check.blocked ? 'confirmed-repeat' : undefined });
      return { logged: true, event: evidence(event), check };
    }
    const event = await this.append(fields);
    return { logged: true, event: evidence(event) };
  }

  // What a write would make "given": a new med record, or a correction that turns one into given.
  async repeatFor(fields) {
    if (fields.kind === 'med' && (fields.status || 'given') === 'given') {
      return this.checkRepeat({ item: fields.item, subject: fields.subject, at: fields.at });
    }
    if (fields.kind === 'correction' && fields.status === 'given') {
      const target = (await this.effective()).find(e => e.id === fields.corrects);
      if (target?.kind === 'med' && target.status !== 'given') {
        return this.checkRepeat({ item: target.item, subject: target.subject, at: target.at, exclude: target.id });
      }
    }
    return null;
  }

  // Current state of one item (or everything) for today, with the raw words behind it.
  async getStatus({ item, subject = 'Dad', hours = 24, asOf } = {}) {
    const now = asOf ? new Date(asOf) : this.now();
    const since = new Date(now.getTime() - hours * HOUR);
    const key = item ? normalizeItem(item) : undefined;
    const events = (await this.effective({ asOf: now }))
      .filter(e => e.subject === subject && new Date(e.at) >= since && new Date(e.at) <= now)
      .filter(e => !key || e.item === key)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    const byItem = new Map();
    for (const e of events.filter(e => e.kind === 'med')) {
      if (!byItem.has(e.item)) byItem.set(e.item, []);
      byItem.get(e.item).push(e);
    }
    const items = [...byItem.entries()].map(([name, list]) => {
      const statuses = new Set(list.map(e => e.status));
      const people = new Set(list.map(e => e.who));
      // Two people disagree and nobody has corrected it: tell both, ask, never pick one.
      const conflict = statuses.size > 1 && people.size > 1;
      const latest = list[list.length - 1];
      return {
        item: name,
        status: conflict ? 'conflict' : latest.status,
        evidence: list.map(evidence),
      };
    });
    const other = events.filter(e => e.kind !== 'med').map(evidence);
    return { subject, since: since.toISOString(), items, other };
  }

  // Shift handoff: what happened since someone left, as at most three lines plus open questions.
  async handoff({ since, subject = 'Dad', asOf } = {}) {
    const now = asOf ? new Date(asOf) : this.now();
    const from = since ? new Date(since) : new Date(now.getTime() - 24 * HOUR);
    const live = await this.effective({ asOf: now });
    const events = live
      .filter(e => e.subject === subject && new Date(e.at) >= from && new Date(e.at) <= now)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    const status = await this.getStatus({ subject, hours: (now - from) / HOUR, asOf: now.toISOString() });
    const open = [
      ...status.items.filter(i => i.status === 'conflict').map(i => `Conflicting reports on ${i.item}`),
      ...events.filter(confirmedRepeat).map(e => `${(e.correctedBy?.override ? e.correctedBy : e).who} confirmed a repeat ${e.item}`),
      ...repeatsIn(live, events),
    ];
    return {
      since: from.toISOString(),
      count: events.length,
      latest: events.slice(0, 3).map(evidence),
      open,
    };
  }

  // Forget: append a forget event, then scrub the original words from storage.
  // Nothing derived is cached, so every later answer already excludes it.
  forget({ eventId, who }) {
    return this.serial(async () => {
      const events = await this.all();
      const target = events.find(e => e.id === eventId);
      if (!target) return { forgotten: false, reason: 'no such event' };
      await this.append({ who, kind: 'forget', forgets: eventId, text: `forget ${eventId}` });
      await this.store.scrub(eventId);
      return { forgotten: true, eventId };
    });
  }
}

function confirmedRepeat(e) {
  return Boolean(e.override || e.correctedBy?.override);
}

// Two effective "given" records for one item inside its check window that nobody confirmed as a repeat
// (written before the check existed, or by another client). Flag them; never drop either.
function repeatsIn(live, shown) {
  const out = [];
  for (const e of shown) {
    if (e.kind !== 'med' || e.status !== 'given' || confirmedRepeat(e)) continue;
    const rule = ruleFor(e.item);
    const earlier = live.find(p => p !== e && p.kind === 'med' && p.status === 'given' && p.item === e.item
      && p.subject === e.subject && (new Date(p.at) < new Date(e.at) || (p.at === e.at && p.seq < e.seq))
      && (new Date(e.at) - new Date(p.at)) / HOUR < rule.minHours);
    if (earlier) out.push(`Two "given" records for ${e.item} within ${rule.minHours} h (${earlier.who} and ${e.who}) — please check`);
  }
  return out;
}

export function evidence(e) {
  return {
    id: e.id,
    who: e.who,
    at: e.at,
    said: e.text,
    kind: e.kind,
    subject: e.subject,
    item: e.item,
    status: e.status,
    ...(e.override ? { override: e.override } : {}),
    ...(e.correctedBy ? { correctedBy: e.correctedBy } : {}),
  };
}

function required(v, name) {
  if (v === undefined || v === null || v === '') throw new Error(`missing ${name}`);
  return v;
}

function stripUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

export const HOURS = HOUR;
