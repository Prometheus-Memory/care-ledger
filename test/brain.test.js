import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseByRules } from '../src/brain.js';

const cases = [
  ['I gave Dad his blood pressure pill', { intent: 'log', kind: 'med', item: 'blood pressure pill', status: 'given' }],
  ['Did Dad take his blood pressure pill?', { intent: 'ask', item: 'blood pressure pill' }],
  ['Dad refused his metformin', { intent: 'log', kind: 'med', item: 'metformin', status: 'refused' }],
  ["He didn't take his vitamin", { intent: 'log', kind: 'med', item: 'vitamin d', status: 'not_given' }],
  ['Dad ate lunch', { intent: 'log', kind: 'meal', item: 'lunch' }],
  ['Catch me up', { intent: 'handoff' }],
  ['Yes', { intent: 'confirm' }],
  ['No, never mind', { intent: 'cancel' }],
  ['Forget that', { intent: 'forget_last' }],
  ["Actually he didn't take the blood pressure pill", { intent: 'correct', item: 'blood pressure pill', status: 'not_given' }],
  ['Okay, I gave Dad his blood pressure pill', { intent: 'log', kind: 'med', item: 'blood pressure pill', status: 'given' }],
  ['He seems a bit tired today', { intent: 'log', kind: 'note' }],
];

for (const [text, want] of cases) {
  test(`rules: ${text}`, () => assert.deepEqual(parseByRules(text), want));
}
