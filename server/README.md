# Orator Academy — backend

Node/Express backend for the AI + integration features (per the plan in
`~/.claude/plans/now-for-the-ai-typed-mango.md`). **All four pieces are implemented:**
photo→notes, whole-state sync + persistence, the SMS payment-reminder button, and the Gmail
payment auto-apply pipeline.

> **Everything works with zero credentials.** Each integration has a dev-mock / dormant
> fallback, so you can run and click through the entire app for free, then fill in keys one at a
> time as you get them.

## Run it

```bash
cd server
npm install
cp .env.example .env     # optional — works without any keys in dev-mock mode
npm run dev              # http://localhost:8787
```

Then run the frontend in another terminal (`cd .. && npm run dev` → http://localhost:5180). The
frontend calls the backend at `http://localhost:8787` (override with `VITE_API_BASE`).

## Where data lives (storage)

- **Local dev (default):** a single JSON file at `server/data/db.json`. No database to install,
  no native modules — just works. (`data/` is gitignored.)
- **Cloud:** set `DATABASE_URL` to a Postgres URL (Neon/Railway/Supabase) and the same code uses
  Postgres instead. Tables are auto-created on boot — **no migration step to run.** Use a
  **separate `DATABASE_URL` for the test instance vs. production** so test data never touches her
  real data.

> _Deviation from the plan:_ the plan said Prisma + SQLite locally. We use a JSON file locally and
> `pg` for Postgres in the cloud instead — it needs no DB install, no native build on Windows, and
> no `prisma migrate` step, so "all you do is set env vars" actually holds. The cloud target is
> still managed Postgres, switched with one env var.

The **whole app state** (the React reducer state) is stored as one JSON snapshot; server-only
tables (`processed_emails`, `audit_log`, `sms_log`, `captured_emails`) back the integrations. The
email poller writes payments into the same snapshot the browser syncs, so there's one source of
truth and no reducer duplication.

## Turning each integration "live"

| Feature | Dev-mock behavior (no creds) | Make it real |
|---|---|---|
| **Photo notes** | returns canned sample notes | set `ANTHROPIC_API_KEY` |
| **SMS reminder** | logs the text, returns ok | set `TWILIO_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` |
| **Gmail auto-apply (parsing)** | regex fallback parses PayPal/Venmo; use the in-app **Simulate email** tool | set `ANTHROPIC_API_KEY` → Claude parses PayPal/Venmo/Zelle |
| **Gmail auto-apply (live inbox)** | poller dormant | set `PARSER_IMAP_USER` + `PARSER_IMAP_PASS` (a dedicated Gmail's app password) |
| **Cloud persistence** | JSON file on disk | set `DATABASE_URL` (Postgres) |

See `.env.example` for every variable with notes.

## Endpoints

**Photo notes**
- `POST /api/ai/parse-notes` — body `{ image, className, date, roster:[{id,name}] }`
  → `{ mock, model, result:{ classGoals, classNotes, students:[{name,goals,notes,matchedStudentId}] } }`

**State sync**
- `GET /api/state` → `{ state, version }`
- `PUT /api/state` — body `{ state, baseVersion }` → `{ state, version }` (reconciles auto-applied payments)

**SMS**
- `GET  /api/sms/status` → `{ configured }`
- `POST /api/sms/payment-reminder` — body `{ studentId, to, message }` → `{ ok, mock, send }`
- `GET  /api/sms/log` → `{ sends:[…] }`

**Integrations / Gmail pipeline**
- `GET  /api/integrations/status` → `{ ai, sms, email, emailModel }`
- `GET  /api/integrations/audit` → `{ audit:[…] }`
- `GET  /api/integrations/needs-attention` → `{ items:[…] }` (no-match / refund / unreadable)
- `GET  /api/integrations/captured-emails` → `{ emails:[…] }` (dev pipeline proof)
- `POST /api/integrations/payments/:id/undo` → reverses an auto-applied payment
- `POST /api/integrations/simulate-email` — body `{ from, subject, text }` → runs a fake email
  through the **real** pipeline (parse → match → apply) so you can prove it before wiring a real inbox
- `GET  /api/health` → `{ ok, aiConfigured, smsConfigured, emailConfigured, model }`

## How the Gmail pipeline works

The poller (`jobs/pollParserInbox.js`) reads a dedicated parser inbox over IMAP. For each new email:
1. **Detect provider** by sender, then **Claude (`ANTHROPIC_EMAIL_MODEL`, Haiku by default) parses
   PayPal, Venmo, and Zelle** into `{ amount, senderName, memo, transactionId }`. A deterministic
   regex parser is kept only as an **offline fallback** for PayPal/Venmo when no API key is set
   (local dev / the in-app "Simulate email" tool).
2. **Match** the memo to a student (parents put the student's name in the memo).
3. **Auto-apply** as a payment, with **idempotency** (dedupe on transaction id / message id),
   an **audit log**, and **one-click undo**. Refunds / no-matches go to a **needs-attention** list
   instead of applying.

Tokens are only spent on emails that actually arrive in the parser inbox (the teacher's forward
filters ensure only transaction emails reach it), and the cheap email model keeps that in cents.
