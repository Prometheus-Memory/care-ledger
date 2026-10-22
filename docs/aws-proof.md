# AWS proof

What actually ran against AWS for this submission, and what did not. Keys and account ids are never written here.

## Amazon Bedrock — ran (one real round trip)

Command (same code path the server uses, `src/brain.js` → `understand()` → Bedrock Converse):

```bash
node --env-file-if-exists=.env scripts/aws-proof.mjs
```

Output, 2026-10-22, copied as printed:

```json
{"when":"2026-10-22T13:03:02.862Z","region":"us-east-1","modelId":"global.anthropic.claude-haiku-4-5-20251001-v1:0","engine":"bedrock:global.anthropic.claude-haiku-4-5-20251001-v1:0","sentence":"I gave Dad his blood pressure pill","intent":{"intent":"log","kind":"med","item":"blood pressure pill","status":"given","subject":"Dad"},"latencyMs":1976}
```

- `engine` starts with `bedrock:` only when the model answered; on any failure it falls back and says `rules`.
- Claude Haiku 4.5 on Bedrock only reads the sentence. Whether a record is a repeat, a conflict, or the answer itself is computed by code from stored events.

## Amazon DynamoDB — optional, not deployed

`src/store/dynamo.js` is written (append with `attribute_not_exists(seq)`; on a clash the ledger re-reads, re-checks and retries), but **no table was created and it was not run for this submission**. The demo and the default `npm start` use the local JSON-lines store. Turn it on with `CARE_STORE=dynamo` after creating the table described in the README.
