// Plays the video's app scenes (DEMO_SCRIPT.md, 0:16–2:40) in its own visible browser so a person only
// records: it resets and seeds the ledger, sets the voice, waits for Enter, then types each line like a
// person, waits for Alexa to finish speaking, and moves on. The server must already be running (npm start).
//   npm run demo:play                 (Windows PowerShell: npm.cmd run demo:play)
//   npm run demo:play -- --captions   show each scene's caption line at the top of the page
//   --mcp-secs 20 · --readme-secs 15 (how long the MCP-log scroll and the README diagram stay) · --url http://127.0.0.1:8787 · --go (start without waiting for Enter) · --fast (also quick typing and no waits: checks the flow)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const URL_ = opt('--url', 'http://127.0.0.1:8787');
const CAPTIONS = flag('--captions');
const FAST = flag('--fast');
const sleep = ms => new Promise(r => setTimeout(r, FAST ? Math.min(ms, 300) : ms));

// The scenes, in the order of the table in DEMO_SCRIPT.md.
const SCENES = [
  { caption: "Answered from the log — the family's own words, not a guess.", steps: [
    { speaker: 'Me', say: 'Did Mom take her blood pressure pill?' }] },
  { caption: 'A helper next to the family, not instead of it.', steps: [{ tryVoice: true }] },
  { caption: 'Already logged? It asks before writing it twice.', steps: [
    { time: '19:10' }, { speaker: 'Minji', say: 'I gave Mom her blood pressure pill.' }] },
  { caption: 'The check is plain code. The decision stays with people.', steps: [
    { speaker: 'Minji', say: 'No, never mind.' }] },
  { caption: 'Two accounts? It reads both and asks.', steps: [
    { speaker: 'Joon', say: "Mom didn't take her metformin." },
    { speaker: 'Minji', say: 'I gave Mom her metformin.' },
    { speaker: 'Minji', say: 'Did Mom take her metformin?' }] },
  { caption: 'Next morning: the latest words, and what\'s still open.', steps: [
    { time: 'next-09:00' }, { speaker: 'Ana (carer)', say: 'Catch me up.' }] },
  { caption: null, steps: [{ mcpScroll: Number(opt('--mcp-secs', 20)) * 1000 }] }, // caption depends on the brain, filled in below
  { caption: 'Amazon Bedrock · Amazon Polly · MCP over Streamable HTTP · not medical advice', steps: [{ readme: Number(opt('--readme-secs', 15)) * 1000 }] },
];

function npmScript(name) {
  execFileSync(process.execPath, ['--env-file-if-exists=.env', 'scripts/demo-data.mjs', name], { cwd: root, stdio: 'inherit' });
}

// Runs in the page before app.js: counts what is speaking, so the player knows when Alexa is done.
function speechProbe() {
  window.__speech = { playing: 0, started: 0 };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const s = window.__speech;
    s.playing++; s.started++;
    const done = () => { s.playing = Math.max(0, s.playing - 1); this.removeEventListener('ended', done); this.removeEventListener('pause', done); };
    this.addEventListener('ended', done); this.addEventListener('pause', done);
    return play.call(this).catch(err => { done(); throw err; });
  };
  if ('speechSynthesis' in window) {
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { window.__speech.started++; speak(u); };
  }
}

async function caption(page, text) {
  if (!CAPTIONS) return;
  await page.evaluate(t => {
    let el = document.getElementById('__caption');
    if (!el) {
      el = document.createElement('div'); el.id = '__caption';
      el.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;max-width:80%;'
        + 'padding:10px 22px;border-radius:10px;background:rgba(20,24,32,.88);color:#fff;font:600 22px/1.35 system-ui,sans-serif;'
        + 'text-align:center;transition:opacity .4s;pointer-events:none';
      document.body.append(el);
    }
    el.textContent = t || ''; el.style.opacity = t ? 1 : 0;
    clearTimeout(window.__capTimer);
    if (t) window.__capTimer = setTimeout(() => { el.style.opacity = 0; }, 6000);
  }, text);
}

// Wait until Alexa has started and finished speaking; if no audio ever starts, wait by length instead.
async function waitSpoken(page, startedBefore, text) {
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const s = await page.evaluate(() => ({ ...window.__speech, synth: 'speechSynthesis' in window && speechSynthesis.speaking }));
    if (s.started > startedBefore && (s.playing || s.synth)) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const s0 = await page.evaluate(() => window.__speech.started);
  if (s0 === startedBefore) return sleep(Math.max(1500, text.length * 75)); // ~13 characters a second at 0.9
  while (await page.evaluate(() => window.__speech.playing > 0 || ('speechSynthesis' in window && speechSynthesis.speaking))) {
    await new Promise(r => setTimeout(r, 150));
  }
}

async function lastAnswer(page, before) {
  await page.waitForFunction(n => document.querySelectorAll('#chat .msg.alexa').length > n, before, { timeout: 60000 });
  return page.evaluate(() => [...document.querySelectorAll('#chat .msg.alexa')].pop().textContent);
}

async function step(page, s) {
  if (s.time) {
    await page.locator(`[data-time="${s.time}"]`).hover(); await sleep(400);
    await page.click(`[data-time="${s.time}"]`); await sleep(700);
  }
  if (s.speaker) {
    const now = await page.inputValue('#speaker');
    if (now !== s.speaker) { await page.selectOption('#speaker', s.speaker); await sleep(500); }
  }
  if (s.say) {
    const before = await page.locator('#chat .msg.alexa').count();
    const started = await page.evaluate(() => window.__speech.started);
    await page.click('#text');
    await page.keyboard.type(s.say, { delay: FAST ? 5 : 38 });
    await sleep(300);
    await page.keyboard.press('Enter');
    const said = await lastAnswer(page, before);
    await waitSpoken(page, started, said);
    await sleep(1000);
  }
  if (s.tryVoice) {
    const started = await page.evaluate(() => window.__speech.started);
    await page.locator('#tryVoice').hover(); await sleep(500);
    await page.click('#tryVoice');
    await waitSpoken(page, started, "I'm not here to replace anyone. I just keep the family's words, so nobody has to remember alone. From here, let me show you.");
    await sleep(1000);
  }
  if (s.mcpScroll) {
    // Slowly from the top of the MCP log (initialize, tools/list) down to the latest tools/call.
    await page.evaluate(ms => new Promise(done => {
      const log = document.getElementById('log');
      const max = log.scrollHeight - log.clientHeight;
      const start = performance.now();
      log.scrollTop = 0;
      const tick = t => {
        const k = Math.min(1, (t - start) / ms);
        log.scrollTop = max * k;
        k < 1 ? requestAnimationFrame(tick) : done();
      };
      requestAnimationFrame(tick);
    }), FAST ? 300 : s.mcpScroll);
  }
  if (s.readme) {
    const md = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const diagram = md.split('## Architecture')[1].split('```')[1].replace(/^\n/, '');
    await page.evaluate(d => {
      const el = document.createElement('div'); el.id = '__readme';
      el.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;'
        + 'background:#fff;color:#111;font-family:system-ui,sans-serif';
      const h = document.createElement('h2'); h.textContent = 'Care Ledger — architecture (README)';
      h.style.cssText = 'font-size:28px;margin:0 0 18px';
      const pre = document.createElement('pre'); pre.textContent = d;
      pre.style.cssText = 'font:16px/1.3 Consolas,monospace;margin:0;padding:18px 24px;border:1px solid #ddd;border-radius:8px;background:#f7f7f9';
      el.append(h, pre); document.body.append(el);
    }, diagram);
    await sleep(s.readme);
  }
}

async function main() {
  try { const r = await fetch(`${URL_}/api/config`); if (!r.ok) throw new Error(r.status); }
  catch { console.error(`No server at ${URL_}. Start it first in another window: npm.cmd start`); process.exit(1); }

  npmScript('reset'); npmScript('seed');

  const browser = await chromium.launch({
    headless: false, channel: process.env.DEMO_BROWSER || 'chrome',
    args: ['--window-size=1600,900', '--window-position=0,0', '--autoplay-policy=no-user-gesture-required'],
    ignoreDefaultArgs: ['--mute-audio'],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addInitScript(speechProbe);
  await context.addInitScript(() => localStorage.setItem('care-voice', JSON.stringify({ voice: 'polly:Joanna', rate: 0.9, pitch: 1 })));
  const page = await context.newPage();
  await page.goto(URL_);
  await page.waitForFunction(() => document.querySelectorAll('#log li').length > 2 && document.querySelector('#chat .msg.alexa'));

  // The settings, set on screen: read aloud on, Joanna, 0.9, speaker Me.
  if (!(await page.isChecked('#speakOut'))) await page.check('#speakOut');
  await page.selectOption('#voice', 'polly:Joanna').catch(() => console.warn('Joanna not offered (Polly off?) — the browser voice reads instead.'));
  await page.evaluate(() => { const r = document.getElementById('rate'); r.value = '0.9'; r.dispatchEvent(new Event('change')); });
  await page.selectOption('#speaker', 'Me');
  const brain = (await page.textContent('#brain')).trim();
  SCENES[6].caption = brain.includes('rules')
    ? 'A real MCP server. A rule parser reads the sentence; code decides the facts.'
    : 'A real MCP server. Bedrock reads the sentence; code decides the facts.';
  console.log(`ready · ${brain} · captions ${CAPTIONS ? 'on' : 'off'}`);

  if (!FAST && !flag('--go')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('Start recording, read the first five lines, then press Enter here… ');
    rl.close();
  }
  await page.bringToFront();
  const t0 = Date.now();
  for (const scene of SCENES) {
    await caption(page, scene.caption);
    console.log(`${Math.round((Date.now() - t0) / 1000)}s · ${scene.caption || ''}`);
    for (const s of scene.steps) await step(page, s);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  await caption(page, null);
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(255,255,255,.96);font:700 40px system-ui,sans-serif;color:#111';
    el.textContent = '끝 — 마지막 한 줄 읽으세요';
    document.body.append(el);
  });
  console.log(`done in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} — read the last line. Close the browser window (or Ctrl+C) when finished.`);
  if (FAST) await browser.close();
  else await new Promise(r => browser.on('disconnected', r));
}

main().catch(err => { console.error(err); process.exit(1); });
