// What the assistant says back. Warm and short; every factual answer ends with its evidence
// (who, when, their words). When people disagree it says both and asks. It never gives medical advice.

export function clock(iso, tz) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

export function cite(ev, tz) {
  return `${ev.who}, ${clock(ev.at, tz)}: "${ev.said}"`;
}

const STATUS_WORDS = {
  given: 'was given',
  not_given: "wasn't given",
  refused: 'was refused',
};

export function sayLogged(res, tz) {
  if (res.needsConfirmation) {
    const p = res.check.previous;
    return `Just a heads-up — ${p.item} is already in the log as given. ${cite(p, tz)}. `
      + `Could you double-check it wasn't already given? Want me to record another one anyway? You decide.`;
  }
  const e = res.event;
  if (e.override) return `Okay, I've noted a second ${e.item} at your say-so. I'll flag it for whoever's next.`;
  if (e.kind === 'med') return `Got it — ${e.item} ${STATUS_WORDS[e.status] || 'noted'}. Thanks for keeping track.`;
  if (e.kind === 'meal') return `Noted — ${e.item}. Thank you.`;
  return "Thanks, I've written that down.";
}

// Before writing something unsure: it hasn't happened yet, or the medicine isn't one this ledger knows.
export function sayTentative(intent) {
  const whom = intent.subject || 'them';
  if (intent.reason === 'not_yet') {
    return `Sounds like that's still coming up, so I haven't logged it. Tell me once ${whom} has had it — `
      + `or say "yes" if it's already done and I'll note it now.`;
  }
  const what = intent.item ? `"${intent.item}"` : "that medicine";
  return `I don't have ${what} on my list yet, so I want to get it right. `
    + `Did ${whom} already have it? Say "yes" and I'll note it just as you said it.`;
}

export function sayStatus(status, item, tz) {
  const items = item ? status.items.filter(i => i.item === item) : status.items;
  if (!items.length) {
    return item
      ? `I don't have anything about ${item} in the last day. Nobody has logged it yet.`
      : "Nothing's been logged in the last day yet.";
  }
  return items.map(i => {
    if (i.status === 'conflict') {
      const accounts = i.evidence.map(ev => cite(ev, tz)).join('; and ');
      return `I'm hearing two different things about ${i.item}. ${accounts}. `
        + `Could you check with each other? I don't want to guess.`;
    }
    const last = i.evidence[i.evidence.length - 1];
    const corrected = last.correctedBy ? ` (corrected later — ${cite(last.correctedBy, tz)})` : '';
    return `Yes — ${i.item} ${STATUS_WORDS[i.status] || 'is noted'}.${corrected} Source: ${cite(last, tz)}.`
      .replace(/^Yes — (.*) wasn't/, 'Not yet — $1 wasn\'t')
      .replace(/^Yes — (.*) was refused/, 'Not today — $1 was refused');
  }).join(' ');
}

export function sayHandoff(card, tz) {
  if (!card.count) return "Quiet shift — nothing new since you left.";
  const lines = card.latest.map(e => cite(e, tz)).join('. Before that, ');
  const open = card.open.length ? ` One thing to look at: ${card.open.join('; ')}.` : '';
  return `Welcome back. ${card.count} update${card.count > 1 ? 's' : ''} since you left. Most recent: ${lines}.${open}`;
}

export function sayForgot(res) {
  return res.forgotten ? "Done — I've forgotten that one, and it won't show up in answers anymore." : "I couldn't find that one to forget.";
}
