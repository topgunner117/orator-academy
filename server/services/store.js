// Canonical data store for the backend.
//
// Two interchangeable drivers behind one interface:
//   • JSON file  (default, local dev)  — a single data/db.json file, zero external setup,
//                                         no native modules. Perfect for `npm run dev`.
//   • Postgres   (when DATABASE_URL is set) — managed Postgres in the cloud (Neon/Railway).
//
// We persist the *whole app state* as one JSON snapshot (the client's reducer state) plus a
// handful of server-only tables the client never edits (processed emails, audit log, SMS log,
// captured emails). This keeps a single source of truth and avoids re-implementing the entire
// reducer on the server — the email poller mutates the same snapshot the browser syncs.
//
// (Deliberate deviation from the plan's Prisma+SQLite: a JSON file needs no DB install and no
// native build on Windows, and switching to cloud Postgres is just one env var. Documented in
// the README.)

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

const usePg = !!process.env.DATABASE_URL

// ── tiny async mutex: serialize read-modify-write so concurrent calls never clobber ──
let chain = Promise.resolve()
function withLock(fn) {
  const run = chain.then(fn, fn)
  chain = run.then(
    () => {},
    () => {},
  )
  return run
}

const newId = () => randomUUID()
const round2 = (n) => Math.round(Number(n) * 100) / 100

const emptyDb = () => ({
  snapshot: { state: {}, version: 0 },
  processedEmails: [], // { key, messageId, provider, transactionId, amount, date, studentId, status }
  audit: [], // { id, type, paymentId, appliedVersion, undone, data, createdAt }
  smsLog: [], // { id, studentId, to, body, status, providerId, mock, createdAt }
  capturedEmails: [], // { id, ...email, createdAt }
  events: [], // dev Console feed: { id, kind, model, mock, summary, detail, createdAt }
})

// ─────────────────────────────────────────────────────────────────────────────
// JSON-file driver
// ─────────────────────────────────────────────────────────────────────────────
const jsonDriver = {
  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true })
    try {
      await fs.access(DB_FILE)
    } catch {
      await fs.writeFile(DB_FILE, JSON.stringify(emptyDb(), null, 2))
    }
  },
  async _read() {
    try {
      return { ...emptyDb(), ...JSON.parse(await fs.readFile(DB_FILE, 'utf8')) }
    } catch {
      return emptyDb()
    }
  },
  async _write(db) {
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2))
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Postgres driver (lazy — pg is only imported when DATABASE_URL is present)
// ─────────────────────────────────────────────────────────────────────────────
let pool = null
const pgDriver = {
  async init() {
    const { default: pg } = await import('pg')
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('sslmode=require') || process.env.PGSSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
    })
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id int PRIMARY KEY DEFAULT 1,
        state jsonb NOT NULL DEFAULT '{}',
        version int NOT NULL DEFAULT 0
      );
      INSERT INTO app_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS processed_emails (
        key text PRIMARY KEY, message_id text, provider text, transaction_id text,
        amount numeric, date text, student_id text, status text,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id text PRIMARY KEY, type text, payment_id text, applied_version int,
        undone boolean DEFAULT false, data jsonb, created_at timestamptz DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sms_log (
        id text PRIMARY KEY, student_id text, to_number text, body text, status text,
        provider_id text, mock boolean, created_at timestamptz DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS captured_emails (
        id text PRIMARY KEY, data jsonb, created_at timestamptz DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS events (
        id text PRIMARY KEY, kind text, model text, mock boolean,
        summary text, detail jsonb, created_at timestamptz DEFAULT now()
      );
    `)
  },
}

const driver = usePg ? pgDriver : jsonDriver

// ─────────────────────────────────────────────────────────────────────────────
// Public API — same surface for both drivers
// ─────────────────────────────────────────────────────────────────────────────
export async function init() {
  await driver.init()
  console.log(`[store] ready · ${usePg ? 'Postgres (DATABASE_URL)' : `JSON file (${DB_FILE})`}`)
}

export async function getState() {
  if (usePg) {
    const { rows } = await pool.query('SELECT state, version FROM app_state WHERE id = 1')
    const row = rows[0] || { state: {}, version: 0 }
    return { state: row.state || {}, version: row.version || 0 }
  }
  const db = await jsonDriver._read()
  return { state: db.snapshot.state || {}, version: db.snapshot.version || 0 }
}

// Save the whole client snapshot. Reconciles any email-applied payments that landed
// concurrently (appliedVersion > the client's baseVersion) so the poller's writes are
// never clobbered by a stale browser save. Returns the stored state + new version.
export async function saveState(clientState, baseVersion = 0) {
  return withLock(async () => {
    const incoming = {
      ...clientState,
      payments: [...(clientState.payments || [])],
      unassignedPayments: [...(clientState.unassignedPayments || [])],
    }
    const ids = new Set(incoming.payments.map((p) => p.id))

    const autos = (await listAudit()).filter(
      (a) => a.type === 'email-payment' && !a.undone && Number(a.appliedVersion) > Number(baseVersion),
    )
    for (const a of autos) {
      if (a.paymentId && !ids.has(a.paymentId) && a.data?.payment) incoming.payments.push(a.data.payment)
    }

    // Protect unassigned payments the poller added after the client's baseVersion from being
    // clobbered by a stale client save (same idea as the auto-payment reconcile above).
    const cur = await getState()
    const uids = new Set(incoming.unassignedPayments.map((u) => u.id))
    for (const u of cur.state?.unassignedPayments || []) {
      if (Number(u.addedVersion || 0) > Number(baseVersion) && !uids.has(u.id)) incoming.unassignedPayments.push(u)
    }

    if (usePg) {
      const { rows } = await pool.query(
        'UPDATE app_state SET state = $1, version = version + 1 WHERE id = 1 RETURNING version',
        [incoming],
      )
      return { state: incoming, version: rows[0].version }
    }
    const db = await jsonDriver._read()
    db.snapshot = { state: incoming, version: (db.snapshot.version || 0) + 1 }
    await jsonDriver._write(db)
    return { state: incoming, version: db.snapshot.version }
  })
}

// Append a payment discovered in an email into the live snapshot (server-authoritative write).
export async function applyEmailPayment({ studentId, amount, dateReceived, emailRef }) {
  return withLock(async () => {
    const payment = {
      id: newId(),
      studentId,
      amount: round2(amount),
      dateReceived,
      ts: new Date().toISOString(),
      source: 'email',
      emailRef: emailRef || null,
    }
    if (usePg) {
      const { rows } = await pool.query(
        `UPDATE app_state
           SET state = jsonb_set(state, '{payments}', COALESCE(state->'payments','[]'::jsonb) || $1::jsonb),
               version = version + 1
         WHERE id = 1 RETURNING version`,
        [JSON.stringify([payment])],
      )
      const version = rows[0].version
      await pgInsertAudit({ type: 'email-payment', paymentId: payment.id, appliedVersion: version, data: { payment } })
      return { payment, version }
    }
    // JSON driver: write snapshot + audit in ONE locked pass (no nested withLock — that deadlocks).
    const db = await jsonDriver._read()
    const state = db.snapshot.state || {}
    state.payments = [...(state.payments || []), payment]
    const version = (db.snapshot.version || 0) + 1
    db.snapshot = { state, version }
    db.audit.push({
      id: newId(),
      type: 'email-payment',
      paymentId: payment.id,
      appliedVersion: version,
      undone: false,
      data: { payment },
      createdAt: new Date().toISOString(),
    })
    await jsonDriver._write(db)
    return { payment, version }
  })
}

// Record a payment that had no student name in the memo → the app's Notifications queue.
// Stamped with addedVersion so a concurrent client save can't silently drop it.
export async function addUnassignedPayment(p) {
  return withLock(async () => {
    if (usePg) {
      const cur = await pool.query('SELECT version FROM app_state WHERE id = 1')
      const version = (cur.rows[0]?.version || 0) + 1
      const entry = { id: newId(), ...p, ts: new Date().toISOString(), addedVersion: version }
      await pool.query(
        `UPDATE app_state
           SET state = jsonb_set(state, '{unassignedPayments}', COALESCE(state->'unassignedPayments','[]'::jsonb) || $1::jsonb),
               version = $2
         WHERE id = 1`,
        [JSON.stringify([entry]), version],
      )
      return { entry, version }
    }
    const db = await jsonDriver._read()
    const state = db.snapshot.state || {}
    const version = (db.snapshot.version || 0) + 1
    const entry = { id: newId(), ...p, ts: new Date().toISOString(), addedVersion: version }
    state.unassignedPayments = [...(state.unassignedPayments || []), entry]
    db.snapshot = { state, version }
    await jsonDriver._write(db)
    return { entry, version }
  })
}

// Remove a payment from the snapshot and mark its audit row undone (one-click reversal).
export async function undoPayment(paymentId) {
  return withLock(async () => {
    let version
    if (usePg) {
      await pool.query('UPDATE audit_log SET undone = true WHERE payment_id = $1', [paymentId])
      const { rows } = await pool.query(
        `UPDATE app_state
           SET state = jsonb_set(state, '{payments}',
                 COALESCE((SELECT jsonb_agg(p) FROM jsonb_array_elements(state->'payments') p
                           WHERE p->>'id' <> $1), '[]'::jsonb)),
               version = version + 1
         WHERE id = 1 RETURNING version`,
        [paymentId],
      )
      version = rows[0].version
    } else {
      const db = await jsonDriver._read()
      const state = db.snapshot.state || {}
      state.payments = (state.payments || []).filter((p) => p.id !== paymentId)
      db.snapshot = { state, version: (db.snapshot.version || 0) + 1 }
      db.audit = db.audit.map((a) => (a.paymentId === paymentId ? { ...a, undone: true } : a))
      await jsonDriver._write(db)
      version = db.snapshot.version
    }
    return { version }
  })
}

// ── processed-emails (idempotency) ──
export async function hasProcessed(key) {
  if (usePg) {
    const { rows } = await pool.query('SELECT 1 FROM processed_emails WHERE key = $1', [key])
    return rows.length > 0
  }
  const db = await jsonDriver._read()
  return db.processedEmails.some((e) => e.key === key)
}

export async function recordProcessed(rec) {
  if (usePg) {
    await pool.query(
      `INSERT INTO processed_emails (key, message_id, provider, transaction_id, amount, date, student_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (key) DO NOTHING`,
      [rec.key, rec.messageId, rec.provider, rec.transactionId, rec.amount, rec.date, rec.studentId, rec.status],
    )
    return
  }
  return withLock(async () => {
    const db = await jsonDriver._read()
    if (!db.processedEmails.some((e) => e.key === rec.key)) {
      db.processedEmails.push({ ...rec, createdAt: new Date().toISOString() })
      await jsonDriver._write(db)
    }
  })
}

// Items that need a human: parsed but not auto-applied (no match / refund / ambiguous).
export async function listNeedsAttention() {
  if (usePg) {
    const { rows } = await pool.query(
      "SELECT * FROM processed_emails WHERE status <> 'applied' ORDER BY created_at DESC LIMIT 100",
    )
    return rows
  }
  const db = await jsonDriver._read()
  return db.processedEmails.filter((e) => e.status !== 'applied').reverse()
}

// ── audit log ──
async function pgInsertAudit(row) {
  await pool.query(
    `INSERT INTO audit_log (id, type, payment_id, applied_version, undone, data)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.id || newId(), row.type, row.paymentId || null, row.appliedVersion || null, !!row.undone, row.data || {}],
  )
}

export async function addAudit(entry) {
  const row = { id: newId(), undone: false, createdAt: new Date().toISOString(), ...entry }
  if (usePg) {
    await pgInsertAudit(row)
    return row
  }
  return withLock(async () => {
    const db = await jsonDriver._read()
    db.audit.push(row)
    await jsonDriver._write(db)
    return row
  })
}

export async function listAudit() {
  if (usePg) {
    const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200')
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      paymentId: r.payment_id,
      appliedVersion: r.applied_version,
      undone: r.undone,
      data: r.data,
      createdAt: r.created_at,
    }))
  }
  const db = await jsonDriver._read()
  return [...db.audit].reverse()
}

// ── SMS log ──
export async function addSms(entry) {
  const row = { id: newId(), createdAt: new Date().toISOString(), ...entry }
  if (usePg) {
    await pool.query(
      `INSERT INTO sms_log (id, student_id, to_number, body, status, provider_id, mock)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, row.studentId || null, row.to, row.body, row.status, row.providerId || null, !!row.mock],
    )
    return row
  }
  return withLock(async () => {
    const db = await jsonDriver._read()
    db.smsLog.push(row)
    await jsonDriver._write(db)
    return row
  })
}

export async function listSms() {
  if (usePg) {
    const { rows } = await pool.query('SELECT * FROM sms_log ORDER BY created_at DESC LIMIT 100')
    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      to: r.to_number,
      body: r.body,
      status: r.status,
      providerId: r.provider_id,
      mock: r.mock,
      createdAt: r.created_at,
    }))
  }
  const db = await jsonDriver._read()
  return [...db.smsLog].reverse()
}

// ── captured emails (dev pipeline proof) ──
export async function addCaptured(entry) {
  const row = { id: newId(), createdAt: new Date().toISOString(), ...entry }
  if (usePg) {
    await pool.query('INSERT INTO captured_emails (id, data) VALUES ($1,$2)', [row.id, row])
    return row
  }
  return withLock(async () => {
    const db = await jsonDriver._read()
    db.capturedEmails.push(row)
    if (db.capturedEmails.length > 50) db.capturedEmails = db.capturedEmails.slice(-50)
    await jsonDriver._write(db)
    return row
  })
}

export async function listCaptured() {
  if (usePg) {
    const { rows } = await pool.query('SELECT data FROM captured_emails ORDER BY created_at DESC LIMIT 50')
    return rows.map((r) => r.data)
  }
  const db = await jsonDriver._read()
  return [...db.capturedEmails].reverse()
}

// ── Dev Console event feed ──
// Records EVERY integration trigger (photo parse, email parse, SMS send) — including dev-mock
// ones — so you can confirm wiring without spending money. `model` names the model/channel used.
export async function logEvent(entry) {
  const row = { id: newId(), mock: false, createdAt: new Date().toISOString(), ...entry }
  if (usePg) {
    await pool.query(
      'INSERT INTO events (id, kind, model, mock, summary, detail) VALUES ($1,$2,$3,$4,$5,$6)',
      [row.id, row.kind, row.model || null, !!row.mock, row.summary || '', row.detail || {}],
    )
    await pool.query('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY created_at DESC OFFSET 300)')
    return row
  }
  return withLock(async () => {
    const db = await jsonDriver._read()
    db.events.push(row)
    if (db.events.length > 300) db.events = db.events.slice(-300)
    await jsonDriver._write(db)
    return row
  })
}

export async function listEvents() {
  if (usePg) {
    const { rows } = await pool.query('SELECT * FROM events ORDER BY created_at DESC LIMIT 300')
    return rows.map((r) => ({
      id: r.id, kind: r.kind, model: r.model, mock: r.mock, summary: r.summary, detail: r.detail, createdAt: r.created_at,
    }))
  }
  const db = await jsonDriver._read()
  return [...db.events].reverse()
}

// ── Factory reset: wipe ALL data (students, classes, payments, logs) back to empty ──
// The code/features are untouched — this only clears the database. Irreversible.
export async function resetAll() {
  if (usePg) {
    await pool.query(
      "UPDATE app_state SET state = '{}'::jsonb, version = 0 WHERE id = 1; " +
        'TRUNCATE processed_emails, audit_log, sms_log, captured_emails, events;',
    )
    return
  }
  return withLock(async () => {
    await jsonDriver._write(emptyDb())
  })
}
