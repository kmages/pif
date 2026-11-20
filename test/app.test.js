import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, normalizePhone } from '../server.js';
import { screenText } from '../lib/screen.js';

async function start(opts = {}) {
  const app = createApp({ dbPath: ':memory:', adminKey: 'test-admin', ...opts });
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
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    };
  };
  return { app, base, client, close: () => new Promise((r) => app.server.close(r)) };
}

const GIVE = { recipient_name: 'Roxie', context: 'Manager, Costco', giver_name: 'Ken Mages', badges: 'fixed', note: 'She owned the problem and fixed it.' };

async function give(c, over = {}) {
  const r = await c('/give', { ...GIVE, ...over });
  assert.equal(r.status, 303, r.text);
  return r.location.replace('/sent/', '');
}

test('give, claim, record, pass it on', async () => {
  const s = await start();
  try {
    const ken = s.client();
    const tok = await give(ken);
    const sent = await ken(`/sent/${tok}`);
    assert.match(sent.text, new RegExp(`${s.base}/w/${tok}`));

    const roxie = s.client();
    const page = await roxie(`/w/${tok}`);
    assert.match(page.text, /Ken Mages put in a good word for you/);
    assert.match(page.text, /She owned the problem/);

    const claimed = await roxie(`/w/${tok}/claim`, { name: 'Roxanne', phone: '(312) 555-0142', adult: '1' });
    assert.equal(claimed.location, '/record?new=1');
    const rec = await roxie('/record?new=1');
    assert.match(rec.text, /1 good word from 1 person/);
    assert.match(rec.text, /who deserves a good word from you/);

    // Private by default, public by choice.
    const slug = s.app.db.prepare('SELECT slug FROM people').get().slug;
    assert.equal((await s.client()(`/r/${slug}`)).status, 404);
    await roxie('/record/visibility', { is_public: '1' });
    const pub = await s.client()(`/r/${slug}`);
    assert.equal(pub.status, 200);
    assert.match(pub.text, /She owned the problem/);

    // She can hide one word from the public record.
    const id = s.app.db.prepare('SELECT id FROM good_words').get().id;
    await roxie(`/record/word/${id}`, { hidden: '1' });
    assert.doesNotMatch((await s.client()(`/r/${slug}`)).text, /She owned the problem/);

    // Passing it on is tied to her record, which feeds the Day-90 number.
    await give(roxie, { recipient_name: 'Dana', giver_name: 'Roxanne' });
    const admin = await s.client()('/admin?key=test-admin');
    assert.match(admin.text, /Claimers who gave a good word within 14 days<\/th><td>1 \(100%\)/);
    assert.equal((await s.client()('/admin?key=wrong')).status, 404);
  } finally { await s.close(); }
});

test('a phone number alone never opens an existing record', async () => {
  const s = await start();
  try {
    const giver = s.client();
    const first = await give(giver);
    const second = await give(giver, { note: '' });
    const roxie = s.client();
    await roxie(`/w/${first}/claim`, { name: 'Roxanne', phone: '3125550142', adult: '1' });

    const stranger = s.client();
    const r = await stranger(`/w/${second}/claim`, { name: 'Not Roxie', phone: '312-555-0142', adult: '1' });
    assert.equal(r.status, 422);
    assert.match(r.text, /already has a record/);
    assert.equal((await stranger('/record')).status, 401);

    // The owner gets back in with the private link, on a new device.
    const key = s.app.db.prepare('SELECT return_key FROM people').get().return_key;
    const phone2 = s.client();
    assert.equal((await phone2(`/me/${key}`)).location, '/record');
    assert.equal((await phone2(`/w/${second}/claim`, {})).location, '/record?new=1');
    assert.match((await phone2('/record')).text, /2 good words from 1 person/);
  } finally { await s.close(); }
});

test('a flagged note is held for review, the badges still go through', async () => {
  const s = await start();
  try {
    const c = s.client();
    const tok = await give(c, { note: 'She is gorgeous, call me at 312 555 0199' });
    const page = await s.client()(`/w/${tok}`);
    assert.doesNotMatch(page.text, /gorgeous/);
    assert.match(page.text, /Fixed it right/);
    assert.match(page.text, /A person reads it before it is shown/);

    const id = s.app.db.prepare('SELECT id FROM good_words').get().id;
    await c('/admin/note', { key: 'test-admin', id: String(id), action: 'rejected' });
    assert.doesNotMatch((await s.client()(`/w/${tok}`)).text, /gorgeous|A person reads it/);
  } finally { await s.close(); }
});

test('give needs a name, a signature and a badge, and escapes what it shows', async () => {
  const s = await start();
  try {
    const c = s.client();
    const bad = await c('/give', { recipient_name: '', giver_name: '', note: 'x' });
    assert.equal(bad.status, 422);
    assert.match(bad.text, /Say who did the good work/);
    assert.match(bad.text, /Tap at least one/);

    const tok = await give(c, { recipient_name: '<script>alert(1)</script>', note: '<b>great</b> weld' });
    const page = await c(`/w/${tok}`);
    assert.doesNotMatch(page.text, /<script>alert/);
    assert.match(page.text, /&lt;b&gt;great&lt;\/b&gt; weld/);
  } finally { await s.close(); }
});

test('phone numbers and the screen', () => {
  assert.equal(normalizePhone('(312) 555-0142'), '+13125550142');
  assert.equal(normalizePhone('1 312 555 0142'), '+13125550142');
  assert.equal(normalizePhone('555-0142'), '');
  assert.equal(screenText('Did a beautiful job on the weld, pretty fast too'), '');
  assert.equal(screenText('Fixed my furnace on the first visit'), '');
  assert.notEqual(screenText('what an idiot'), '');
  assert.notEqual(screenText('she works every Tuesday night'), '');
  assert.notEqual(screenText('email me at a@b.com'), '');
});
