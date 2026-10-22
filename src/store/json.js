// Local store: one JSON-lines file. Lines are only ever appended; scrub() is the single exception,
// and it only blanks the words of a forgotten event.
// append() refuses a seq that already exists, like the DynamoDB condition, so a clash is retried, never lost.
import fs from 'node:fs';
import path from 'node:path';

export function seqTaken(seq) {
  const err = new Error(`seq ${seq} already exists`);
  err.name = 'ConditionalCheckFailedException';
  return err;
}

export class JsonStore {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  }

  async list() {
    return fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  }

  async maxSeq() {
    const all = await this.list();
    return all.reduce((m, e) => Math.max(m, e.seq), 0);
  }

  async append(event) {
    if ((await this.list()).some(e => e.seq === event.seq)) throw seqTaken(event.seq);
    fs.appendFileSync(this.file, JSON.stringify(event) + '\n');
  }

  async scrub(id) {
    const lines = (await this.list()).map(e => (e.id === id ? { ...e, text: '[forgotten]', scrubbed: true } : e));
    fs.writeFileSync(this.file, lines.map(e => JSON.stringify(e)).join('\n') + '\n');
  }
}

export class MemoryStore {
  constructor() { this.events = []; }
  async list() { return this.events.map(e => ({ ...e })); }
  async maxSeq() { return this.events.reduce((m, e) => Math.max(m, e.seq), 0); }
  async append(event) {
    // Yield once, so two ledgers sharing this store can really race (as two servers would on DynamoDB).
    await null;
    if (this.events.some(e => e.seq === event.seq)) throw seqTaken(event.seq);
    this.events.push({ ...event });
  }
  async scrub(id) {
    this.events = this.events.map(e => (e.id === id ? { ...e, text: '[forgotten]', scrubbed: true } : e));
  }
}
