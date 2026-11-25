export const BRAND = 'Pay It Forward';

export const BADGES = [
  ['fixed', 'Fixed it right'],
  ['above', 'Went above and beyond'],
  ['knows', 'Knows their stuff'],
  ['day', 'Made my day'],
];
const BADGE_LABEL = Object.fromEntries(BADGES);

export function h(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function day(ms) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function layout(title, body, { person, head = '', nav } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
<link rel="stylesheet" href="/static/app.css">${head}
</head>
<body>
<header class="top">
  <a class="brand" href="/">${h(BRAND)}</a>
  <nav>${nav ?? (person ? `<a href="/record">My record</a>` : `<a href="/give">Put in a good word</a>`)}</nav>
</header>
<main>
${body}
</main>
<footer class="foot">
  <p>Praise the work. Signed with a real name. Adults only.</p>
</footer>
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

function card(w, { showNote = true, controls = '' } = {}) {
  const badges = JSON.parse(w.badges).map((b) => `<li>${h(BADGE_LABEL[b] || b)}</li>`).join('');
  let note = '';
  if (w.note && showNote) {
    if (w.note_status === 'ok') note = `<blockquote>${h(w.note)}</blockquote>`;
    else if (w.note_status === 'held') note = `<p class="held">There is also a note. A person reads it before it is shown.</p>`;
  }
  return `<article class="word">
  <ul class="badges">${badges}</ul>
  ${note}
  <p class="by">${h(w.giver_name)}${w.context ? ` <span class="ctx">· ${h(w.context)}</span>` : ''} <span class="when">· ${day(w.created_at)}</span></p>
  ${controls}
</article>`;
}

export function home({ person }) {
  return layout(BRAND, `
<section class="hero">
  <h1>Someone did good work.<br>Tell them.</h1>
  <p class="lede">Put in a good word in about 20 seconds. They keep it on a record they own.</p>
  <p><a class="btn" href="/give">Put in a good word</a></p>
</section>
<section class="steps">
  <ol>
    <li><strong>Say it.</strong> One tap, plus a line if you want. Speak it or type it.</li>
    <li><strong>Send it.</strong> You text them the link from your own phone.</li>
    <li><strong>They keep it.</strong> It lands on their record. Private unless they share it.</li>
  </ol>
</section>`, { person });
}

export function giveForm({ person, values = {}, errors = [], giverName = '' }) {
  const picked = new Set(values.badges || []);
  const badgeInputs = BADGES.map(([id, label]) => `
    <label class="chip"><input type="checkbox" name="badges" value="${id}"${picked.has(id) ? ' checked' : ''}><span>${h(label)}</span></label>`).join('');
  return layout(`Put in a good word · ${BRAND}`, `
<h1>Put in a good word</h1>
${errors.length ? `<div class="errors" role="alert"><ul>${errors.map((e) => `<li>${h(e)}</li>`).join('')}</ul></div>` : ''}
<form method="post" action="/give" class="stack">
  <label>Who did the good work?
    <input name="recipient_name" required maxlength="80" autocomplete="off" placeholder="Roxie" value="${h(values.recipient_name)}">
  </label>
  <label>What do they do, or where? <span class="opt">optional</span>
    <input name="context" maxlength="120" autocomplete="off" placeholder="Manager, Costco" value="${h(values.context)}">
  </label>
  <fieldset>
    <legend>What did they do? Tap all that fit.</legend>
    <div class="chips">${badgeInputs}</div>
  </fieldset>
  <label>Add a line <span class="opt">optional</span>
    <textarea id="note" name="note" maxlength="500" rows="3" placeholder="She owned the problem and fixed it in two days.">${h(values.note)}</textarea>
  </label>
  <p><button type="button" class="btn ghost" data-mic hidden aria-pressed="false">Speak it</button></p>
  <label>Your name
    <input name="giver_name" required maxlength="80" autocomplete="name" value="${h(values.giver_name ?? giverName)}">
  </label>
  <p class="fine">Your name is shown to them, and on their record if they choose to make it public. Praise the work, not looks.</p>
  <button class="btn" type="submit">Make the link</button>
</form>`, { person });
}

export function sent({ person, word, link }) {
  const msg = `${word.giver_name} put in a good word for you on ${BRAND}. It's yours to keep:`;
  const sms = `sms:?&body=${encodeURIComponent(`${msg} ${link}`)}`;
  return layout(`Send it · ${BRAND}`, `
<h1>Now send it to ${h(word.recipient_name)}</h1>
<p class="lede">It only counts if they see it. Send the link from your own phone.</p>
${card(word)}
<div class="stack">
  <a class="btn" href="${h(sms)}">Text it</a>
  <button class="btn ghost" type="button" data-share data-text="${h(msg)}" data-url="${h(link)}" hidden>Share another way</button>
  <label>Or copy the link
    <input readonly value="${h(link)}" data-copy-source>
  </label>
  <button class="btn ghost" type="button" data-copy="${h(link)}">Copy link</button>
</div>
<p class="fine">We never text or email anyone. You send it, so it comes from someone they know.</p>
<p><a href="/give">Put in another good word</a></p>`, { person });
}

export function claim({ person, word, error = '', values = {} }) {
  let action;
  if (word.recipient_id) {
    action = person && person.id === word.recipient_id
      ? `<p><a class="btn" href="/record">Open my record</a></p>`
      : `<p class="fine">This good word is already on someone's record.</p>`;
  } else if (person) {
    action = `<form method="post" action="/w/${h(word.token)}/claim" class="stack">
  <button class="btn" type="submit">Add it to my record</button>
</form>`;
  } else {
    action = `<form method="post" action="/w/${h(word.token)}/claim" class="stack">
  <h2>Keep it</h2>
  <p>Put it on a record that belongs to you. Private unless you choose to share it.</p>
  ${error ? `<div class="errors" role="alert"><p>${h(error)}</p></div>` : ''}
  <label>Your name
    <input name="name" required maxlength="80" autocomplete="name" value="${h(values.name ?? word.recipient_name)}">
  </label>
  <label>Your mobile number
    <input name="phone" required type="tel" inputmode="tel" autocomplete="tel" placeholder="(312) 555-0142" value="${h(values.phone)}">
  </label>
  <label class="check"><input type="checkbox" name="adult" value="1" required${values.adult ? ' checked' : ''}> I am 18 or older</label>
  <button class="btn" type="submit">Keep it</button>
  <p class="fine">Your number is how your record stays yours. We do not text you or share it.</p>
</form>`;
  }
  return layout(`A good word for ${word.recipient_name} · ${BRAND}`, `
<p class="eyebrow">For ${h(word.recipient_name)}</p>
<h1>${h(word.giver_name)} put in a good word for you</h1>
${card(word)}
${action}`, { person });
}

export function record({ person, words, given, origin, isNew }) {
  const shown = words.filter((w) => !w.hidden);
  const givers = new Set(words.map((w) => (w.giver_id ? `#${w.giver_id}` : w.giver_name.trim().toLowerCase())));
  const publicUrl = `${origin}/r/${person.slug}`;
  const returnUrl = `${origin}/me/${person.return_key}`;
  const list = words.map((w) => card(w, {
    controls: `<form method="post" action="/record/word/${w.id}" class="inline">
      <input type="hidden" name="hidden" value="${w.hidden ? 0 : 1}">
      <button class="link" type="submit">${w.hidden ? 'Hidden from your public record. Show it' : 'Hide from public record'}</button>
    </form>`,
  })).join('');
  return layout(`${person.name}'s record · ${BRAND}`, `
${isNew ? `<section class="passon">
  <h2>It's on your record. Now, who deserves a good word from you?</h2>
  <p><a class="btn" href="/give">Pay it forward</a></p>
</section>` : ''}
<p class="eyebrow">Your record</p>
<h1>${h(person.name)}</h1>
<p class="lede">${plural(words.length, 'good word', 'good words')} from ${plural(givers.size, 'person', 'people')}</p>

<section class="panel">
  <form method="post" action="/record/visibility" class="inline">
    <input type="hidden" name="is_public" value="${person.is_public ? 0 : 1}">
    <p><strong>${person.is_public ? 'Your record is public.' : 'Your record is private.'}</strong>
    ${person.is_public ? `Anyone with the link can see ${plural(shown.length, 'good word', 'good words')}.` : 'Only you can see it.'}</p>
    <button class="btn ghost" type="submit">${person.is_public ? 'Make it private' : 'Make it public'}</button>
  </form>
  ${person.is_public ? `<label>Your reference link
    <input readonly value="${h(publicUrl)}">
  </label>
  <button class="btn ghost" type="button" data-copy="${h(publicUrl)}">Copy link</button>` : ''}
</section>

${list || '<p>No good words yet.</p>'}

${isNew ? '' : `<p><a class="btn" href="/give">Put in a good word for someone</a></p>`}
${given.length ? `<h2>Good words you gave</h2>
<ul class="given">${given.map((g) => `<li>${h(g.recipient_name)} <span class="when">· ${day(g.created_at)} · ${g.claimed_at ? 'they kept it' : `<a href="/sent/${h(g.token)}">not seen yet, send it again</a>`}</span></li>`).join('')}</ul>` : ''}

<details class="panel">
  <summary>Open your record on another phone or computer</summary>
  <p>This private link opens your record. Save it somewhere safe and do not share it.</p>
  <input readonly value="${h(returnUrl)}">
  <button class="btn ghost" type="button" data-copy="${h(returnUrl)}">Copy private link</button>
  <form method="post" action="/signout" class="inline"><button class="link" type="submit">Sign out on this device</button></form>
</details>`, { person });
}

export function publicRecord({ person, owner, words }) {
  const givers = new Set(words.map((w) => (w.giver_id ? `#${w.giver_id}` : w.giver_name.trim().toLowerCase())));
  return layout(`${owner.name} · ${BRAND}`, `
<p class="eyebrow">Record</p>
<h1>${h(owner.name)}</h1>
<p class="lede">${plural(words.length, 'good word', 'good words')} from ${plural(givers.size, 'person', 'people')}</p>
${words.map((w) => card(w)).join('') || '<p>No good words to show yet.</p>'}
<p><a class="btn ghost" href="/give?for=${encodeURIComponent(owner.name)}">Put in a good word for ${h(owner.name)}</a></p>`, { person });
}

export function message({ person, title, body, status }) {
  return layout(`${title} · ${BRAND}`, `<h1>${h(title)}</h1>${body}`, { person, status });
}

export function admin({ key, stats, held, recent }) {
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
  return layout(`Admin · ${BRAND}`, `
<h1>Pilot numbers</h1>
<table class="stats">
  <tr><th>Good words sent</th><td>${stats.sent}</td></tr>
  <tr><th>Claimed</th><td>${stats.claimed} (${pct(stats.claimed, stats.sent)})</td></tr>
  <tr><th>Claimed within 7 days</th><td>${stats.claimed7} (${pct(stats.claimed7, stats.sent)})</td></tr>
  <tr><th>Claimed within 7 days, of words at least 7 days old</th><td>${stats.matureClaimed7} of ${stats.mature} (${pct(stats.matureClaimed7, stats.mature)})</td></tr>
  <tr><th>People with a record</th><td>${stats.people}</td></tr>
  <tr><th>Claimers who gave a good word within 14 days</th><td>${stats.passedOn} (${pct(stats.passedOn, stats.claimers)})</td></tr>
  <tr><th>Notes waiting for review</th><td>${held.length}</td></tr>
</table>
<p class="fine">Day-90 gates: 40% claimed within 7 days, 25% pass it on within 14 days.</p>

<h2>Notes waiting for review</h2>
${held.map((w) => `<article class="word">
  <p class="by">${h(w.giver_name)} to ${h(w.recipient_name)} <span class="when">· ${day(w.created_at)} · flagged: ${h(w.note_flag)}</span></p>
  <blockquote>${h(w.note)}</blockquote>
  <form method="post" action="/admin/note" class="inline">
    <input type="hidden" name="key" value="${h(key)}"><input type="hidden" name="id" value="${w.id}">
    <button class="btn ghost" name="action" value="ok" type="submit">Show it</button>
    <button class="btn ghost" name="action" value="rejected" type="submit">Remove the note</button>
  </form>
</article>`).join('') || '<p>Nothing waiting.</p>'}

<h2>Latest 100</h2>
<table class="log">
  <tr><th>Sent</th><th>From</th><th>To</th><th>Claimed</th></tr>
  ${recent.map((w) => `<tr><td>${day(w.created_at)}</td><td>${h(w.giver_name)}</td><td>${h(w.recipient_name)}</td><td>${w.claimed_at ? day(w.claimed_at) : ''}</td></tr>`).join('')}
</table>`);
}
