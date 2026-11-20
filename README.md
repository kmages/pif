# Pay It Forward

Someone did good work. Tell them.

A three-screen web prototype: **give** a good word, **claim** it, keep it on a **record** you own.
It is the Week 1 to 2 build from the Worth Saying 90-day plan (Ken Mages and Alan Morgan, 2026-11-20).

## Run it

Needs Node 24 or newer. There are no dependencies to install.

```bash
npm start          # http://127.0.0.1:8095
npm test
```

| Variable | What it does | Default |
|---|---|---|
| `PORT`, `HOST` | Where it listens | `8095`, `127.0.0.1` |
| `PIF_DB` | SQLite file | `data/pif.db` |
| `PIF_ADMIN_KEY` | Turns on `/admin?key=...`. Unset means no admin page. | unset |
| `PIF_BASE_URL` | Public address used in links, e.g. `https://example.com` | from the request |
| `PIF_TRUST_PROXY` | Set to `1` behind nginx so HTTPS and client IPs are read from proxy headers | off |

## How it works

1. **Give** (`/give`). Name the person, tap one or more of four badges, add a line by typing or speaking, sign your name.
   `/give?for=Roxie&at=Costco` pre-fills the form, so a QR code is just a URL.
2. **Send** (`/sent/<token>`). The giver texts or shares the link from their own phone. The app never texts anyone.
3. **Claim** (`/w/<token>`). The worker sees who said it and keeps it with a name and mobile number.
4. **Record** (`/record`). Private by default. The owner can make it public, which gives a reference link (`/r/<slug>`), and can hide any single good word.
5. **Pass it on.** After claiming, the first thing shown is "who deserves a good word from you?"

`/admin` shows the two Day-90 numbers from the plan: the share of good words claimed within 7 days, and the share of claimers who give one within 14 days. It also lists notes waiting for review.

## Rules built in

- The only action is a signed good word. There are no ratings, comments or anonymous posts.
- Badges are fixed choices. The free-text note goes through a keyword screen (`lib/screen.js`). A flagged note is held until a person approves it in `/admin`. The badges are delivered either way.
- Nothing is public until the worker claims it and chooses to share.
- Speech is turned into text in the browser. No audio reaches the server.
- Givers get no reward and no points.

## Not built yet

- **Text-message verification.** Nothing proves a phone number belongs to the person typing it. Until that exists, the first person to claim with a number owns that record, and a number alone never opens an existing record: the owner uses the private link on their record page. This must be fixed before a real pilot.
- **AI screening.** The screen is a keyword list. The plan calls for an AI screen plus human review.
- **Verified givers** and the limit of one good word per giver per worker per month.
- Shop routing, QR and NFC printing, the monthly digest, awards and sponsor pools (Weeks 3 to 12).
- Hosting. Nothing is deployed.

## Layout

```
server.js        routes and request handling
lib/db.js        SQLite schema
lib/screen.js    keyword screen for free text
lib/views.js     HTML, brand name, badge list
static/          CSS and browser script
test/            end-to-end tests (node --test)
```
