# Care Ledger

**A family care log for Alexa+ that answers with evidence and double-checks before a medicine is logged twice.**

When three people look after one parent, the same question keeps coming up: *"Did Dad take his evening pill?"* Care Ledger keeps every caregiver's words as they said them, answers from those words — who said it, when, and exactly what — and, before a medicine is logged as given twice inside the sample ledger's check window, plays back the earlier record and asks whether it was already given. The person decides.

- **Tell it what happened** — "I gave Dad his blood pressure pill." Every event is appended; nothing is overwritten. A correction is a new event that points at the old one.
- **Not sure? It asks first** — "I will give Dad his pill tomorrow", or a medicine the sample ledger doesn't know, is held until the person says it already happened. The person cared for (Dad, Mom, Grandma…) is taken from the sentence.
- **Ask, and get the source** — "Yes — blood pressure pill was given. Source: Minji, 8:04 AM: 'I gave Dad his blood pressure pill'."
- **People disagree? It says so** — both accounts are read out and it asks you to check, instead of guessing.
- **Already given? It double-checks** — a plain rule in code (not a language model) looks for a "given" record of the same item inside a check window. The windows in `src/rules.js` are demo settings for the sample ledger, not dosing guidance. A person can still confirm; the repeat is flagged for the next shift. Corrections that turn a record into "given" go through the same check.
- **Handoff** — "Catch me up" gives the latest three events with their exact words plus anything still open.
- **Forget** — removes an event's words from storage, from every answer, and from the chat and MCP log on screen. See [What "forget" keeps](#what-forget-keeps).

Care Ledger is a record-keeping helper, not medical advice. It never calculates doses or says when a medicine may be taken; decisions stay with the family and their clinicians.

## Alexa+ track: how it plugs in

Alexa+ developer tools are partner-only, so — as the hackathon FAQ allows — this repo ships:

1. a **self-hosted MCP server** (`@modelcontextprotocol/sdk` 1.32.1, protocol **2025-11-25**, **Streamable HTTP**, stateless) with five tools: `log_event`, `get_status`, `check_repeat`, `handoff`, `forget`;
2. a **web simulator** in which **the browser itself is the MCP client**: it sends `initialize`, `notifications/initialized`, `tools/list` and `tools/call` to `/mcp` and shows every JSON-RPC message in a live panel. Voice in: Web Speech API (Chrome/Edge). Voice out: the browser's speech synthesis.

## Architecture

```
 Browser (web simulator)                         Node server (src/server.js)
 ┌──────────────────────────┐   POST /mcp      ┌────────────────────────────────────┐
 │ mic → Web Speech         │  JSON-RPC 2.0    │ MCP server (SDK 1.32.1, stateless)  │
 │ MCP client  ─────────────┼─────────────────▶│  log_event · get_status ·           │
 │  initialize / tools/list │                  │  check_repeat · handoff · forget    │
 │  tools/call  + live log  │                  │            │                        │
 │ voice.js: warm replies   │  POST            │            ▼                        │
 │  + evidence citations    │  /api/understand │ Ledger (append-only events,         │
 │ speech synthesis → 🔊    │─────────────────▶│  answers recomputed from raw words, │
 └──────────────────────────┘                  │  repeat guard = interval rules)     │
                                               │            │                        │
                                               │ store: JSON lines (DynamoDB opt.)   │
                                               │ brain: Amazon Bedrock (Converse)    │
                                               │   or rule parser when no model set  │
                                               └────────────────────────────────────┘
```

- **Language vs. judgment.** Bedrock (Claude Haiku by default, Amazon Nova Lite as fallback) only turns a sentence into an intent. Whether a dose is a repeat, whether people conflict, and what the answer is are all computed by code from the stored events.
- **Keys stay on the server.** The page never sees AWS credentials; it only calls `/api/understand`.
- **No keys? Still runs.** Without `BEDROCK_MODEL_ID` the server uses a small rule parser, so the full demo works offline.

## Run it

Requires Node.js 22.9+ (uses `--env-file-if-exists`; tested on 24.18).

```bash
npm install
npm start
```

Open http://127.0.0.1:8787. The server listens on loopback only (`CARE_HOST` to change). Use the time buttons (8:04 AM · 7:10 PM · Next day 9 AM) to move the simulated clock, pick who is talking, then type or press 🎤.

Try:
1. *Minji, 8:04 AM:* "I gave Dad his blood pressure pill"
2. *Joon, 7:10 PM:* "Did Dad take his blood pressure pill?" → answer with source
3. *Joon:* "Okay, I gave Dad his blood pressure pill" → it pauses and plays back Minji's record → "No, never mind"
4. *Ana, next day 9 AM:* "Catch me up" → handoff card

### With Amazon Bedrock

```bash
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=global.anthropic.claude-haiku-4-5-20251001-v1:0
export BEDROCK_FALLBACK_MODEL_ID=us.amazon.nova-lite-v1:0
npm start
```

Credentials come from the normal AWS chain (profile, env vars, or role). Model access must be enabled in the Bedrock console for your account and region. If a call fails the server logs it and falls back to the next model, then to the rule parser. A real round trip is recorded in [docs/aws-proof.md](docs/aws-proof.md) (`scripts/aws-proof.mjs`).

### With DynamoDB (optional, not deployed for this submission)

Create a table with partition key `household` (String) and sort key `seq` (Number), then:

```bash
export CARE_STORE=dynamo CARE_TABLE=care-ledger CARE_HOUSEHOLD=demo
npm start
```

Writes use `attribute_not_exists(seq)`, so an existing event is never overwritten. If two servers race for the same `seq`, the loser re-reads the ledger, runs the repeat check again and retries. Inside one server, writes are serialized.

### Use the MCP server from any client

Endpoint: `POST http://127.0.0.1:8787/mcp` (send `Accept: application/json, text/event-stream`).

Every request's `Origin` is checked: no Origin (curl, server-side clients), the page's own loopback origin, or one listed in `CARE_ORIGINS` (comma separated) is allowed; anything else gets **403** and no data. A shared deployment would add authentication per household on top.

```bash
curl -s 127.0.0.1:8787/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

## What "forget" keeps

- **Removed:** the event's words (`text` becomes `[forgotten]` in the store), and the event from every answer, handoff and repeat check. In the simulator, the same words are blanked in the chat bubbles, the card and the MCP traffic log.
- **Kept in the store:** the event's id, sequence number, time, who logged it, kind, item and status, marked `scrubbed: true`, plus a `forget` event saying who asked and when. This keeps the append-only numbering honest; it is metadata, not the words.
- **Not reached:** copies outside this app — browser speech history, screen recordings, logs you add yourself, or DynamoDB backups / point-in-time recovery if you turn them on.

## Tests

```bash
npm test
```

43 tests: the repeat check (held, confirmed, exact boundary, refusals never block, corrections to "given"), evidence in answers, conflicts, append-only corrections, `asOf` replay, forget (storage and screen), handoff warnings, simultaneous writes (one ledger and two servers), the rule parser (future, hypothetical, unknown medicine, who it's for), and MCP over HTTP (`initialize`, `tools/list`, `tools/call`, Origin 403). `test/review.test.js` holds one test per issue from the pre-submission review.

## Repository map

| Path | What |
|---|---|
| `src/ledger.js` | Append-only ledger, status recomputation, repeat guard, handoff, forget |
| `src/rules.js` | Sample-ledger repeat-check windows (data, not dosing guidance) |
| `src/mcp.js` | MCP tool definitions |
| `src/server.js` | HTTP server: `/mcp`, `/api/understand`, static simulator |
| `src/brain.js` | Bedrock Converse intent parsing + rule-based fallback |
| `src/store/` | JSON-lines store and DynamoDB store |
| `web/` | Simulator: MCP client, UI, warm voice replies |
| `friction-log.md` | Friction log kept during the build |
| `docs/aws-proof.md` | What ran against AWS (Bedrock: yes · DynamoDB: optional, not deployed) |
| `docs/product-feedback.md` | Product feedback per tool |
| `DEMO_SCRIPT.md` | 3-minute demo video script |

## License

MIT — see [LICENSE](LICENSE).
