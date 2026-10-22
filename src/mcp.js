// MCP server: five tools over the ledger. Built on @modelcontextprotocol/sdk 1.x (spec 2025-11-25).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const asOf = z.string().optional().describe('Answer as of this ISO time (simulator clock); default now');
const subject = z.string().default('Dad').describe('Who the care is for');

export function buildMcpServer(ledger) {
  const server = new McpServer({ name: 'care-ledger', version: '1.0.0' });

  server.registerTool('log_event', {
    title: 'Log a care event',
    description: 'Append what a family member said happened (medicine, meal, note, or a correction). '
      + 'Medicine marked "given" (or a correction to "given") passes the repeat check first; if held, nothing is written until confirmRepeat is true. '
      + 'Only log what already happened, for the person named in the sentence; ask first when unsure.',
    inputSchema: {
      who: z.string().describe('Person speaking'),
      text: z.string().describe('Their exact words'),
      kind: z.enum(['med', 'meal', 'note', 'correction']),
      item: z.string().optional().describe('Medicine or meal name'),
      status: z.enum(['given', 'not_given', 'refused']).optional(),
      corrects: z.string().optional().describe('Event id this corrects (kind=correction)'),
      subject: z.string().describe('Who the care is for, as said (e.g. "Dad", "Mom"); no default'),
      at: z.string().optional().describe('ISO time it happened; default now'),
      confirmRepeat: z.boolean().optional(),
    },
  }, async args => reply(await ledger.logEvent(args)));

  server.registerTool('get_status', {
    title: 'Get care status with evidence',
    description: 'Recompute the current state from raw events. Each item carries who said what and when; '
      + 'status "conflict" means people disagree — present both and ask.',
    inputSchema: { item: z.string().optional(), subject, hours: z.number().default(24), asOf: asOf },
  }, async args => reply(await ledger.getStatus(args)));

  server.registerTool('check_repeat', {
    title: 'Check for a repeat dose',
    description: 'Deterministic check on the sample ledger: is a "given" record for this item already inside its check window? '
      + 'It is a "was it already given?" prompt, not dosing advice.',
    inputSchema: { item: z.string(), subject, at: z.string().optional() },
  }, async args => reply(await ledger.checkRepeat(args)));

  server.registerTool('handoff', {
    title: 'Shift handoff card',
    description: 'What happened since a time (default last 24 hours): up to three lines with exact words, plus open questions.',
    inputSchema: { since: z.string().optional(), subject, asOf },
  }, async args => reply(await ledger.handoff(args)));

  server.registerTool('forget', {
    title: 'Forget an event',
    description: 'Append a forget record and scrub the original words; every later answer excludes it.',
    inputSchema: { eventId: z.string(), who: z.string() },
  }, async args => reply(await ledger.forget(args)));

  return server;
}

function reply(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}

