// Repeat-check settings for the sample ledger. Plain data, judged by code, never by the language model.
// minHours: a second "given" record for the same item inside this window is held so a person can check
// whether it was already given. These are demo settings, not dosing guidance — a family would set their own.
export const MED_RULES = {
  'blood pressure pill': { minHours: 20, label: 'sample check window: 20 h' },
  'metformin': { minHours: 10, label: 'sample check window: 10 h' },
  'vitamin d': { minHours: 20, label: 'sample check window: 20 h' },
  'pain reliever': { minHours: 6, label: 'sample check window: 6 h' },
  'eye drops': { minHours: 4, label: 'sample check window: 4 h' },
};

export const DEFAULT_MED_RULE = { minHours: 4, label: 'sample check window: 4 h' };

export function ruleFor(item) {
  return MED_RULES[normalizeItem(item)] || DEFAULT_MED_RULE;
}

export function normalizeItem(item) {
  return String(item || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export const KNOWN_ITEMS = Object.keys(MED_RULES);
