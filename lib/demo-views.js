// HTML for the greeting demo. Every page goes through page(), which adds the
// "Demo. Not a live product." label and a noindex tag.

import { BRAND, h, day, layout } from './views.js';
import {
  OCCASIONS, OCCASION_LABEL, PRICE, LINK_DAYS, MIN_SECONDS, MAX_SECONDS, CONTENT_RULES, scriptSeconds, scriptHits,
} from './demo-script.js';

function page(title, body) {
  return layout(`${title} · Demo · ${BRAND}`, `<p class="demo-tag">Demo. Not a live product.</p>
${body}`, {
    head: '\n<meta name="robots" content="noindex, nofollow">',
    nav: '<a href="/demo">Demo home</a>',
  });
}

function errorList(errors) {
  return errors.length ? `<div class="errors" role="alert"><ul>${errors.map((e) => `<li>${h(e)}</li>`).join('')}</ul></div>` : '';
}

/** Steps with a state each: done, now, wait or stop. */
function track(steps) {
  return `<ol class="track">${steps.map(([state, title, body]) => `
  <li class="${state}"><strong>${title}</strong>${body ? `<div>${body}</div>` : ''}</li>`).join('')}
</ol>`;
}

/** Script text with the flagged stretches marked. */
function marked(text) {
  let out = '';
  let at = 0;
  for (const hit of scriptHits(text)) {
    const end = hit.index + hit.length;
    if (end <= at) continue;
    const start = Math.max(hit.index, at);
    out += `${h(text.slice(at, start))}<mark class="flag" title="${h(hit.reason)}">${h(text.slice(start, end))}</mark>`;
    at = end;
  }
  return out + h(text.slice(at));
}

function player(order) {
  return `<figure class="player">
  <div class="screen">
    <span class="sample">Sample</span>
    <span class="play" aria-hidden="true"></span>
    <p>This is a sample, not a real recording.</p>
  </div>
  <figcaption>In the live product, the performer's recorded greeting for ${h(order.recipient_name)} plays here. About ${scriptSeconds(order.script)} seconds.</figcaption>
</figure>`;
}

export function home() {
  return page('Personal greetings', `
<p class="eyebrow">Private prototype</p>
<h1>A personal greeting, recorded by a licensed performer</h1>
<p class="lede">Two ways in. A person approves every script before anything is recorded.</p>
<section class="path">
  <h2>Order a greeting</h2>
  <p>Pick the occasion, add a few true details, check the script. They get a private link.</p>
  <a class="btn" href="/demo/order">Order a greeting</a>
</section>
<section class="path">
  <h2>Nominate a worker</h2>
  <p>An employer or customer names someone who did good work. The worker is asked first.</p>
  <a class="btn" href="/demo/nominate">Nominate a worker</a>
</section>
<section class="path">
  <h2>Human review</h2>
  <p>Every script waits here until a person approves or declines it.</p>
  <a class="btn ghost" href="/demo/review">Open the review queue</a>
</section>
<p class="fine">Phase one is recorded by the performer from approved scripts. No AI avatar. No synthetic voice. This demo takes no payment, sends no messages and holds no real recording.</p>`);
}

export function orderForm({ values = {}, errors = [] }) {
  const details = values.details || [];
  const hints = ['You trained four new hires this year.', 'You have not missed a delivery date since March.', 'You stayed late to help a customer.'];
  return page('Order a greeting', `
<p class="eyebrow">Step 1 of 3</p>
<h1>Order a greeting</h1>
<p class="fine"><a href="/demo/order?sample=1">Fill in a sample</a></p>
${errorList(errors)}
<form method="post" action="/demo/order" class="stack">
  <fieldset>
    <legend>What is the occasion?</legend>
    <div class="chips">${OCCASIONS.map(([id, label]) => `
      <label class="chip"><input type="radio" name="occasion" value="${id}" required${values.occasion === id ? ' checked' : ''}><span>${h(label)}</span></label>`).join('')}
    </div>
  </fieldset>
  <label>Their first name
    <input name="recipient_name" required maxlength="40" autocomplete="off" placeholder="Dana" value="${h(values.recipient_name)}">
  </label>
  <label>How do you say it? <span class="opt">optional</span>
    <input name="pronounce" maxlength="60" autocomplete="off" placeholder="DAY-nuh" value="${h(values.pronounce)}">
  </label>
  <fieldset class="stack tight">
    <legend>Two or three things they did. Short, positive and true. Write each one to them, starting with "You".</legend>
    ${[0, 1, 2].map((i) => `<input name="details" maxlength="80" autocomplete="off" aria-label="Detail ${i + 1}"${i < 2 ? ' required' : ''} placeholder="${h(hints[i])}" value="${h(details[i])}">`).join('\n    ')}
  </fieldset>
  <label>Your name
    <input name="buyer_name" required maxlength="60" autocomplete="name" value="${h(values.buyer_name)}">
  </label>
  <label>Your email
    <input name="buyer_email" required type="email" maxlength="120" autocomplete="email" value="${h(values.buyer_email)}">
  </label>
  <p class="fine">Demo: no email is sent.</p>
  <button class="btn" type="submit">Draft the script</button>
</form>`);
}

export function script({ order, error = '' }) {
  return page('Check the script', `
<p class="eyebrow">Step 2 of 3 · ${h(OCCASION_LABEL[order.occasion])} for ${h(order.recipient_name)}</p>
<h1>Check the script</h1>
<p class="lede">We drafted this from your details. Change anything you like. A person reviews it before it is recorded.</p>
${error ? `<div class="errors" role="alert"><p>${h(error)}</p></div>` : ''}
<form method="post" action="/demo/o/${h(order.token)}/script" class="stack">
  <label>Script
    <textarea name="script" rows="13" maxlength="1200" required data-count>${h(order.script)}</textarea>
  </label>
  <p class="fine"><span data-count-out>About ${scriptSeconds(order.script)} seconds when read aloud.</span> Keep it between ${MIN_SECONDS} and ${MAX_SECONDS}.${order.pronounce ? ` The performer will say the name as "${h(order.pronounce)}".` : ''}</p>
  <section class="panel">
    <p class="eyebrow">Step 3 of 3 · Price</p>
    <p><strong>Demo: no card is taken.</strong></p>
    <p>Sample price: ${h(PRICE)} for one greeting. In the live product you pay here. If the script is declined, you get a full refund.</p>
  </section>
  <button class="btn" type="submit">Send for review</button>
</form>`);
}

export function orderStatus({ order, link }) {
  const name = h(order.recipient_name);
  let steps;
  let extra = '';
  if (order.status === 'approved') {
    steps = [
      ['done', 'Script sent', day(order.submitted_at)],
      ['done', 'Approved by a person', day(order.reviewed_at)],
      ['done', 'Ready', `The private link for ${name} works until ${day(order.expires_at)}. In the live product the performer records it after approval. Demo: the link is ready at once.`],
    ];
    extra = `<div class="stack">
  <label>Private link for ${name}
    <input readonly value="${h(link)}">
  </label>
  <a class="btn" href="/demo/v/${h(order.delivery_token)}">Open the greeting</a>
  <button class="btn ghost" type="button" data-copy="${h(link)}">Copy link</button>
</div>`;
  } else if (order.status === 'declined') {
    steps = [
      ['done', 'Script sent', day(order.submitted_at)],
      ['stop', 'Declined by a person', `${day(order.reviewed_at)}. The script did not meet the content rules. Nothing is recorded.`],
      ['done', 'Refund', 'You get a full refund. Demo: no card was taken, so there is nothing to refund.'],
    ];
    extra = `<p><a class="btn" href="/demo/order">Start a new order</a></p>`;
  } else {
    steps = [
      ['done', 'Script sent', day(order.submitted_at)],
      ['now', 'Waiting for review', 'A person reads every script before it is recorded.'],
      ['wait', 'Recorded and delivered', `${name} gets a private link.`],
    ];
    extra = `<p><a class="btn ghost" href="/demo/review">Presenter: open the review queue</a></p>`;
  }
  return page('Your order', `
<p class="eyebrow">Your order · ${h(OCCASION_LABEL[order.occasion])}</p>
<h1>A greeting for ${name}</h1>
${track(steps)}
${extra}
<details class="panel">
  <summary>The script you sent</summary>
  <p class="script">${h(order.script)}</p>
</details>`);
}

export function review({ waiting, reviewed }) {
  return page('Review queue', `
<p class="eyebrow">Human review</p>
<h1>Scripts waiting for review</h1>
<section class="panel">
  <p><strong>Content rules</strong></p>
  <ul class="rules">${CONTENT_RULES.map((r) => `<li>${h(r)}</li>`).join('')}</ul>
  <p class="fine">Words that may break a rule are <mark class="flag">marked</mark>. A mark is a prompt to look, not a verdict.</p>
</section>
${waiting.map((o) => `<article class="word">
  <p class="by">${h(OCCASION_LABEL[o.occasion])} for ${h(o.recipient_name)} <span>· from ${h(o.buyer_name)} · ${day(o.submitted_at)}</span></p>
  ${o.pronounce ? `<p class="fine">Say the name as "${h(o.pronounce)}".</p>` : ''}
  <p class="script">${marked(o.script)}</p>
  <p class="fine">About ${scriptSeconds(o.script)} seconds. ${o.flag ? `<strong class="flagged">Flagged: ${h(o.flag)}</strong>` : 'Nothing flagged.'}</p>
  <form method="post" action="/demo/review" class="pair">
    <input type="hidden" name="id" value="${o.id}">
    <button class="btn" name="action" value="approve" type="submit">Approve</button>
    <button class="btn ghost" name="action" value="decline" type="submit">Decline</button>
  </form>
</article>`).join('') || '<p>Nothing waiting.</p>'}

<h2>Reviewed</h2>
${reviewed.length ? `<ul class="given">${reviewed.map((o) => `<li>${h(OCCASION_LABEL[o.occasion])} for ${h(o.recipient_name)} <span class="when">· ${o.status === 'approved'
    ? `approved · <a href="/demo/v/${h(o.delivery_token)}">delivery link</a>`
    : 'declined'} · <a href="/demo/o/${h(o.token)}">buyer status</a></span></li>`).join('')}</ul>` : '<p class="fine">Nothing reviewed yet.</p>'}
<p><a href="/demo/order">Order a greeting</a></p>`);
}

export function delivery({ order }) {
  const name = h(order.recipient_name);
  return page(`A greeting for ${order.recipient_name}`, `
<p class="eyebrow">For ${name}</p>
<h1>${h(order.buyer_name)} sent you a greeting</h1>
${player(order)}
<h2>What it says</h2>
<p class="script">${h(order.script)}</p>
<section class="panel">
  <p><strong>This is yours.</strong> Sharing is optional. Keep it to yourself or show it to anyone you like.</p>
  <p class="fine">This private link works until ${day(order.expires_at)}, ${LINK_DAYS} days after it was approved.</p>
</section>
<section class="passon">
  <h2>Now, who deserves a good word from you?</h2>
  <p><a class="btn" href="/give">Pass it on</a></p>
</section>`);
}

export function expired({ order }) {
  return page('Link expired', `
<h1>This link has expired</h1>
<p>The greeting for ${h(order.recipient_name)} was open for ${LINK_DAYS} days. That ended on ${day(order.expires_at)}.</p>`);
}

export function nominateForm({ values = {}, errors = [] }) {
  const roles = [['employer', 'Their employer'], ['customer', 'A customer']];
  return page('Nominate a worker', `
<h1>Nominate a worker</h1>
<p class="lede">Name someone who did good work. They are asked first. Nothing is made without their yes.</p>
<p class="fine"><a href="/demo/nominate?sample=1">Fill in a sample</a></p>
${errorList(errors)}
<form method="post" action="/demo/nominate" class="stack">
  <label>Your name
    <input name="nominator_name" required maxlength="60" autocomplete="name" value="${h(values.nominator_name)}">
  </label>
  <fieldset>
    <legend>You are</legend>
    <div class="chips">${roles.map(([id, label]) => `
      <label class="chip"><input type="radio" name="nominator_role" value="${id}" required${values.nominator_role === id ? ' checked' : ''}><span>${h(label)}</span></label>`).join('')}
    </div>
  </fieldset>
  <label>Who did the good work?
    <input name="worker_name" required maxlength="60" autocomplete="off" placeholder="Dana" value="${h(values.worker_name)}">
  </label>
  <label>Where do they work?
    <input name="shop" required maxlength="80" autocomplete="off" placeholder="Northside Hardware" value="${h(values.shop)}">
  </label>
  <label>What did they do?
    <textarea name="what" required maxlength="300" rows="3" placeholder="Found the right part on the first try and showed me how to fit it.">${h(values.what)}</textarea>
  </label>
  <p class="fine">Praise the work. Demo: no message is sent to anyone.</p>
  <button class="btn" type="submit">Nominate</button>
</form>`);
}

export function nomination({ nom }) {
  const worker = h(nom.worker_name);
  const action = `/demo/n/${h(nom.token)}`;
  const ask = (step, yes, no) => `<form method="post" action="${action}" class="pair">
      <input type="hidden" name="step" value="${step}">
      <button class="btn" name="answer" value="yes" type="submit">${yes}</button>
      <button class="btn ghost" name="answer" value="no" type="submit">${no}</button>
    </form>
    <p class="fine">Demo buttons. They stand in for ${worker}'s answer.</p>`;
  const w = nom.worker_answer;
  const pub = nom.public_answer;

  const steps = [
    ['done', 'Nominated', `${h(nom.nominator_name)}, ${nom.nominator_role === 'employer' ? 'employer' : 'a customer'}, named ${worker} at ${h(nom.shop)}: "${h(nom.what)}"`],
  ];
  if (!w) {
    steps.push(['now', `Private message to ${worker}`, `${worker} gets a private message first. Nothing is made until they say yes.${ask('worker', 'Worker says yes', 'Worker says no')}`]);
    steps.push(['wait', 'Greeting recorded', 'Only after a yes. Approved script, human review.']);
    steps.push(['wait', 'Public feature', 'Needs a second, separate yes.']);
  } else if (w === 'no') {
    steps.push(['stop', `${worker} said no`, 'It stops here. Nothing is made and nothing is shown. The nominator is told only that it will not go ahead.']);
  } else {
    steps.push(['done', `${worker} said yes`, 'First yes: a private greeting may be made.']);
    steps.push(['done', 'Greeting recorded', `From an approved script, after human review. ${worker} gets it on a private link. Demo: nothing is recorded.`]);
    if (!pub) {
      steps.push(['now', 'Public feature', `A public feature needs a second, separate yes. Saying no here changes nothing about the private greeting.${ask('public', 'Worker says yes', 'Worker says no')}`]);
    } else if (pub === 'yes') {
      steps.push(['done', 'Cleared for a public feature', `Second yes given. ${worker} can take it back at any time.`]);
    } else {
      steps.push(['done', 'Stays private', `${worker} keeps the greeting. Nothing is featured in public.`]);
    }
  }

  return page(`Nomination for ${nom.worker_name}`, `
<p class="eyebrow">Nomination</p>
<h1>${worker}, ${h(nom.shop)}</h1>
<p class="lede">Two separate yes answers. The worker gives both.</p>
${track(steps)}
${w ? `<form method="post" action="${action}" class="inline">
  <input type="hidden" name="step" value="reset">
  <button class="link" type="submit">Demo: start the answers over</button>
</form>` : ''}
<p><a href="/demo">Back to the demo home</a></p>`);
}
