// Read-aloud voice: text -> Amazon Polly (neural, US English, mp3). Keys stay on the server.
// The browser can also use its own voices; Polly is here so the recorded demo has one steady, warm voice.
export const POLLY_VOICES = ['Joanna', 'Ruth', 'Danielle', 'Matthew', 'Stephen'];
// Change the default voice here (one line). Warm and friendly first.
export const DEFAULT_VOICE = 'Joanna';
const MAX_CHARS = 1500;

let client;
async function polly() {
  if (!client) {
    const { PollyClient } = await import('@aws-sdk/client-polly');
    client = new PollyClient({});
  }
  return client;
}

export async function synthesize(text, voice = DEFAULT_VOICE) {
  const words = String(text || '').replace(/"/g, '').trim().slice(0, MAX_CHARS);
  if (!words) throw Object.assign(new Error('nothing to say'), { status: 400 });
  if (!POLLY_VOICES.includes(voice)) throw Object.assign(new Error('unknown voice'), { status: 400 });
  const { SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly');
  const out = await (await polly()).send(new SynthesizeSpeechCommand({
    Text: words, VoiceId: voice, Engine: 'neural', LanguageCode: 'en-US', OutputFormat: 'mp3',
  }));
  return Buffer.from(await out.AudioStream.transformToByteArray());
}
