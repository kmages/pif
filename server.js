import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb } from './lib/db.js';
import { screenText } from './lib/screen.js';
import * as view from './lib/views.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DAY = 86_400_000;
const STATIC = {
  '/static/app.css': ['text/css; charset=utf-8', 'static/app.css'],
  '/static/app.js': ['text/javascript; charset=utf-8', 'static/app.js'],
};
const BADGE_IDS = new Set(view.BADGES.map(([id]) => id));

const token = (bytes = 24) => randomBytes(bytes).toString('base64url');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** US numbers only for now. Returns +1XXXXXXXXXX or ''. */
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 && /^[2-9]/.test(d) ? `+1${d}` : '';
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip bad cookie */ }
  }
  return out;
}

function readForm(req, limit = 16_384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

export function createApp(opts = {}) {
  const db = openDb(opts.dbPath ?? process.env.PIF_DB ?? path.join(ROOT, 'data', 'pif.db'));
  const adminKey = opts.adminKey ?? process.env.PIF_ADMIN_KEY ?? '';
  const baseUrl = (opts.baseUrl ?? process.env.PIF_BASE_URL ?? '').replace(/\/$/, '');
  const trustProxy = opts.trustProxy ?? process.env.PIF_TRUST_PROXY === '1';
  const now = opts.now ?? (() => Date.now());

  const q = {
    wordByToken: db.prepare('SELECT * FROM good_words WHERE token = ?'),
    insertWord: db.prepare(`INSERT INTO good_words
      (token, giver_name, giver_id, recipient_name, context, badges, note, note_status, note_flag, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    claimWord: db.prepare('UPDATE good_words SET recipient_id = ?, claimed_at = ? WHERE id = ? AND recipient_id IS NULL'),
    personByPhone: db.prepare('SELECT * FROM people WHERE phone = ?'),
    personBySlug: db.prepare('SELECT * FROM people WHERE slug = ?'),
    personByKey: db.prepare('SELECT * FROM people WHERE return_key = ?'),
    personBySession: db.prepare('SELECT p.* FROM sessions s JOIN people p ON p.id = s.person_id WHERE s.token_hash = ?'),
    insertPerson: db.prepare('INSERT INTO people (phone, name, slug, return_key, created_at) VALUES (?, ?, ?, ?, ?)'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, person_id, created_at) VALUES (?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    received: db.prepare('SELECT * FROM good_words WHERE recipient_id = ? ORDER BY claimed_at DESC'),
    receivedPublic: db.prepare('SELECT * FROM good_words WHERE recipient_id = ? AND hidden = 0 ORDER BY claimed_at DESC'),
    given: db.prepare('SELECT * FROM good_words WHERE giver_id = ? ORDER BY created_at DESC LIMIT 50'),
    setPublic: db.prepare('UPDATE people SET is_public = ? WHERE id = ?'),
    setHidden: db.prepare('UPDATE good_words SET hidden = ? WHERE id = ? AND recipient_id = ?'),
    setNoteStatus: db.prepare("UPDATE good_words SET note_status = ? WHERE id = ? AND note_status = 'held'"),
    held: db.prepare("SELECT * FROM good_words WHERE note_status = 'held' ORDER BY created_at"),
    recent: db.prepare('SELECT * FROM good_words ORDER BY created_at DESC LIMIT 100'),
  };

  // Small in-memory rate limit. Good enough for one process.
  const hits = new Map();
  function limited(ip, bucket, max, windowMs = 3_600_000) {
    const key = `${bucket}:${ip}`;
    const t = now();
    const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (list.length >= max) { hits.set(key, list); return true; }
    list.push(t);
    hits.set(key, list);
    return false;
  }

  function stats() {
    const t = now();
    const one = (sql, ...a) => Object.values(db.prepare(sql).get(...a))[0];
    return {
      sent: one('SELECT count(*) FROM good_words'),
      claimed: one('SELECT count(*) FROM good_words WHERE claimed_at IS NOT NULL'),
      claimed7: one('SELECT count(*) FROM good_words WHERE claimed_at IS NOT NULL AND claimed_at - created_at <= ?', 7 * DAY),
      mature: one('SELECT count(*) FROM good_words WHERE created_at <= ?', t - 7 * DAY),
      matureClaimed7: one('SELECT count(*) FROM good_words WHERE created_at <= ? AND claimed_at IS NOT NULL AND claimed_at - created_at <= ?', t - 7 * DAY, 7 * DAY),
      people: one('SELECT count(*) FROM people'),
      claimers: one('SELECT count(DISTINCT recipient_id) FROM good_words WHERE recipient_id IS NOT NULL'),
      passedOn: one(`SELECT count(*) FROM (
          SELECT recipient_id AS pid, min(claimed_at) AS first FROM good_words
          WHERE recipient_id IS NOT NULL GROUP BY recipient_id) c
        WHERE EXISTS (SELECT 1 FROM good_words g
          WHERE g.giver_id = c.pid AND g.created_at >= c.first AND g.created_at <= c.first + ?)`, 14 * DAY),
    };
  }

  function isAdmin(key) {
    if (!adminKey || !key) return false;
    const a = Buffer.from(sha(key));
    const b = Buffer.from(sha(adminKey));
    return timingSafeEqual(a, b);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const method = req.method;
    const https = trustProxy ? req.headers['x-forwarded-proto'] === 'https' : false;
    const ip = (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
    const origin = baseUrl || `${https ? 'https' : 'http'}://${req.headers.host}`;
    const cookies = parseCookies(req.headers.cookie);
    const person = cookies.pif_s ? q.personBySession.get(sha(cookies.pif_s)) : undefined;
    const setCookies = [];

    const cookie = (name, value, { httpOnly = true, maxAge = 31_536_000 } = {}) =>
      setCookies.push(`${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${httpOnly ? '; HttpOnly' : ''}${https ? '; Secure' : ''}`);
    const send = (status, body, type = 'text/html; charset=utf-8', extra = {}) => {
      res.writeHead(status, {
        'Content-Type': type,
        'Content-Security-Policy': "default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': p === '/' ? 'all' : 'noindex',
        'Cache-Control': 'no-store',
        ...(setCookies.length ? { 'Set-Cookie': setCookies } : {}),
        ...extra,
      });
      res.end(method === 'HEAD' ? undefined : body);
    };
    const redirect = (to) => send(303, '', 'text/plain', { Location: to });
    const notFound = () => send(404, view.message({ person, title: 'Not found', body: '<p>That page does not exist. <a href="/">Go home</a></p>' }));
    const signIn = (id) => {
      const t = token(32);
      q.insertSession.run(sha(t), id, now());
      cookie('pif_s', t);
    };
    const get = method === 'GET' || method === 'HEAD';

    if (get && STATIC[p]) {
      const [type, file] = STATIC[p];
      return send(200, readFileSync(path.join(ROOT, file)), type, { 'Cache-Control': 'public, max-age=300' });
    }
    if (get && p === '/healthz') return send(200, 'ok', 'text/plain');
    if (get && p === '/') return send(200, view.home({ person }));

    // --- Give ---
    if (get && p === '/give') {
      return send(200, view.giveForm({
        person,
        giverName: person?.name ?? cookies.pif_n ?? '',
        values: { recipient_name: clean(url.searchParams.get('for'), 80), context: clean(url.searchParams.get('at'), 120) },
      }));
    }
    if (method === 'POST' && p === '/give') {
      const f = await readForm(req);
      const v = {
        recipient_name: clean(f.get('recipient_name'), 80),
        context: clean(f.get('context'), 120),
        giver_name: clean(f.get('giver_name'), 80),
        note: clean(f.get('note'), 500),
        badges: [...new Set(f.getAll('badges'))].filter((b) => BADGE_IDS.has(b)),
      };
      const errors = [];
      if (!v.recipient_name) errors.push('Say who did the good work.');
      if (!v.giver_name) errors.push('Add your name. A good word is signed.');
      if (!v.badges.length) errors.push('Tap at least one thing they did.');
      for (const [field, label] of [['recipient_name', 'Their name'], ['context', 'What they do'], ['giver_name', 'Your name']]) {
        if (screenText(v[field])) errors.push(`${label} has something that does not belong there. Keep it to a name or a job.`);
      }
      if (!errors.length && limited(ip, 'give', 30)) errors.push('That is a lot of good words in one hour. Try again a little later.');
      if (errors.length) return send(422, view.giveForm({ person, values: v, errors }));

      const flag = screenText(v.note);
      const t = token();
      q.insertWord.run(t, v.giver_name, person?.id ?? null, v.recipient_name, v.context, JSON.stringify(v.badges),
        v.note, flag ? 'held' : 'ok', flag, now());
      cookie('pif_n', v.giver_name, { httpOnly: false });
      return redirect(`/sent/${t}`);
    }
    let m = p.match(/^\/sent\/([\w-]{20,})$/);
    if (get && m) {
      const word = q.wordByToken.get(m[1]);
      if (!word) return notFound();
      return send(200, view.sent({ person, word, link: `${origin}/w/${word.token}` }));
    }

    // --- Claim ---
    m = p.match(/^\/w\/([\w-]{20,})$/);
    if (get && m) {
      const word = q.wordByToken.get(m[1]);
      if (!word) return notFound();
      return send(200, view.claim({ person, word }));
    }
    m = p.match(/^\/w\/([\w-]{20,})\/claim$/);
    if (method === 'POST' && m) {
      const word = q.wordByToken.get(m[1]);
      if (!word) return notFound();
      if (word.recipient_id) return redirect(`/w/${word.token}`);
      if (person) {
        q.claimWord.run(person.id, now(), word.id);
        return redirect('/record?new=1');
      }
      const f = await readForm(req);
      const values = { name: clean(f.get('name'), 80), phone: clean(f.get('phone'), 30), adult: f.get('adult') === '1' };
      const phone = normalizePhone(values.phone);
      let error = '';
      if (!values.name || screenText(values.name)) error = 'Add your name.';
      else if (!phone) error = 'Enter a 10-digit US mobile number.';
      else if (!values.adult) error = 'This is for adults only for now.';
      else if (limited(ip, 'claim', 20)) error = 'Too many tries. Wait a little and try again.';
      else if (q.personByPhone.get(phone)) {
        // No text-message check exists yet, so a phone number alone must never open
        // an existing record. The owner signs in with their private link first.
        error = 'That number already has a record. Open your record first with your private link, then come back to this page.';
      }
      if (error) return send(422, view.claim({ person, word, error, values }));

      const slugBase = values.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'record';
      const id = Number(q.insertPerson.run(phone, values.name, `${slugBase}-${token(4).toLowerCase()}`, token(32), now()).lastInsertRowid);
      q.claimWord.run(id, now(), word.id);
      signIn(id);
      return redirect('/record?new=1');
    }

    // --- Record ---
    if (get && p === '/record') {
      if (!person) return send(401, view.message({ person, title: 'Your record', body: '<p>Open the link someone sent you, or your private link, to see your record.</p><p><a class="btn" href="/give">Put in a good word</a></p>' }));
      return send(200, view.record({ person, words: q.received.all(person.id), given: q.given.all(person.id), origin, isNew: url.searchParams.get('new') === '1' }));
    }
    if (method === 'POST' && p === '/record/visibility') {
      if (!person) return redirect('/record');
      const f = await readForm(req);
      q.setPublic.run(f.get('is_public') === '1' ? 1 : 0, person.id);
      return redirect('/record');
    }
    m = p.match(/^\/record\/word\/(\d+)$/);
    if (method === 'POST' && m) {
      if (!person) return redirect('/record');
      const f = await readForm(req);
      q.setHidden.run(f.get('hidden') === '1' ? 1 : 0, Number(m[1]), person.id);
      return redirect('/record');
    }
    m = p.match(/^\/me\/([\w-]{30,})$/);
    if (get && m) {
      if (limited(ip, 'me', 30)) return send(429, 'Too many tries.', 'text/plain');
      const owner = q.personByKey.get(m[1]);
      if (!owner) return notFound();
      signIn(owner.id);
      return redirect('/record');
    }
    if (method === 'POST' && p === '/signout') {
      if (cookies.pif_s) q.deleteSession.run(sha(cookies.pif_s));
      cookie('pif_s', '', { maxAge: 0 });
      return redirect('/');
    }
    m = p.match(/^\/r\/([a-z0-9_-]{3,60})$/i);
    if (get && m) {
      const owner = q.personBySlug.get(m[1]);
      if (!owner || !owner.is_public) return notFound();
      return send(200, view.publicRecord({ person, owner, words: q.receivedPublic.all(owner.id) }));
    }

    // --- Admin ---
    if (get && p === '/admin') {
      const key = url.searchParams.get('key') || '';
      if (!isAdmin(key)) return notFound();
      return send(200, view.admin({ key, stats: stats(), held: q.held.all(), recent: q.recent.all() }));
    }
    if (method === 'POST' && p === '/admin/note') {
      const f = await readForm(req);
      const key = f.get('key') || '';
      if (!isAdmin(key)) return notFound();
      const action = f.get('action');
      if (action === 'ok' || action === 'rejected') q.setNoteStatus.run(action, Number(f.get('id')));
      return redirect(`/admin?key=${encodeURIComponent(key)}`);
    }

    return notFound();
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(status === 413 ? 'Too large' : 'Something went wrong');
    });
  });
  return { server, db };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8095);
  const host = process.env.HOST || '127.0.0.1';
  createApp().server.listen(port, host, () => console.log(`Pay It Forward listening on http://${host}:${port}`));
}
