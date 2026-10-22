// "Understanding" a spoken sentence: turn words into an intent.
// Bedrock does it when configured; a small rule parser does it otherwise, so the demo runs with no keys.
// The model only reads language. It never decides whether a dose is allowed — the ledger's rules do.
import { KNOWN_ITEMS } from './rules.js';

const INTENTS = ['log', 'ask', 'handoff', 'forget_last', 'confirm', 'cancel', 'correct'];

export function parseByRules(text) {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]/g, ' ')} `.replace(/\s+/g, ' ');
  const item = findItem(t);
  if (/^ (yes|yeah|yep|ok|okay|sure|confirm|go ahead|log it)\b/.test(t)) return { intent: 'confirm' };
  if (/^ (no|nope|cancel|never mind|don't|stop)\b/.test(t)) return { intent: 'cancel' };
  if (/\b(forget|delete|erase|scratch) (that|the last|my last|it)\b/.test(t)) return { intent: 'forget_last' };
  if (/\b(handoff|hand off|catch me up|what did i miss|what happened (since|while)|shift (note|summary))\b/.test(t)) {
    return { intent: 'handoff' };
  }
  if (/\b(actually|correction|i was wrong|my mistake)\b/.test(t)) {
    return { intent: 'correct', item, status: negative(t) ? 'not_given' : 'given' };
  }
  if (/\?\s*$/.test(text.trim()) || /^ (did|has|have|was|is|when|what|who)\b/.test(t)) {
    return { intent: 'ask', item };
  }
  if (item || /\b(pill|pills|meds|medicine|medication|dose)\b/.test(t)) {
    const status = /\brefus/.test(t) ? 'refused' : negative(t) ? 'not_given' : 'given';
    return { intent: 'log', kind: 'med', item: item || 'medicine', status };
  }
  const meal = t.match(/\b(breakfast|lunch|dinner|snack)\b/);
  if (meal) return { intent: 'log', kind: 'meal', item: meal[1] };
  return { intent: 'log', kind: 'note' };
}

function negative(t) {
  return /\b(didn't|did not|hasn't|has not|haven't|not|no|skipped|missed|forgot)\b/.test(t);
}

function findItem(t) {
  for (const name of KNOWN_ITEMS) if (t.includes(` ${name}`)) return name;
  if (/\bbp\b|\bblood pressure\b/.test(t)) return 'blood pressure pill';
  if (/\bvitamin\b/.test(t)) return 'vitamin d';
  if (/\b(tylenol|painkiller|pain pill)\b/.test(t)) return 'pain reliever';
  return undefined;
}

const SYSTEM = `You turn one sentence said by a family caregiver into JSON. Output only JSON.
Schema: {"intent": one of ${JSON.stringify(INTENTS)}, "kind": "med"|"meal"|"note" (for log),
"item": medicine or meal name in lowercase (use one of ${JSON.stringify(KNOWN_ITEMS)} when it matches),
"status": "given"|"not_given"|"refused" (for med and correct)}.
"ask" = a question about what happened. "confirm"/"cancel" = yes/no to a pending question.
Never give medical advice. Never decide whether a dose is safe.`;

export async function understand(text, { modelId = process.env.BEDROCK_MODEL_ID, region = process.env.AWS_REGION } = {}) {
  if (modelId && process.env.CARE_BRAIN !== 'rules') {
    for (const id of [modelId, process.env.BEDROCK_FALLBACK_MODEL_ID].filter(Boolean)) {
      try {
        const parsed = await askBedrock(text, id, region);
        if (parsed && INTENTS.includes(parsed.intent)) return { ...parsed, engine: `bedrock:${id}` };
      } catch (err) {
        console.warn(`[brain] Bedrock ${id} failed, trying next: ${err.name || err.message}`);
      }
    }
  }
  return { ...parseByRules(text), engine: 'rules' };
}

async function askBedrock(text, modelId, region) {
  const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client = new BedrockRuntimeClient({ region: region || 'us-east-1' });
  const res = await client.send(new ConverseCommand({
    modelId,
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content: [{ text }] }],
    inferenceConfig: { maxTokens: 200, temperature: 0 },
  }));
  const out = res.output?.message?.content?.map(c => c.text || '').join('') || '';
  const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
  return JSON.parse(json);
}
