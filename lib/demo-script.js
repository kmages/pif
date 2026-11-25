// Greeting demo: occasions, script templates and the content rules.
//
// Scripts are plain template fill. There is no AI call. The voice is neutral
// and warm on purpose: it does not imitate any real person or character.

import { screenHits } from './screen.js';

export const OCCASIONS = [
  ['congratulations', 'Congratulations'],
  ['appreciation', 'Appreciation'],
  ['birthday', 'Birthday'],
];
export const OCCASION_LABEL = Object.fromEntries(OCCASIONS);

export const PRICE = '$14.99';
export const LINK_DAYS = 30;
export const MIN_SECONDS = 20;
export const MAX_SECONDS = 45;
const WORDS_PER_SECOND = 2.5;

export const CONTENT_RULES = [
  'No politics.',
  'No financial or medical advice.',
  'Nothing defamatory or deceptive.',
  'Praise the work, not looks. No contact details, schedules or addresses.',
];

// Extra word lists for scripts, on top of lib/screen.js. A hit does not reject
// anything. It marks the word so the reviewer sees it.
const SCRIPT_LISTS = [
  ['politics', ['election', 'elections', 'vote', 'votes', 'voting', 'ballot', 'democrat', 'democrats', 'republican', 'republicans', 'congress', 'senator', 'political', 'politics']],
  ['financial advice', ['invest', 'investing', 'investment', 'investments', 'stocks', 'crypto', 'bitcoin', 'guaranteed returns', 'get rich']],
  ['medical advice', ['cure', 'cures', 'diagnosis', 'diagnose', 'medication', 'prescription', 'dose', 'dosage', 'supplement', 'supplements', 'medical advice']],
  ['defamatory or deceptive', ['guarantee', 'guaranteed', 'endorse', 'endorses', 'endorsement', 'criminal', 'thief', 'stole', 'cheat', 'cheated', 'cheater']],
];

const TEMPLATES = {
  congratulations: ({ name, buyer, details }) =>
    `Hello ${name}. ${buyer} asked me to record a message just for you, and I am glad to do it. Congratulations. Here is what I was told. ${details} None of that happens by luck. It takes steady work, and the people around you saw it. So take a moment today and enjoy this. You earned it. Congratulations again, ${name}, from ${buyer} and from me.`,
  appreciation: ({ name, buyer, details }) =>
    `Hello ${name}. ${buyer} asked me to record a message just for you, and I am glad to do it. This one is a thank you. Here is what I was told. ${details} That kind of work is easy to miss, and ${buyer} did not miss it. It made a real difference. So thank you, ${name}. Thank you from ${buyer}, and thank you from me.`,
  birthday: ({ name, buyer, details }) =>
    `Hello ${name}. ${buyer} asked me to record a message just for you, and I am glad to do it. Happy birthday. Here is what I was told about you. ${details} That sounds like someone worth celebrating. I hope today is a good one, with people you like and something good to eat. Happy birthday, ${name}, from ${buyer} and from me.`,
};

function sentence(s) {
  const t = String(s).trim();
  if (!t) return '';
  const cap = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

export function draftScript({ occasion, recipient_name, buyer_name, details }) {
  const fill = TEMPLATES[occasion] || TEMPLATES.appreciation;
  return fill({ name: recipient_name, buyer: buyer_name, details: details.map(sentence).filter(Boolean).join(' ') });
}

export function scriptSeconds(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.round(words / WORDS_PER_SECOND);
}

/** Every flagged stretch of a script: [{ reason, index, length }]. */
export function scriptHits(text) {
  return screenHits(text, SCRIPT_LISTS);
}

/** Short summary for the queue, e.g. "politics, contact details". '' when clean. */
export function scriptFlag(text) {
  return [...new Set(scriptHits(text).map((x) => x.reason))].join(', ');
}
