// Keyword screen for free text. Rule: praise the work, never looks,
// and never anything that helps someone find or track a person.
//
// This is a first filter, not a judge. A flagged note is held for a human
// to read in /admin. Badges are fixed choices, so they are always safe.

const HARSH = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'slut', 'whore',
  'idiot', 'stupid', 'moron', 'loser', 'ugly', 'hate', 'worst', 'terrible', 'awful',
  'lazy', 'useless', 'incompetent', 'rude', 'scam', 'fraud', 'liar',
];

const PERSONAL = [
  'sexy', 'gorgeous', 'handsome', 'good looking', 'good-looking', 'cute', 'hottie',
  'boyfriend', 'girlfriend', 'marry', 'go out with', 'date me', 'your number',
  'phone number', 'call me', 'text me', 'dm me', 'her body', 'his body', 'legs', 'lips',
];

const TRACKING = [
  'shift', 'works every', 'gets off at', 'lives at', 'lives on', 'lives in', 'home address',
  'license plate', 'drives a',
];

const PATTERNS = [
  ['contact', /(?:\d[\s().-]?){7,}/],
  ['contact', /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
  ['contact', /(?:https?:\/\/|www\.)\S+/i],
  ['contact', /(^|\s)@\w{2,}/],
  ['location', /\b\d{1,6}\s+\w+(?:\s\w+)?\s(?:st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|ct|court)\b/i],
];

function hasWord(text, list) {
  return list.find((w) => new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, '[-\\s]')}([^a-z]|$)`, 'i').test(text));
}

/** Returns '' when clean, or a short reason when a human should look. */
export function screenText(text) {
  const t = String(text || '');
  if (!t.trim()) return '';
  let hit = hasWord(t, HARSH);
  if (hit) return `harsh word: ${hit}`;
  hit = hasWord(t, PERSONAL);
  if (hit) return `personal, not about the work: ${hit}`;
  hit = hasWord(t, TRACKING);
  if (hit) return `schedule or location: ${hit}`;
  for (const [kind, re] of PATTERNS) if (re.test(t)) return `${kind} details`;
  return '';
}
