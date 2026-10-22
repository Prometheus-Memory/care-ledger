// One real Bedrock round trip through the same code path the server uses (src/brain.js understand()).
// Prints one line: model id, engine, intent, latency. It never prints keys, account ids or the raw response.
// Usage: node --env-file-if-exists=.env scripts/aws-proof.mjs
import { understand } from '../src/brain.js';

const sentence = 'I gave Dad his blood pressure pill';
const t0 = performance.now();
const out = await understand(sentence);
const ms = Math.round(performance.now() - t0);
console.log(JSON.stringify({
  when: new Date().toISOString(),
  region: process.env.AWS_REGION,
  modelId: process.env.BEDROCK_MODEL_ID,
  engine: out.engine,
  sentence,
  intent: { intent: out.intent, kind: out.kind, item: out.item, status: out.status, subject: out.subject },
  latencyMs: ms,
}));
if (!String(out.engine).startsWith('bedrock:')) process.exitCode = 1;
