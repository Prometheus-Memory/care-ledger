// Demo ledger for the video's first scene. `npm run seed:demo` adds one line in the maker's own words:
// Mom's blood pressure pill, given today at 8:04. `npm run reset:demo` empties the ledger to start clean.
// Uses the same store as the server (CARE_DATA, or data/ledger.jsonl); the DynamoDB table is never touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeStore } from '../src/server.js';
import { Ledger } from '../src/ledger.js';

const SCENE = { who: 'Me', kind: 'med', subject: 'Mom', item: 'blood pressure pill', status: 'given', text: 'Mom took her blood pressure pill.' };

export async function seedDemo(store) {
  const ledger = new Ledger(store);
  const at = new Date(); at.setHours(8, 4, 0, 0);
  const already = (await ledger.effective()).some(e => e.subject === SCENE.subject && e.item === SCENE.item && e.at === at.toISOString());
  if (already) return { logged: false, reason: 'already seeded' };
  return ledger.logEvent({ ...SCENE, at: at.toISOString() });
}

export function resetDemo(store) {
  if (!store.file) throw new Error('reset:demo only empties the local file store');
  fs.writeFileSync(store.file, '');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.env.CARE_STORE === 'dynamo') { console.error('demo data is for the local store only'); process.exit(1); }
  const store = await makeStore();
  if (process.argv[2] === 'reset') { resetDemo(store); console.log(`emptied ${store.file}`); }
  else { const res = await seedDemo(store); console.log(res.logged ? `seeded: ${res.event.who}, ${res.event.at}: "${res.event.said}"` : res.reason); }
}
