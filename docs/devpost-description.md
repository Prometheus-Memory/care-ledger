# Care Ledger — Devpost description (draft)

## What it is

Care Ledger is a family care log for Alexa+. Family members say what they did — "I gave Mom her blood pressure pill" — and it keeps their exact words, with who said it and when. Later, anyone can ask "Did Mom take her pill?" and hear an answer built from that log, ending with the person and the words behind it.

## Why we built it

When several people share the care of one parent, the hardest question is often the simplest: did she already take it? People forget, texts get buried, and a dose can be given twice by mistake. We wanted a shared memory any family member can ask out loud, and that always shows where its answer came from.

## How it works

- **MCP server.** A self-hosted Model Context Protocol server over Streamable HTTP, with five tools: `log_event` (including corrections), `get_status`, `check_repeat`, `handoff` and `forget`. The web simulator is a real MCP client: initialize, tools/list, tools/call.
- **Amazon Bedrock** (Claude Haiku) reads the spoken sentence and turns it into a structured intent. That is all it does.
- **Rules decide the facts.** Whether something is already in the log, whether two people disagree, and what counts as "given" are plain code over an append-only log. The language model never decides whether a dose is allowed.
- **Amazon Polly** (neural voice Joanna, a little slower than normal) reads each answer aloud.
- **Append-only.** Nothing is overwritten. A correction is a new record next to the old one. "Forget" removes the words from storage and from every later answer.

When someone tries to log a dose that is already recorded, Care Ledger pauses, reads back the earlier record, and asks. When two people disagree, it reads both accounts and asks them to check with each other.

## A friendly helper, not a replacement

We drew this line on purpose. Care Ledger sits next to the family; it does not stand in for anyone in it.

- It speaks briefly and kindly, but it does not use pet names or pretend to have feelings.
- It never speaks as a family member, and it never imitates the person being cared for.
- It gives the fact first, then the source: who said it, when, and their words.
- It gives no medical advice and never says whether a dose is safe. When there is a decision, it asks: "Your call."

Why: in care, trust comes from knowing who said what. A helper that guesses, comforts in someone else's voice, or makes medical calls would blur that. A helper that remembers exactly and hands decisions back keeps people in charge, and means nobody has to carry the memory alone. These rules are written once in the code, used for the assistant's replies and in the Bedrock prompt, and checked by a test that fails if a reply drifts.

## Built with

Node.js · Model Context Protocol SDK · Amazon Bedrock · Amazon Polly · Amazon DynamoDB (optional store) · plain HTML and JavaScript

## Limits

This is a demo. The repeat-check windows are sample settings, not dosing guidance; a family would set their own. It is not medical advice.
