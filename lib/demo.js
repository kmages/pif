// Greeting demo routes (/demo...). A private prototype for meetings:
// no payment is taken, nothing is recorded, no email or text is sent.
// Everything sits behind PIF_DEMO_KEY and uses its own tables.

import { timingSafeEqual } from 'node:crypto';
import { screenText } from './screen.js';
import {
  OCCASION_LABEL, LINK_DAYS, MIN_SECONDS, MAX_SECONDS, draftScript, scriptSeconds, scriptFlag,
} from './demo-script.js';
import * as view from './demo-views.js';

const DAY = 86_400_000;
const TOKEN = '([\\w-]{20,})';
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const SAMPLE_ORDER = {
  occasion: 'appreciation',
  recipient_name: 'Dana',
  pronounce: 'DAY-nuh',
  details: ['You trained four new hires this year.', 'You have not missed a delivery date since March.', 'You stayed late to help a customer finish a move.'],
  buyer_name: 'Sam Rivera',
  buyer_email: 'sam@example.com',
};
const SAMPLE_NOMINATION = {
  nominator_name: 'Sam Rivera',
  nominator_role: 'customer',
  worker_name: 'Dana',
  shop: 'Northside Hardware',
  what: 'Found the right part on the first try and showed me how to fit it.',
};

export function createDemo({ db, demoKey, now, limited, token, sha, clean, readForm }) {
  const pass = demoKey ? sha(`pif-demo:${demoKey}`) : '';
  const same = (a, b) => timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)));

  const q = {
    insertOrder: db.prepare(`INSERT INTO demo_orders
      (token, occasion, recipient_name, pronounce, details, buyer_name, buyer_email, script, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    orderByToken: db.prepare('SELECT * FROM demo_orders WHERE token = ?'),
    orderByDelivery: db.prepare("SELECT * FROM demo_orders WHERE delivery_token = ? AND status = 'approved'"),
    submitOrder: db.prepare("UPDATE demo_orders SET script = ?, flag = ?, status = 'review', submitted_at = ? WHERE id = ? AND status = 'draft'"),
    approveOrder: db.prepare("UPDATE demo_orders SET status = 'approved', delivery_token = ?, reviewed_at = ?, expires_at = ? WHERE id = ? AND status = 'review'"),
    declineOrder: db.prepare("UPDATE demo_orders SET status = 'declined', reviewed_at = ? WHERE id = ? AND status = 'review'"),
    waiting: db.prepare("SELECT * FROM demo_orders WHERE status = 'review' ORDER BY submitted_at"),
    reviewed: db.prepare("SELECT * FROM demo_orders WHERE status IN ('approved', 'declined') ORDER BY reviewed_at DESC LIMIT 20"),
    insertNomination: db.prepare(`INSERT INTO demo_nominations
      (token, nominator_name, nominator_role, worker_name, shop, what, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    nominationByToken: db.prepare('SELECT * FROM demo_nominations WHERE token = ?'),
    workerAnswer: db.prepare("UPDATE demo_nominations SET worker_answer = ?, updated_at = ? WHERE id = ? AND worker_answer = ''"),
    publicAnswer: db.prepare("UPDATE demo_nominations SET public_answer = ?, updated_at = ? WHERE id = ? AND worker_answer = 'yes' AND public_answer = ''"),
    resetAnswers: db.prepare("UPDATE demo_nominations SET worker_answer = '', public_answer = '', updated_at = ? WHERE id = ?"),
  };

  return async function demo(c) {
    const { url, p, method, get } = c;
    if (!demoKey) return c.notFound();

    // The key in the link is used once. After that a cookie carries the visit.
    const key = url.searchParams.get('key');
    if (get && key && same(key, demoKey)) {
      c.cookie('pif_demo', pass, { maxAge: 30 * 86_400 });
      url.searchParams.delete('key');
      return c.redirect(p + url.search);
    }
    if (!c.cookies.pif_demo || !same(c.cookies.pif_demo, pass)) return c.notFound();

    const post = method === 'POST';
    const busy = () => limited(c.ip, 'demo', 120);
    const tooMany = () => c.send(429, 'Too many tries. Wait a little and try again.', 'text/plain');

    if (get && p === '/demo') return c.send(200, view.home());

    // --- Order a greeting ---
    if (get && p === '/demo/order') {
      return c.send(200, view.orderForm({ values: url.searchParams.get('sample') === '1' ? SAMPLE_ORDER : {} }));
    }
    if (post && p === '/demo/order') {
      const f = await readForm(c.req);
      const v = {
        occasion: clean(f.get('occasion'), 20),
        recipient_name: clean(f.get('recipient_name'), 40),
        pronounce: clean(f.get('pronounce'), 60),
        details: f.getAll('details').slice(0, 3).map((d) => clean(d, 80)),
        buyer_name: clean(f.get('buyer_name'), 60),
        buyer_email: clean(f.get('buyer_email'), 120),
      };
      const details = v.details.filter(Boolean);
      const errors = [];
      if (!OCCASION_LABEL[v.occasion]) errors.push('Pick an occasion.');
      if (!v.recipient_name) errors.push('Add their first name.');
      if (details.length < 2) errors.push('Add at least two details. Short and true.');
      if (!v.buyer_name) errors.push('Add your name.');
      if (!EMAIL.test(v.buyer_email)) errors.push('Add an email address so we can tell you when it is ready.');
      for (const [field, label] of [['recipient_name', 'Their name'], ['pronounce', 'How to say it'], ['buyer_name', 'Your name']]) {
        if (screenText(v[field])) errors.push(`${label} has something that does not belong there. Keep it to a name.`);
      }
      if (errors.length) return c.send(422, view.orderForm({ values: v, errors }));
      if (busy()) return tooMany();

      const t = token();
      q.insertOrder.run(t, v.occasion, v.recipient_name, v.pronounce, JSON.stringify(details), v.buyer_name, v.buyer_email,
        draftScript({ ...v, details }), now());
      return c.redirect(`/demo/o/${t}/script`);
    }

    let m = p.match(new RegExp(`^/demo/o/${TOKEN}/script$`));
    if (m) {
      const order = q.orderByToken.get(m[1]);
      if (!order) return c.notFound();
      if (order.status !== 'draft') return c.redirect(`/demo/o/${order.token}`);
      if (get) return c.send(200, view.script({ order }));
      if (post) {
        const f = await readForm(c.req);
        const script = clean(f.get('script'), 1200);
        const secs = scriptSeconds(script);
        let error = '';
        if (!script) error = 'The script is empty.';
        else if (secs < MIN_SECONDS) error = `That is about ${secs} seconds. Add a little so it runs at least ${MIN_SECONDS}.`;
        else if (secs > MAX_SECONDS) error = `That is about ${secs} seconds. Trim it so it runs ${MAX_SECONDS} or less.`;
        if (error) return c.send(422, view.script({ order: { ...order, script }, error }));
        q.submitOrder.run(script, scriptFlag(script), now(), order.id);
        return c.redirect(`/demo/o/${order.token}`);
      }
    }

    m = p.match(new RegExp(`^/demo/o/${TOKEN}$`));
    if (get && m) {
      const order = q.orderByToken.get(m[1]);
      if (!order) return c.notFound();
      if (order.status === 'draft') return c.redirect(`/demo/o/${order.token}/script`);
      return c.send(200, view.orderStatus({ order, link: `${c.origin}/demo/v/${order.delivery_token}` }));
    }

    // --- Human review ---
    if (get && p === '/demo/review') {
      return c.send(200, view.review({ waiting: q.waiting.all(), reviewed: q.reviewed.all() }));
    }
    if (post && p === '/demo/review') {
      const f = await readForm(c.req);
      const id = Number(f.get('id'));
      const action = f.get('action');
      if (action === 'approve') q.approveOrder.run(token(), now(), now() + LINK_DAYS * DAY, id);
      else if (action === 'decline') q.declineOrder.run(now(), id);
      return c.redirect('/demo/review');
    }

    // --- Delivery ---
    m = p.match(new RegExp(`^/demo/v/${TOKEN}$`));
    if (get && m) {
      const order = q.orderByDelivery.get(m[1]);
      if (!order) return c.notFound();
      if (now() > order.expires_at) return c.send(410, view.expired({ order }));
      return c.send(200, view.delivery({ order }));
    }

    // --- Nominate a worker ---
    if (get && p === '/demo/nominate') {
      return c.send(200, view.nominateForm({ values: url.searchParams.get('sample') === '1' ? SAMPLE_NOMINATION : {} }));
    }
    if (post && p === '/demo/nominate') {
      const f = await readForm(c.req);
      const v = {
        nominator_name: clean(f.get('nominator_name'), 60),
        nominator_role: clean(f.get('nominator_role'), 20),
        worker_name: clean(f.get('worker_name'), 60),
        shop: clean(f.get('shop'), 80),
        what: clean(f.get('what'), 300),
      };
      const errors = [];
      if (!v.nominator_name) errors.push('Add your name.');
      if (v.nominator_role !== 'employer' && v.nominator_role !== 'customer') errors.push('Say if you are their employer or a customer.');
      if (!v.worker_name) errors.push('Say who did the good work.');
      if (!v.shop) errors.push('Say where they work.');
      if (!v.what) errors.push('Say what they did.');
      for (const [field, label] of [['nominator_name', 'Your name'], ['worker_name', 'Their name'], ['shop', 'The shop'], ['what', 'What they did']]) {
        const flag = screenText(v[field]);
        if (flag) errors.push(`${label} has something that does not belong there (${flag}). Keep it to the work.`);
      }
      if (errors.length) return c.send(422, view.nominateForm({ values: v, errors }));
      if (busy()) return tooMany();

      const t = token();
      q.insertNomination.run(t, v.nominator_name, v.nominator_role, v.worker_name, v.shop, v.what, now(), now());
      return c.redirect(`/demo/n/${t}`);
    }
    m = p.match(new RegExp(`^/demo/n/${TOKEN}$`));
    if (m) {
      const nom = q.nominationByToken.get(m[1]);
      if (!nom) return c.notFound();
      if (get) return c.send(200, view.nomination({ nom }));
      if (post) {
        const f = await readForm(c.req);
        const step = f.get('step');
        const answer = f.get('answer') === 'yes' ? 'yes' : 'no';
        if (step === 'worker') q.workerAnswer.run(answer, now(), nom.id);
        else if (step === 'public') q.publicAnswer.run(answer, now(), nom.id);
        else if (step === 'reset') q.resetAnswers.run(now(), nom.id);
        return c.redirect(`/demo/n/${nom.token}`);
      }
    }

    return c.notFound();
  };
}
