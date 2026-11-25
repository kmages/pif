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
| `PIF_DEMO_KEY` | Turns on the private greeting demo at `/demo?key=...`. Unset means no demo pages. | unset |
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

## Greeting demo

A private prototype for meetings, at `/demo`. It shows a possible licensed product: a buyer orders a short personal greeting, recorded by a licensed performer from a script a person has approved. No licence exists yet, so the demo names no performer and copies no one's voice or style.

It is a storyboard that clicks. It takes no payment, records nothing and sends no email or text. Every page says "Demo. Not a live product."

- **Key.** Set `PIF_DEMO_KEY`, then open `/demo?key=...` once. That sets a cookie and the rest of the walk needs no key. Without the cookie every demo page is a 404. It is a different key from the admin key, so the link can be handed to people outside.
- **Order** (`/demo/order`). Occasion, first name and how to say it, two or three true details, buyer name and email. `?sample=1` fills the form.
- **Script** (`/demo/o/<token>/script`). Drafted from templates in `lib/demo-script.js`. There is no AI call. The buyer can edit it. It must run 20 to 45 seconds. The price step is labelled "Demo: no card is taken."
- **Review** (`/demo/review`). Every script waits for a person. The content rules are shown and words that may break one are marked. Approve makes the delivery link. Decline shows the buyer a refund note.
- **Buyer status** (`/demo/o/<token>`). Waiting, approved with the link, or declined.
- **Delivery** (`/demo/v/<token>`). A placeholder player marked as a sample, the script as text, an expiry date 30 days out, and a "Pass it on" button into `/give`.
- **Nominate** (`/demo/nominate`, then `/demo/n/<token>`). An employer or customer names a worker. The status page shows the two consent steps: the worker says yes before anything is made, and a public feature needs a second, separate yes. Demo buttons stand in for the worker.

Demo rows live in their own tables, `demo_orders` and `demo_nominations`. Clear them by deleting the rows from those two tables.

## Not built yet

- **Text-message verification.** Nothing proves a phone number belongs to the person typing it. Until that exists, the first person to claim with a number owns that record, and a number alone never opens an existing record: the owner uses the private link on their record page. This must be fixed before a real pilot.
- **AI screening.** The screen is a keyword list. The plan calls for an AI screen plus human review.
- **Verified givers** and the limit of one good word per giver per worker per month.
- Shop routing, QR and NFC printing, the monthly digest, awards and sponsor pools (Weeks 3 to 12).
- A real domain. It runs on a nip.io address for now. See `deploy/README.md`.

## Layout

```
server.js        routes and request handling
lib/db.js        SQLite schema
lib/screen.js    keyword screen for free text
lib/views.js     HTML, brand name, badge list
lib/demo*.js     greeting demo: routes, script templates and rules, HTML
static/          CSS and browser script
test/            end-to-end tests (node --test)
```
