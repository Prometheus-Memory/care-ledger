// Read-aloud voice picker. Polly voices go through the server's /speak; browser voices (Edge "Natural"
// ones first) speak locally. The choice, speed and pitch are kept in this browser so a recording keeps one voice.
const KEY = 'care-voice';
// A little slower than normal by default: easier to follow on a recording.
const RATE = 0.9;
const $ = id => document.getElementById(id);

export function loadChoice(fallback) {
  try { return { voice: fallback, rate: RATE, pitch: 1, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { voice: fallback, rate: RATE, pitch: 1 }; }
}

function saveChoice(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} }

function browserVoices() {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices()
    .filter(v => /^en[-_]US/i.test(v.lang))
    .sort((a, b) => /Natural/.test(b.name) - /Natural/.test(a.name));
}

export function setupSpeaker(polly) {
  const choice = loadChoice(`polly:${polly.default}`);
  const pick = $('voice');
  const fill = () => {
    pick.innerHTML = '';
    const group = (label, items) => {
      const g = document.createElement('optgroup'); g.label = label;
      for (const [value, name] of items) { const o = document.createElement('option'); o.value = value; o.textContent = name; g.append(o); }
      if (items.length) pick.append(g);
    };
    group('Amazon Polly (neural)', polly.voices.map(v => [`polly:${v}`, v]));
    group('This browser', browserVoices().map(v => [`browser:${v.name}`, v.name.replace(/^Microsoft /, '')]));
    pick.value = choice.voice;
    if (pick.value !== choice.voice) pick.value = `polly:${polly.default}`;
  };
  fill();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = fill;
  $('rate').value = choice.rate; $('pitch').value = choice.pitch;
  const sync = () => {
    Object.assign(choice, { voice: pick.value, rate: Number($('rate').value), pitch: Number($('pitch').value) });
    $('pitch').disabled = choice.voice.startsWith('polly:'); // Polly neural voices have no pitch control
    saveChoice(choice);
  };
  for (const el of [pick, $('rate'), $('pitch')]) el.onchange = sync;
  sync();
  $('tryVoice').onclick = () => speakWith(choice, "I'm not here to replace anyone. I just keep the family's words.");
  return text => speakWith(choice, text);
}

let audio;
async function speakWith(choice, text) {
  const words = text.replace(/"/g, '');
  if (audio) audio.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (choice.voice.startsWith('polly:')) {
    const res = await fetch('/speak', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: words, voice: choice.voice.slice(6) }),
    });
    if (res.ok) {
      audio = new Audio(URL.createObjectURL(await res.blob()));
      audio.playbackRate = choice.rate;
      return audio.play();
    }
  }
  if (!('speechSynthesis' in window)) return;
  // Browser voice, or Polly unavailable: speak locally.
  const u = new SpeechSynthesisUtterance(words);
  u.lang = 'en-US'; u.rate = choice.rate; u.pitch = choice.pitch;
  const v = speechSynthesis.getVoices().find(x => `browser:${x.name}` === choice.voice);
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
