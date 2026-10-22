# Care Ledger — 3-minute demo script

Target length 2:50. Screen: the web simulator (left: assistant, right: live MCP traffic). Voice-over in English.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | Title card: "Care Ledger — who said it, when, and did Dad already have it?" | "Sixty-three million Americans care for a family member. When three people share one parent, the hardest question is the simplest: did Dad already take his pill?" |
| 0:20 | Simulator. Clock set to 8:04 AM. Speaker: Minji. She says: "I gave Dad his blood pressure pill." The card shows the event. | "Care Ledger is a family care log for Alexa+. Minji tells it what she did, in her own words. It keeps those words exactly — it only ever adds, never overwrites." |
| 0:45 | Clock → 7:10 PM. Speaker: Joon. "Did Dad take his blood pressure pill?" The answer is read aloud with its source. | "That evening her brother asks. The answer isn't a guess or a summary — it's recomputed from the log and ends with the source: Minji, 8:04 AM, and what she actually said." |
| 1:10 | Joon: "Okay, I gave Dad his blood pressure pill." Assistant pauses: "Just a heads-up — it's already in the log as given… Could you double-check it wasn't already given? Want me to record another one anyway? You decide." Joon: "No, never mind." | "If Joon goes to log it again, Care Ledger pauses and plays back Minji's record, so he can check before writing a second one. It's a plain rule in code — not a language model — and the decision stays with the family." |
| 1:40 | Joon: "Dad didn't take his metformin." Minji: "I gave Dad his metformin." Minji: "Did Dad take his metformin?" Answer reads both accounts and asks them to check. | "When people disagree, it doesn't pick a winner. It reads back both accounts and asks the family to check with each other." |
| 2:05 | Clock → next day 9 AM. Speaker: Ana (carer). "Catch me up." Handoff card. | "Next morning the carer arrives and says 'catch me up' — the latest events with their exact words, and anything still open." |
| 2:25 | Right panel: scroll the MCP log — initialize (protocol 2025-11-25), tools/list (five tools), tools/call. Then the architecture diagram from the README. | "Under the hood: a self-hosted MCP server over Streamable HTTP. The browser is a real MCP client — initialize, tools list, tools call. Amazon Bedrock — Claude Haiku — reads the sentence; code decides the facts. Today the log is an append-only file on this machine; a DynamoDB store is written but optional." |
| 2:45 | End card: "Care Ledger · MCP + Amazon Bedrock · not medical advice" | "Care Ledger: answers with evidence, and a double-check before anything's logged twice." |

Recording notes
- Uncheck "Read answers aloud" if you narrate over it; keep it on for the 0:45 and 1:10 beats so judges hear the assistant.
- For the 2:25 beat, start the server with Bedrock on (`npm start` with `.env`) so the header shows `brain: bedrock`; without it, say "a rule parser" instead of Bedrock.
- Use the time buttons rather than waiting; start from an empty ledger (delete `data/ledger.jsonl` before recording).
- No third-party music or trademarks on screen beyond the AWS service names.
