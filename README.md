# Care Ledger

**A family care log for Alexa+ that answers with evidence and stops the double dose.**

When three people look after one parent, the same question keeps coming up: *"Did Dad take his evening pill?"* Care Ledger keeps every caregiver's words as they said them, answers from those words — who said it, when, and exactly what — and, before a medicine is logged twice inside its window, plays back the earlier record and lets the person decide.

- **Tell it what happened** — "I gave Dad his blood pressure pill." Every event is appended; nothing is overwritten. A correction is a new event that points at the old one.
- **Ask, and get the source** — "Yes — blood pressure pill was given. Source: Minji, 8:04 AM: 'I gave Dad his blood pressure pill'."
- **People disagree? It says so** — both accounts are read out and it asks you to check, instead of guessing.
- **Second dose? It pauses** — the check is a plain interval rule in code, not a language model. A person can still confirm; the repeat is flagged for the next shift.
- **Handoff** — "Catch me up" gives the latest three events with their exact words plus anything still open.
- **Forget** — removes an event's words and every answer built from it.

Care Ledger is a record-keeping helper, not medical advice. It never calculates doses; decisions stay with the family and their clinicians.

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
                                               │   store: JSON lines  |  DynamoDB    │
                                               │ brain: Amazon Bedrock (Converse)    │
                                               │   or rule parser when no model set  │
                                               └────────────────────────────────────┘
```

- **Language vs. judgment.** Bedrock (Claude Haiku by default, Amazon Nova Lite as fallback) only turns a sentence into an intent. Whether a dose is a repeat, whether people conflict, and what the answer is are all computed by code from the stored events.
- **Keys stay on the server.** The page never sees AWS credentials; it only calls `/api/understand`.
- **No keys? Still runs.** Without `BEDROCK_MODEL_ID` the server uses a small rule parser, so the full demo works offline.

## Run it

Requires Node.js 20+ (tested on 24).

```bash
npm install
npm start
```

Open http://localhost:8787. Use the time buttons (8:04 AM · 7:10 PM · Next day 9 AM) to move the simulated clock, pick who is talking, then type or press 🎤.

Try:
1. *Minji, 8:04 AM:* "I gave Dad his blood pressure pill"
2. *Joon, 7:10 PM:* "Did Dad take his blood pressure pill?" → answer with source
3. *Joon:* "Okay, I gave Dad his blood pressure pill" → it pauses and plays back Minji's record → "No, never mind"
4. *Ana, next day 9 AM:* "Catch me up" → handoff card

### With Amazon Bedrock

```bash
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
export BEDROCK_FALLBACK_MODEL_ID=us.amazon.nova-lite-v1:0
npm start
```

Credentials come from the normal AWS chain (profile, env vars, or role). Model access must be enabled in the Bedrock console for your account and region. If a call fails the server logs it and falls back to the next model, then to the rule parser.

### With DynamoDB

Create a table with partition key `household` (String) and sort key `seq` (Number), then:

```bash
export CARE_STORE=dynamo CARE_TABLE=care-ledger CARE_HOUSEHOLD=demo
npm start
```

Writes use `attribute_not_exists(seq)`, so an existing event is never overwritten.

### Use the MCP server from any client

Endpoint: `POST http://localhost:8787/mcp` (send `Accept: application/json, text/event-stream`).

```bash
curl -s localhost:8787/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

## Tests

```bash
npm test
```

25 tests: the repeat guard (held, confirmed, exact 20-hour boundary, refusals never block), evidence in answers, conflicts, append-only corrections, forget, handoff, the simulated clock, the rule parser, and MCP over HTTP (`initialize`, `tools/list`, `tools/call`, CORS).

## Repository map

| Path | What |
|---|---|
| `src/ledger.js` | Append-only ledger, status recomputation, repeat guard, handoff, forget |
| `src/rules.js` | Medicine interval rules (data) |
| `src/mcp.js` | MCP tool definitions |
| `src/server.js` | HTTP server: `/mcp`, `/api/understand`, static simulator |
| `src/brain.js` | Bedrock Converse intent parsing + rule-based fallback |
| `src/store/` | JSON-lines store and DynamoDB store |
| `web/` | Simulator: MCP client, UI, warm voice replies |
| `friction-log.md` | Friction log kept during the build |
| `DEMO_SCRIPT.md` | 3-minute demo video script |

## License

MIT — see [LICENSE](LICENSE).
