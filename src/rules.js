// Repeat-guard rules. Plain data, judged by code, never by the language model.
// minHours: a second "given" record for the same item inside this window is held for confirmation.
export const MED_RULES = {
  'blood pressure pill': { minHours: 20, label: 'once a day' },
  'metformin': { minHours: 10, label: 'twice a day' },
  'vitamin d': { minHours: 20, label: 'once a day' },
  'pain reliever': { minHours: 6, label: 'at most every 6 hours' },
  'eye drops': { minHours: 4, label: 'every 4 hours' },
};

export const DEFAULT_MED_RULE = { minHours: 4, label: 'default 4-hour window' };

export function ruleFor(item) {
  return MED_RULES[normalizeItem(item)] || DEFAULT_MED_RULE;
}

export function normalizeItem(item) {
  return String(item || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export const KNOWN_ITEMS = Object.keys(MED_RULES);
