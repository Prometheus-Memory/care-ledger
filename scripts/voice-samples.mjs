// Listening set for choosing the demo voice: the script's first line and two app answers,
// once per Polly candidate, as mp3 in samples/ (git-ignored). Prints one proof line per voice; never keys or ids.
// Usage: node --env-file-if-exists=.env scripts/voice-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesize, POLLY_VOICES } from '../src/speak.js';

const out = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'samples');
const LINES = [
  ['1-script', 'Sixty-three million Americans care for a family member. When three people share one parent, the hardest question is the simplest: did Dad already take his pill?'],
  ['2-already', "Just a heads-up — blood pressure pill is already in the log as given. Minji, 8:04 AM: I gave Dad his blood pressure pill. Could you double-check it wasn't already given? Want me to record another one anyway? You decide."],
  ['3-both', "I'm hearing two different things about metformin. Joon, 7:20 PM: Dad didn't take his metformin; and Minji, 7:25 PM: I gave Dad his metformin. Could you check with each other? I don't want to guess."],
];

fs.mkdirSync(out, { recursive: true });
for (const voice of POLLY_VOICES) {
  const t0 = performance.now();
  let bytes = 0;
  for (const [name, text] of LINES) {
    const mp3 = await synthesize(text, voice);
    bytes += mp3.length;
    fs.writeFileSync(path.join(out, `${voice}-${name}.mp3`), mp3);
  }
  console.log(JSON.stringify({ when: new Date().toISOString(), region: process.env.AWS_REGION, service: 'polly', engine: 'neural', voice, files: LINES.length, bytes, ms: Math.round(performance.now() - t0) }));
}
