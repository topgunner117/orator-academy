// Glue: a forwarded email → Claude-parsed transaction → matched student(s) → auto-applied
// payment(s), with idempotency, an audit trail, and an "unassigned payments" queue (surfaced
// in the app's Notifications) for anything with no student name in the memo.

import * as store from './store.js'
import { parsePaymentEmail } from './emailParse.js'

const round2 = (n) => Math.round(Number(n) * 100) / 100
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const studentFullName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim()

// Find every DISTINCT student named in the memo. Full names are matched first; a bare first
// name only counts when exactly one active student has it. Returns distinct student objects —
// so "Jordan Reyes" yields ONE student (not Jordan + Reyes), while "Jordan and Mia" yields two.
export function matchStudentsInMemo(memo, students) {
  const active = (students || []).filter((s) => !s.archived)
  const m = norm(memo)
  if (!m) return []
  const matched = new Map()

  for (const s of active) {
    const full = norm(studentFullName(s))
    if (full && full.includes(' ') && m.includes(full)) matched.set(s.id, s)
  }

  const tokens = new Set(m.split(' '))
  for (const s of active) {
    if (matched.has(s.id)) continue
    const fn = norm(s.firstName)
    if (!fn || fn.length < 2 || !tokens.has(fn)) continue
    const sameFirst = active.filter((x) => norm(x.firstName) === fn)
    if (sameFirst.length === 1) matched.set(s.id, s)
  }

  return [...matched.values()]
}

function idemKey(messageId, parsed) {
  if (parsed.transactionId) return `${parsed.provider}:txn:${parsed.transactionId}`
  if (messageId) return `msg:${messageId}`
  return `${parsed.provider}:${parsed.amount}:${parsed.senderName}`.toLowerCase()
}

// Process one raw email. `email`: { messageId, from, subject, text, html, date }.
// Returns a result object describing what happened. Every email — transaction or not — is
// logged to the dev Console before returning.
export async function processEmail(email, { capture = true } = {}) {
  const parsed = await parsePaymentEmail(email)
  const snippet = (email.text || email.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280)

  if (capture) {
    await store.addCaptured({ messageId: email.messageId || null, from: email.from || '', subject: email.subject || '', snippet, parsed })
  }

  const date = email.date || new Date().toISOString().slice(0, 10)
  const key = idemKey(email.messageId, parsed)
  const rec = (status, studentId = null) =>
    store.recordProcessed({
      key, messageId: email.messageId, provider: parsed.provider, transactionId: parsed.transactionId,
      amount: parsed.amount, date, studentId, status,
    })
  const refBase = { messageId: email.messageId || null, provider: parsed.provider, transactionId: parsed.transactionId, memo: parsed.memo, senderName: parsed.senderName }

  let result
  if (await store.hasProcessed(key)) {
    result = { status: 'duplicate', key, parsed }
  } else if (parsed.flagged) {
    await rec(`flagged:${parsed.reason}`)
    result = { status: 'flagged', reason: parsed.reason, key, parsed }
  } else {
    const { state } = await store.getState()
    const matched = matchStudentsInMemo(parsed.memo, state.students || [])

    if (matched.length === 0) {
      // No student named → goes to the Notifications queue for the teacher to assign.
      await store.addUnassignedPayment({
        amount: parsed.amount,
        dateReceived: date,
        senderName: parsed.senderName,
        memo: parsed.memo,
        provider: parsed.provider,
        transactionId: parsed.transactionId,
        emailRef: refBase,
      })
      await rec('unassigned')
      result = { status: 'unassigned', key, parsed }
    } else if (matched.length === 1) {
      const { payment } = await store.applyEmailPayment({
        studentId: matched[0].id,
        amount: parsed.amount,
        dateReceived: date,
        emailRef: { ...refBase, confident: true },
      })
      await rec('applied', matched[0].id)
      result = { status: 'applied', key, parsed, studentId: matched[0].id, paymentId: payment.id }
    } else {
      // Two+ students named → split the amount evenly between them.
      const share = round2(parsed.amount / matched.length)
      const applied = []
      for (const s of matched) {
        const { payment } = await store.applyEmailPayment({
          studentId: s.id,
          amount: share,
          dateReceived: date,
          emailRef: { ...refBase, split: matched.length, splitTotal: parsed.amount },
        })
        applied.push({ studentId: s.id, paymentId: payment.id })
      }
      await rec('applied-split')
      result = { status: 'split', key, parsed, share, students: matched.map((s) => s.id), applied }
    }
  }

  const statusLabel =
    result.status === 'split' ? `split ${result.students.length} ways · $${result.share}` : result.status
  await store.logEvent({
    kind: 'email',
    model: parsed.usedModel || (parsed.reason === 'no-api-key' ? 'no API key' : 'Claude'),
    mock: !parsed.usedModel,
    summary: `${parsed.provider} email — ${statusLabel}${parsed.amount ? ` · $${Number(parsed.amount).toFixed(2)}` : ''}`,
    detail: {
      from: email.from || '', subject: email.subject || '', snippet,
      provider: parsed.provider, status: result.status,
      parsed: { amount: parsed.amount, senderName: parsed.senderName, memo: parsed.memo, transactionId: parsed.transactionId, flagged: parsed.flagged, reason: parsed.reason },
      students: result.students || (result.studentId ? [result.studentId] : []),
    },
  })

  return result
}
