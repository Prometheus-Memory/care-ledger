// The web simulator. The browser itself is the MCP client: it speaks JSON-RPC to /mcp over
// Streamable HTTP and shows every request and response. Only sentence understanding goes to
// /api/understand, so no cloud key ever reaches the page.
import { sayLogged, sayStatus, sayHandoff, sayForgot, sayTentative, cite } from './voice.js';
import { scrubNodes } from './scrub.js';

const PROTOCOL = '2025-11-25';
const $ = id => document.getElementById(id);

class McpClient {
  constructor(url, log) { this.url = url; this.log = log; this.id = 0; this.sessionId = null; }

  async send(method, params, { notify = false } = {}) {
    const msg = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id: ++this.id }) };
    this.log('→', msg);
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (method !== 'initialize') headers['MCP-Protocol-Version'] = PROTOCOL;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    const res = await fetch(this.url, { method: 'POST', headers, body: JSON.stringify(msg) });
    this.sessionId = res.headers.get('Mcp-Session-Id') || this.sessionId;
    if (notify) { this.log('←', `HTTP ${res.status}`); return null; }
    const type = res.headers.get('Content-Type') || '';
    const reply = type.includes('text/event-stream') ? parseSse(await res.text()) : await res.json();
    this.log('←', reply);
    if (reply.error) throw new Error(reply.error.message);
    return reply.result;
  }

  async connect() {
    const init = await this.send('initialize', {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: 'care-ledger-web-simulator', version: '1.0.0' },
    });
    await this.send('notifications/initialized', undefined, { notify: true });
    this.tools = (await this.send('tools/list')).tools;
    return init;
  }

  async call(name, args) {
    const result = await this.send('tools/call', { name, arguments: args });
    return result.structuredContent ?? JSON.parse(result.content[0].text);
  }
}

function parseSse(text) {
  const data = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean);
  return JSON.parse(data[data.length - 1]);
}

// ---- UI ----
const state = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, pending: null, subject: 'Dad' };

function logLine(dir, payload) {
  const li = document.createElement('li');
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 1);
  li.innerHTML = `<span class="dir">${dir}</span> `;
  li.append(text.length > 1500 ? text.slice(0, 1500) + ' …' : text);
  $('log').append(li);
  li.scrollIntoView({ block: 'end' });
}

function bubble(kind, who, text, extra = '') {
  const div = document.createElement('div');
  div.className = `msg ${kind} ${extra}`;
  const w = document.createElement('span');
  w.className = 'who'; w.textContent = who;
  div.append(w, text);
  $('chat').append(div);
  div.scrollTop = 0; $('chat').scrollTop = $('chat').scrollHeight;
}

function speak(text) {
  if (!$('speakOut').checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/"/g, ''));
  u.lang = 'en-US'; u.rate = 1.0;
  speechSynthesis.speak(u);
}

function answer(text, extra) { bubble('alexa', 'Alexa', text, extra); speak(text); }

function now() { return new Date($('clock').value).toISOString(); }
function who() { return $('speaker').value.replace(/\s*\(.*\)/, ''); }

function showCard(title, rows) {
  const card = $('card');
  card.hidden = false;
  card.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = title; card.append(h);
  const ul = document.createElement('ul');
  for (const r of rows) {
    const li = document.createElement('li');
    if (r.cls) li.className = r.cls;
    li.append(r.text);
    if (r.src) { const s = document.createElement('div'); s.className = 'src'; s.textContent = r.src; li.append(s); }
    ul.append(li);
  }
  if (!rows.length) { const li = document.createElement('li'); li.textContent = 'Nothing yet.'; ul.append(li); }
  card.append(ul);
}

async function statusCard(mcp) {
  const status = await mcp.call('get_status', { asOf: now(), subject: state.subject });
  showCard(`${state.subject} · last 24 hours`, [
    ...status.items.map(i => ({
      text: `${i.item}: ${i.status === 'conflict' ? 'people disagree — please check' : i.status.replace('_', ' ')}`,
      cls: i.status === 'conflict' ? 'conflict' : '',
      src: i.evidence.map(e => cite(e, state.tz)).join(' · '),
    })),
    ...status.other.map(e => ({ text: e.item || e.kind, src: cite(e, state.tz) })),
  ]);
  return status;
}

async function handle(mcp, text) {
  bubble('you', who(), text);
  const intent = await (await fetch('/api/understand', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  })).json();
  logLine('🧠', `understood (${intent.engine}): ${JSON.stringify({ ...intent, engine: undefined })}`);

  if (state.pending && (intent.intent === 'confirm' || intent.intent === 'cancel')) {
    const { args, step } = state.pending; state.pending = null;
    if (intent.intent === 'cancel') return answer("Okay, I won't log it. Thanks for double-checking.");
    // A "yes" to an unsure sentence still goes through the repeat check; only a "yes" to that check overrides it.
    const res = await mcp.call('log_event', step === 'repeat' ? { ...args, confirmRepeat: true } : args);
    if (res.needsConfirmation) state.pending = { args, step: 'repeat' };
    answer(args.kind === 'correction' && res.logged ? sayCorrected() : sayLogged(res, state.tz), res.needsConfirmation ? 'ask' : '');
    return statusCard(mcp);
  }
  state.pending = null;
  if (intent.intent === 'confirm' || intent.intent === 'cancel') return answer('Okay! Anything else I can note for you?');
  if (intent.subject) state.subject = intent.subject;

  switch (intent.intent) {
    case 'log': {
      const args = { who: who(), text, kind: intent.kind || 'note', subject: state.subject, at: now() };
      if (intent.item) args.item = intent.item;
      if (intent.kind === 'med') args.status = intent.status || 'given';
      if (intent.tentative) {
        state.pending = { args: { ...args, item: args.item || 'unlisted medicine' }, step: 'unsure' };
        return answer(sayTentative({ ...intent, subject: state.subject }), 'ask');
      }
      const res = await mcp.call('log_event', args);
      if (res.needsConfirmation) state.pending = { args, step: 'repeat' };
      answer(sayLogged(res, state.tz), res.needsConfirmation ? 'ask' : '');
      return statusCard(mcp);
    }
    case 'ask': {
      const status = await statusCard(mcp);
      return answer(sayStatus(status, intent.item, state.tz));
    }
    case 'handoff': {
      const card = await mcp.call('handoff', { asOf: now(), subject: state.subject });
      showCard('Handoff · since you left', [
        ...card.latest.map(e => ({ text: `${e.who}: "${e.said}"`, src: cite(e, state.tz) })),
        ...card.open.map(o => ({ text: o, cls: 'conflict' })),
      ]);
      return answer(sayHandoff(card, state.tz));
    }
    case 'forget_last': {
      const status = await mcp.call('get_status', { asOf: now(), hours: 48, subject: state.subject });
      const mine = [...status.items.flatMap(i => i.evidence), ...status.other]
        .filter(e => e.who === who()).sort((a, b) => a.at.localeCompare(b.at)).pop();
      if (!mine) return answer("I don't see anything from you to forget.");
      const res = await mcp.call('forget', { eventId: mine.id, who: who() });
      // The words leave the screen too: chat bubbles, earlier answers, the card and the MCP log.
      if (res.forgotten) scrubNodes(document.querySelectorAll('#chat .msg, #log li, #card li'), mine.said);
      answer(sayForgot(res));
      return statusCard(mcp);
    }
    case 'correct': {
      const status = await mcp.call('get_status', { asOf: now(), item: intent.item, subject: state.subject });
      const target = status.items.flatMap(i => i.evidence).pop();
      if (!target) return answer("I couldn't find what to correct. Could you say it again?");
      const args = { who: who(), text, kind: 'correction', corrects: target.id, status: intent.status, subject: state.subject, at: now() };
      const res = await mcp.call('log_event', args);
      if (res.needsConfirmation) {
        state.pending = { args, step: 'repeat' };
        answer(sayLogged(res, state.tz), 'ask');
      } else {
        answer(sayCorrected());
      }
      return statusCard(mcp);
    }
    default:
      return answer("Sorry, I didn't catch that. Could you say it another way?");
  }
}

function sayCorrected() {
  return "Thanks for the correction — I've kept both, and I'll go by yours from now on.";
}

function setClock(spec) {
  const d = new Date($('clock').value || Date.now());
  let [day, hm] = spec.startsWith('next-') ? [1, spec.slice(5)] : [0, spec];
  const [h, m] = hm.split(':').map(Number);
  d.setDate(d.getDate() + day); d.setHours(h, m, 0, 0);
  $('clock').value = toLocalInput(d);
}

function toLocalInput(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function setupMic(submit) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('mic').disabled = true; $('mic').title = 'Speech input needs Chrome or Edge'; return; }
  const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false;
  rec.onresult = e => { $('text').value = e.results[0][0].transcript; submit(); };
  rec.onend = () => $('mic').classList.remove('on');
  $('mic').onclick = () => { $('mic').classList.add('on'); rec.start(); };
}

async function main() {
  const cfg = await (await fetch('/api/config')).json();
  $('brain').textContent = `brain: ${cfg.brain}`;
  $('clock').value = toLocalInput(new Date());
  for (const b of document.querySelectorAll('[data-time]')) b.onclick = () => setClock(b.dataset.time);

  const mcp = new McpClient('/mcp', logLine);
  window.careMcp = mcp;
  const init = await mcp.connect();
  logLine('✓', `connected to ${init.serverInfo.name} · protocol ${init.protocolVersion} · tools: ${mcp.tools.map(t => t.name).join(', ')}`);
  answer("Hi! I'm keeping the family care log. Tell me what happened, or ask me anything about today.");

  const submit = async () => {
    const text = $('text').value.trim();
    if (!text) return;
    $('text').value = '';
    try { await handle(mcp, text); } catch (err) { logLine('✗', err.message); answer('Something went wrong on my side. Mind trying again?'); }
  };
  $('say').onsubmit = e => { e.preventDefault(); submit(); };
  setupMic(submit);
  window.careSay = async text => { $('text').value = text; await submit(); };
}

main();
