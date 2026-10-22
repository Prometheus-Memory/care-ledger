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
  }

  async all() {
    const events = await this.store.list();
    return events.sort((a, b) => a.seq - b.seq);
  }

  // Events that still count: forgotten ones drop out, corrected ones take the correction's status.
  async effective() {
    const events = await this.all();
    const forgotten = new Set(events.filter(e => e.kind === 'forget').map(e => e.forgets));
    const live = events.filter(e => !forgotten.has(e.id) && e.kind !== 'forget');
    const corrections = new Map();
    for (const e of live) if (e.kind === 'correction') corrections.set(e.corrects, e);
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

  // The double-dose guard. Pure rule: same item, status "given", inside the rule's window.
  async checkRepeat({ item, subject = 'Dad', at }) {
    const when = at ? new Date(at) : this.now();
    const rule = ruleFor(item);
    const key = normalizeItem(item);
    const given = (await this.effective())
      .filter(e => e.kind === 'med' && e.item === key && e.subject === subject && e.status === 'given')
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
      nextAllowedAt: new Date(new Date(last.at).getTime() + rule.minHours * HOUR).toISOString(),
      previous: evidence(last),
    };
  }

  // Log with the guard in front. A blocked dose is not written unless a person confirms.
  async logEvent(fields) {
    if (fields.kind === 'med' && (fields.status || 'given') === 'given') {
      const check = await this.checkRepeat({ item: fields.item, subject: fields.subject, at: fields.at });
      if (check.blocked && !fields.confirmRepeat) {
        return { logged: false, needsConfirmation: true, check };
      }
      const event = await this.append({ ...fields, override: check.blocked ? 'confirmed-repeat' : undefined });
      return { logged: true, event: evidence(event), check };
    }
    const event = await this.append(fields);
    return { logged: true, event: evidence(event) };
  }

  // Current state of one item (or everything) for today, with the raw words behind it.
  async getStatus({ item, subject = 'Dad', hours = 24, asOf } = {}) {
    const now = asOf ? new Date(asOf) : this.now();
    const since = new Date(now.getTime() - hours * HOUR);
    const key = item ? normalizeItem(item) : undefined;
    const events = (await this.effective())
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
    const from = since ? new Date(since) : new Date(now.getTime() - 12 * HOUR);
    const events = (await this.effective())
      .filter(e => e.subject === subject && new Date(e.at) >= from && new Date(e.at) <= now)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    const status = await this.getStatus({ subject, hours: (now - from) / HOUR, asOf: now.toISOString() });
    const open = [
      ...status.items.filter(i => i.status === 'conflict').map(i => `Conflicting reports on ${i.item}`),
      ...events.filter(e => e.override).map(e => `${e.who} confirmed a repeat ${e.item} at ${clock(e.at)}`),
    ];
    return {
      since: from.toISOString(),
      count: events.length,
      lines: events.slice(0, 3).map(e => `${clock(e.at)} · ${e.who}: "${e.text}"`),
      open,
    };
  }

  // Forget: append a forget event, then scrub the original words from storage.
  // Nothing derived is cached, so every later answer already excludes it.
  async forget({ eventId, who }) {
    const events = await this.all();
    const target = events.find(e => e.id === eventId);
    if (!target) return { forgotten: false, reason: 'no such event' };
    await this.append({ who, kind: 'forget', forgets: eventId, text: `forget ${eventId}` });
    await this.store.scrub(eventId);
    return { forgotten: true, eventId };
  }
}

export function evidence(e) {
  return {
    id: e.id,
    who: e.who,
    at: e.at,
    said: e.text,
    kind: e.kind,
    item: e.item,
    status: e.status,
    ...(e.override ? { override: e.override } : {}),
    ...(e.correctedBy ? { correctedBy: e.correctedBy } : {}),
  };
}

export function clock(iso) {
  const tz = process.env.CARE_TZ || 'America/Los_Angeles';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

function required(v, name) {
  if (v === undefined || v === null || v === '') throw new Error(`missing ${name}`);
  return v;
}

function stripUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

export const HOURS = HOUR;
