# Care Ledger — demo script (2:50)

One flow: a person asks a person, and Alexa picks it up. Alexa is a friendly extra helper next to the family — never a stand-in for one of them.

Voices: **Maker** = the person who built it, reading in English on camera (short lines, 12 words or fewer, about 35 seconds in all). **Alexa** = Amazon Polly, Joanna, speed 0.9 (the app's default). Mom is never shown and never named; she is only spoken to, off screen.

## Before recording

```
npm run reset:demo     # empty the local ledger
npm run seed:demo      # add: Me · Mom · blood pressure pill · given · 8:04 AM today · "Mom took her blood pressure pill."
npm start              # with .env, so the header shows brain: bedrock
```

In the page: "Read answers aloud" on, voice Joanna, speed 0.9. Speaker "Me". Leave the clock at the current time (after 8:04 AM, same day).

## Scenes

| Time | On screen (one caption line) | Who | Words |
|---|---|---|---|
| 0:00 | Maker on camera. Caption: *Care Ledger* | Maker | "Hi. I made Care Ledger." · "My family shares the care of my mom." · "Three of us give her medicine." · "So every day, someone asks the same question." |
| 0:12 | Maker turns toward the room, away from camera. | Maker | "…wait. Mom, did you take your blood pressure pill?" |
| 0:16 | Simulator. Speaker "Me" types the same question. The card shows the 8:04 record. Caption: *Answered from the log — the family's own words, not a guess.* | Alexa | "She did — 8:04 AM this morning. You logged it yourself: 'Mom took her blood pressure pill.'" |
| 0:23 | Click **Try voice**. Caption: *A helper next to the family, not instead of it.* | Alexa | "I'm not here to replace anyone. I just keep the family's words, so nobody has to remember alone. From here, let me show you." |
| 0:32 | Clock → 7:10 PM. Speaker Minji: "I gave Mom her blood pressure pill." Caption: *Already logged? It asks before writing it twice.* | Alexa | "Just a heads-up — blood pressure pill is already in the log as given. Me, 8:04 AM: … Could you double-check it wasn't already given? Want me to record another one anyway? Your call." |
| 0:55 | Minji: "No, never mind." Caption: *The check is plain code. The decision stays with people.* | Alexa | "Okay, I won't log it. Thanks for double-checking." |
| 1:05 | Joon: "Mom didn't take her metformin." Minji: "I gave Mom her metformin." Minji: "Did Mom take her metformin?" Caption: *Two accounts? It reads both and asks.* | Alexa | "I'm hearing two different things about metformin. Joon, …; and Minji, …. Could you check with each other? I don't want to guess." |
| 1:40 | Clock → next day 9:00 AM. Speaker Ana (carer): "Catch me up." Handoff card. Caption: *Next morning: the latest words, and what's still open.* | Alexa | "Welcome back. … Most recent: … One thing to look at: Conflicting reports on metformin." |
| 2:05 | Right panel: scroll the MCP log — initialize (2025-11-25), tools/list, tools/call. Caption: *A real MCP server. Bedrock reads the sentence; code decides the facts.* | — | (no narration) |
| 2:25 | README architecture diagram. Caption: *Amazon Bedrock · Amazon Polly · MCP over Streamable HTTP · not medical advice* | — | (no narration) |
| 2:40 | Maker on camera. | Maker | "Care Ledger keeps our words. We keep the decisions. Thank you." |
| 2:48 | End card: *Care Ledger · not medical advice* | — | — |

## Maker's lines, in order

1. Hi. I made Care Ledger.
2. My family shares the care of my mom.
3. Three of us give her medicine.
4. So every day, someone asks the same question.
5. …wait. Mom, did you take your blood pressure pill?
6. Care Ledger keeps our words. We keep the decisions. Thank you.

## Notes

- From 0:32 to 2:40 nobody narrates: Alexa does the work and one caption line explains each beat.
- Use the time buttons rather than waiting.
- If Bedrock is off, the header shows `brain: rules`; change the 2:05 caption to "A rule parser reads the sentence; code decides the facts."
- No third-party music or trademarks on screen beyond the AWS service names.
