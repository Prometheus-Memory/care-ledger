# Product feedback (draft)

Per tool: what we used it for, what worked, what could be better, onboarding, and whether we'd use it again. Drawn from [friction-log.md](../friction-log.md) and the pre-submission fixes. Severity words match the friction log.

## Alexa+ developer tools (docs and FAQ)

- **Used for:** deciding how Care Ledger plugs into Alexa+ — as a self-hosted MCP server any Alexa+ MCP host could call.
- **Worked well:** the FAQ was clear that a self-built simulator is acceptable, so we never stalled on access.
- **Could be better:** the Category SDK, MCP Toolkit and Web Simulator are partner-only, so no builder can check a real tool call end to end (High). A public text-only sandbox of the Alexa+ MCP host would close that gap.
- **Onboarding:** reading the rules, FAQ and MCP pages took about an hour to settle which path counts; a single "if you are not a partner, do this" page would cut it to minutes.
- **Would use again:** yes, once a public sandbox exists — the voice-first, family-shared setting is exactly where a care log belongs. Without it we can only show a simulator.

## Model Context Protocol (spec 2025-11-25, TypeScript SDK 1.32.1)

- **Used for:** the five ledger tools over Streamable HTTP, with the browser as a real MCP client (`initialize`, `tools/list`, `tools/call`).
- **Worked well:** `McpServer.registerTool` with zod schemas gave typed tools and `structuredContent` in a few lines; stateless mode needed no session store.
- **Could be better:** the spec site lists a newer revision as current while the hackathon asks for 2025-11-25 (Medium); `package.json` is hidden by `exports` (Low); there is no plain `node:http` stateless example (Low); browser clients need specific CORS and `Accept` headers that are spread across pages (Medium). The transport's Origin-validation rule is easy to miss — a reviewer caught that our first version answered any Origin. An SDK option that enforces an Origin allowlist would make the safe path the default.
- **Onboarding:** the first working `tools/call` took under an hour; getting the browser client right took longer than the server.
- **Would use again:** yes. One protocol served both the simulator and any other client unchanged.

## Amazon Bedrock (Converse API, Claude Haiku 4.5)

- **Used for:** turning one spoken sentence into an intent (log / ask / handoff / correct…, plus item, who it's for, and whether it already happened). It never decides facts or safety.
- **Worked well:** one Converse call shape for every model, so a fallback model is just another id; a real round trip took about 2 s ([aws-proof.md](aws-proof.md)).
- **Could be better:** model ids differ by region and inference profile (`us.` vs `global.`), and whether a model is enabled for an account can only be learned by calling it (Medium). A "is this model enabled for me?" call in the SDK/CLI would help. Because any language model can misread "I will give Dad his pill tomorrow" as done, its output passes the same plain checks before anything is written.
- **Onboarding:** credentials plus model access took longer than the code; the code was 15 lines.
- **Would use again:** yes, for language understanding behind deterministic code.

## Amazon DynamoDB

- **Used for:** an optional append-only store (`household` + `seq`, conditional put). Written, **not deployed** for this submission.
- **Worked well:** `attribute_not_exists(seq)` maps cleanly onto "never overwrite an event"; on a clash the ledger re-reads, re-checks and retries.
- **Could be better:** we could not try it without creating billable resources; a free local emulator story in the getting-started path would let builders test conditional writes first.
- **Onboarding:** not measured — not run.
- **Would use again:** likely, for a shared multi-household deployment; for a single-machine demo a file was enough.

## Web Speech API (browser)

- **Used for:** voice in (Chrome/Edge recognition) and voice out (speech synthesis) in the simulator.
- **Worked well:** zero setup, no keys.
- **Could be better:** recognition is Chromium-only; Firefox users see a disabled mic.
- **Onboarding:** minutes.
- **Would use again:** yes, for demos; a real Alexa+ device would replace it.
