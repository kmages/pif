import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { screenText, screenHits } from '../lib/screen.js';
import { OCCASIONS, draftScript, scriptSeconds, scriptFlag } from '../lib/demo-script.js';

const KEY = 'test-demo-key';

async function start(opts = {}) {
  const app = createApp({ dbPath: ':memory:', adminKey: 'test-admin', demoKey: KEY, ...opts });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  // A tiny browser: keeps cookies, does not follow redirects.
  const client = () => {
    const jar = new Map();
    return async (path, form) => {
      const res = await fetch(base + path, {
        method: form ? 'POST' : 'GET',
        redirect: 'manual',
        headers: {
          ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (pair.slice(i + 1)) jar.set(pair.slice(0, i), pair.slice(i + 1)); else jar.delete(pair.slice(0, i));
      }
      return { status: res.status, location: res.headers.get('location'), text: await res.text(), headers: res.headers };
    };
  };
  // A client that has already opened the demo link.
  const guest = async () => {
    const c = client();
    const r = await c(`/demo?key=${KEY}`);
    assert.equal(r.status, 303);
    assert.equal(r.location, '/demo');
    return c;
  };
  return { app, base, client, guest, close: () => new Promise((r) => app.server.close(r)) };
}

const LABEL = /Demo\. Not a live product\./;
const ORDER = [
  ['occasion', 'congratulations'],
  ['recipient_name', 'Dana'],
  ['pronounce', 'DAY-nuh'],
  ['details', 'You trained four new hires this year.'],
  ['details', 'you have not missed a delivery date since March'],
  ['details', ''],
  ['buyer_name', 'Sam Rivera'],
  ['buyer_email', 'sam@example.com'],
];

const TEXTAREA = /<textarea[^>]*>([^<]*)<\/textarea>/;
const unescape = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));
const draftOn = (page) => unescape(page.text.match(TEXTAREA)[1]);

/** Places an order and sends the script. Returns the buyer token. */
async function order(c, { fields = ORDER, script } = {}) {
  const made = await c('/demo/order', fields);
  assert.equal(made.status, 303, made.text);
  const tok = made.location.match(/^\/demo\/o\/([\w-]+)\/script$/)[1];
  const page = await c(made.location);
  assert.equal(page.status, 200);
  const sent = await c(made.location, { script: script ?? draftOn(page) });
  assert.equal(sent.status, 303, sent.text);
  assert.equal(sent.location, `/demo/o/${tok}`);
  return tok;
}

test('demo is off without a key, and hidden without the right one', async () => {
  const off = await start({ demoKey: '' });
  try {
    for (const path of ['/demo', `/demo?key=${KEY}`, '/demo/order', '/demo/review', '/demo/nominate']) {
      assert.equal((await off.client()(path)).status, 404, path);
    }
    assert.equal((await off.client()('/demo/order', ORDER)).status, 404);
  } finally { await off.close(); }

  const s = await start();
  try {
    for (const path of ['/demo', '/demo?key=wrong', '/demo?key=test-admin', '/demo/order', '/demo/review', '/demo/nominate', '/demo/v/aaaaaaaaaaaaaaaaaaaaaaaa']) {
      assert.equal((await s.client()(path)).status, 404, path);
    }
    assert.equal((await s.client()('/demo/order', ORDER)).status, 404);
    assert.equal((await s.client()('/demo/review', { id: '1', action: 'approve' })).status, 404);
    assert.equal(s.app.db.prepare('SELECT count(*) AS n FROM demo_orders').get().n, 0);

    // The key works once, on any demo page, and is dropped from the address.
    const c = s.client();
    const first = await c(`/demo/order?sample=1&key=${KEY}`);
    assert.equal(first.status, 303);
    assert.equal(first.location, '/demo/order?sample=1');
    assert.match(first.headers.getSetCookie().join(), /pif_demo=[0-9a-f]{64}; .*HttpOnly/);
    assert.doesNotMatch(first.headers.getSetCookie().join(), new RegExp(KEY));

    for (const path of ['/demo', '/demo/order', '/demo/review', '/demo/nominate']) {
      const r = await c(path);
      assert.equal(r.status, 200, path);
      assert.match(r.text, LABEL, path);
      assert.match(r.text, /<meta name="robots" content="noindex, nofollow">/, path);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex', path);
    }
    assert.match((await c('/demo/order?sample=1')).text, /value="DAY-nuh"/);

    // The demo key is not the admin key, and the rest of the app is unchanged.
    assert.equal((await c(`/admin?key=${KEY}`)).status, 404);
    assert.equal((await s.client()('/give')).status, 200);
    assert.doesNotMatch((await s.client()('/give')).text, LABEL);
  } finally { await s.close(); }
});

test('order a greeting: script, review, approval, delivery', async () => {
  let clock = Date.UTC(2026, 10, 25, 15);
  const s = await start({ now: () => clock });
  try {
    const buyer = await s.guest();
    const made = await buyer('/demo/order', ORDER);
    const scriptPath = made.location;
    const tok = scriptPath.split('/')[3];

    const page = await buyer(scriptPath);
    assert.match(page.text, LABEL);
    assert.match(page.text, /Hello Dana\. Sam Rivera asked me to record a message just for you/);
    assert.match(page.text, /You have not missed a delivery date since March\. None of that happens by luck/);
    assert.match(page.text, /Demo: no card is taken\./);
    assert.match(page.text, /\$14\.99/);
    assert.match(page.text, /say the name as "DAY-nuh"/);
    assert.doesNotMatch(page.text, /name="(card|cc|cvc|cvv|number|expiry)/i);
    // An unsent order has no status page yet.
    assert.equal((await buyer(`/demo/o/${tok}`)).location, scriptPath);

    // Too short and too long are sent back.
    const short = await buyer(scriptPath, { script: 'Hello Dana. Well done.' });
    assert.equal(short.status, 422);
    assert.match(short.text, /Add a little/);
    assert.equal((await buyer(scriptPath, { script: 'word '.repeat(150) })).status, 422);

    const edited = `${draftOn(page)} Well done.`;
    assert.equal((await buyer(scriptPath, { script: edited })).location, `/demo/o/${tok}`);
    const waiting = await buyer(`/demo/o/${tok}`);
    assert.match(waiting.text, /Waiting for review/);
    assert.doesNotMatch(waiting.text, /\/demo\/v\//);
    // A sent script cannot be changed.
    assert.equal((await buyer(scriptPath, { script: edited })).location, `/demo/o/${tok}`);

    const reviewer = await s.guest();
    const queue = await reviewer('/demo/review');
    assert.match(queue.text, /No politics\./);
    assert.match(queue.text, /No financial or medical advice\./);
    assert.match(queue.text, /Nothing defamatory or deceptive\./);
    assert.match(queue.text, /Congratulations for Dana/);
    assert.match(queue.text, /Nothing flagged\./);
    const id = queue.text.match(/name="id" value="(\d+)"/)[1];
    assert.equal((await reviewer('/demo/review', { id, action: 'approve' })).location, '/demo/review');

    const done = await buyer(`/demo/o/${tok}`);
    assert.match(done.text, /Approved by a person/);
    const link = done.text.match(/href="(\/demo\/v\/[\w-]+)"/)[1];
    assert.match(done.text, new RegExp(`${s.base}${link}`));
    assert.match((await reviewer('/demo/review')).text, new RegExp(link));

    const dana = await s.guest();
    const got = await dana(link);
    assert.equal(got.status, 200);
    assert.match(got.text, LABEL);
    assert.match(got.text, /Sam Rivera sent you a greeting/);
    assert.match(got.text, /This is a sample, not a real recording\./);
    assert.match(got.text, /from Sam Rivera and from me\. Well done\./);
    assert.match(got.text, /works until Dec 25, 2026, 30 days/);
    assert.match(got.text, /Sharing is optional\./);
    assert.match(got.text, /<a class="btn" href="\/give">Pass it on<\/a>/);
    assert.doesNotMatch(got.text, /<video|<audio|<iframe/);
    // The buyer token is not the delivery token, and the link needs the demo key.
    assert.equal((await dana(`/demo/v/${tok}`)).status, 404);
    assert.equal((await s.client()(link)).status, 404);

    clock += 31 * 86_400_000;
    const late = await dana(link);
    assert.equal(late.status, 410);
    assert.match(late.text, /This link has expired/);

    // Demo rows stay out of the real tables.
    assert.equal(s.app.db.prepare('SELECT count(*) AS n FROM good_words').get().n, 0);
    assert.equal(s.app.db.prepare('SELECT count(*) AS n FROM people').get().n, 0);
    assert.equal(s.app.db.prepare('SELECT count(*) AS n FROM demo_orders').get().n, 1);
  } finally { await s.close(); }
});

test('a declined script gets a refund note and no delivery link', async () => {
  const s = await start();
  try {
    const c = await s.guest();
    const tok = await order(c);
    const id = String(s.app.db.prepare('SELECT id FROM demo_orders').get().id);
    await c('/demo/review', { id, action: 'decline' });

    const page = await c(`/demo/o/${tok}`);
    assert.match(page.text, /Declined by a person/);
    assert.match(page.text, /full refund/);
    assert.match(page.text, /no card was taken/);
    assert.doesNotMatch(page.text, /\/demo\/v\//);
    assert.equal(s.app.db.prepare('SELECT delivery_token FROM demo_orders').get().delivery_token, null);

    // A decision is final: approving afterwards does nothing.
    await c('/demo/review', { id, action: 'approve' });
    assert.equal(s.app.db.prepare('SELECT status FROM demo_orders').get().status, 'declined');
    const queue = await c('/demo/review');
    assert.match(queue.text, /Nothing waiting\./);
    assert.match(queue.text, /declined/);
  } finally { await s.close(); }
});

test('the order form checks what it is given and escapes what it shows', async () => {
  const s = await start();
  try {
    const c = await s.guest();
    const bad = await c('/demo/order', [['occasion', 'roast'], ['recipient_name', ''], ['details', 'One thing.'], ['buyer_name', ''], ['buyer_email', 'nope']]);
    assert.equal(bad.status, 422);
    for (const msg of [/Pick an occasion/, /Add their first name/, /at least two details/, /Add your name/, /Add an email address/]) assert.match(bad.text, msg);

    const rude = await c('/demo/order', ORDER.map(([k, v]) => (k === 'recipient_name' ? [k, 'idiot'] : [k, v])));
    assert.equal(rude.status, 422);
    assert.match(rude.text, /Their name has something that does not belong there/);
    assert.equal(s.app.db.prepare('SELECT count(*) AS n FROM demo_orders').get().n, 0);

    const tok = await order(c, { fields: ORDER.map(([k, v]) => (k === 'buyer_name' ? [k, '<b>Sam</b>'] : [k, v])) });
    const page = await c('/demo/review');
    assert.doesNotMatch(page.text, /<b>Sam<\/b>/);
    assert.match(page.text, /&lt;b&gt;Sam&lt;\/b&gt;/);
    assert.match((await c(`/demo/o/${tok}`)).text, /&lt;b&gt;Sam&lt;\/b&gt;/);
  } finally { await s.close(); }
});

test('flagged words are marked for the reviewer, not shown to the buyer as a verdict', async () => {
  const s = await start();
  try {
    const c = await s.guest();
    // A flagged detail does not block the order. It reaches the reviewer inside the draft.
    const fields = ORDER.map(([k, v]) => (v.startsWith('You trained') ? [k, 'You should vote for him and invest in crypto.'] : [k, v]));
    const tok = await order(c, { fields });
    const row = s.app.db.prepare('SELECT flag, status FROM demo_orders').get();
    assert.equal(row.status, 'review');
    assert.equal(row.flag, 'politics, financial advice');

    const queue = await c('/demo/review');
    assert.match(queue.text, /<mark class="flag" title="politics">vote<\/mark>/);
    assert.match(queue.text, /<mark class="flag" title="financial advice">invest<\/mark>/);
    assert.match(queue.text, /<mark class="flag" title="financial advice">crypto<\/mark>/);
    assert.match(queue.text, /Flagged: politics, financial advice/);
    assert.doesNotMatch((await c(`/demo/o/${tok}`)).text, /<mark|Flagged/);

    // The existing screen lists apply too.
    await order(c, { script: `${'This is a kind and steady note about good work. '.repeat(6)}What an idiot. Call 312 555 0199 for a cure.` });
    const again = await c('/demo/review');
    assert.match(again.text, /<mark class="flag" title="harsh word">idiot<\/mark>/);
    assert.match(again.text, /<mark class="flag" title="contact details">312 555 0199<\/mark>/);
    assert.match(again.text, /<mark class="flag" title="medical advice">cure<\/mark>/);
  } finally { await s.close(); }
});

test('nominate a worker: two separate yes answers', async () => {
  const s = await start();
  try {
    const c = await s.guest();
    const NOM = { nominator_name: 'Sam Rivera', nominator_role: 'employer', worker_name: 'Dana', shop: 'Northside Hardware', what: 'Stayed late to finish the inventory count.' };

    const bad = await c('/demo/nominate', { ...NOM, nominator_role: '', what: 'She is gorgeous and works every Tuesday' });
    assert.equal(bad.status, 422);
    assert.match(bad.text, /employer or a customer/);
    assert.match(bad.text, /What they did has something that does not belong there/);

    const made = await c('/demo/nominate', NOM);
    assert.equal(made.status, 303);
    const path = made.location;
    assert.match(path, /^\/demo\/n\/[\w-]{20,}$/);
    assert.equal((await s.client()(path)).status, 404);

    let page = await c(path);
    assert.match(page.text, LABEL);
    assert.match(page.text, /Dana gets a private message first\. Nothing is made until they say yes\./);
    assert.match(page.text, /Needs a second, separate yes\./);
    assert.doesNotMatch(page.text, /name="step" value="public"/);

    // The public answer cannot come before the first yes.
    await c(path, { step: 'public', answer: 'yes' });
    assert.equal(s.app.db.prepare('SELECT public_answer FROM demo_nominations').get().public_answer, '');

    await c(path, { step: 'worker', answer: 'yes' });
    page = await c(path);
    assert.match(page.text, /Dana said yes/);
    assert.match(page.text, /A public feature needs a second, separate yes\./);
    assert.match(page.text, /name="step" value="public"/);
    assert.doesNotMatch(page.text, /Cleared for a public feature/);

    await c(path, { step: 'public', answer: 'no' });
    page = await c(path);
    assert.match(page.text, /Stays private/);

    // Start over: a no at the first step stops everything.
    await c(path, { step: 'reset' });
    await c(path, { step: 'worker', answer: 'no' });
    page = await c(path);
    assert.match(page.text, /Dana said no/);
    assert.match(page.text, /Nothing is made and nothing is shown/);
    await c(path, { step: 'public', answer: 'yes' });
    assert.equal(s.app.db.prepare('SELECT public_answer FROM demo_nominations').get().public_answer, '');

    await c(path, { step: 'reset' });
    await c(path, { step: 'worker', answer: 'yes' });
    await c(path, { step: 'public', answer: 'yes' });
    assert.match((await c(path)).text, /Cleared for a public feature/);
    assert.equal(s.app.db.prepare('SELECT count(*) AS n FROM good_words').get().n, 0);
  } finally { await s.close(); }
});

test('drafts fit the 20 to 45 second window, and the screen still gates the same way', () => {
  const short = ['You care.', 'You show up.'];
  const long = ['You trained four new hires this year and every one of them is still with us.', 'You have not missed a single delivery date since the first week of March.', 'You stayed two hours late to help a customer finish moving house.'];
  for (const [occasion] of OCCASIONS) {
    for (const details of [short, long]) {
      const secs = scriptSeconds(draftScript({ occasion, recipient_name: 'Dana', buyer_name: 'Sam Rivera', details }));
      assert.ok(secs >= 20 && secs <= 45, `${occasion}: ${secs}s`);
    }
  }
  assert.match(draftScript({ occasion: 'birthday', recipient_name: 'Dana', buyer_name: 'Sam', details: ['you make good coffee'] }), /about you\. You make good coffee\. That sounds/);

  assert.equal(scriptFlag('You fixed the furnace on the first visit.'), '');
  assert.deepEqual(screenHits('Fixed my furnace on the first visit'), []);
  for (const text of ['what an idiot', 'she works every Tuesday night', 'email me at a@b.com', 'Did a beautiful job on the weld']) {
    assert.equal(screenHits(text).length > 0, screenText(text) !== '', text);
  }
});
