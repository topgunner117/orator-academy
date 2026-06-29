// Parse a forwarded payment-notification email into a structured transaction.
//
// EVERY email is read by the Claude API (the cheap email model — Haiku by default,
// configurable via ANTHROPIC_EMAIL_MODEL). There is no tokenless regex shortcut: PayPal,
// Venmo, and Zelle all go through Claude. Refunds / non-payments are flagged before any
// auto-apply. If no ANTHROPIC_API_KEY is set, emails can't be parsed and are flagged.

import Anthropic from '@anthropic-ai/sdk'

const EMAIL_MODEL = process.env.ANTHROPIC_EMAIL_MODEL || 'claude-haiku-4-5-20251001'

const stripHtml = (s) => (s || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
const collapse = (s) => (s || '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
const money = (s) => Math.round(parseFloat(String(s).replace(/[,$\s]/g, '')) * 100) / 100

// Which provider sent this? Looks at From/sender first, then body keywords.
export function detectProvider({ from = '', subject = '', text = '', html = '' }) {
  const hay = `${from} ${subject}`.toLowerCase()
  const body = `${text} ${html}`.toLowerCase()
  if (hay.includes('venmo') || body.includes('venmo.com')) return 'venmo'
  if (hay.includes('paypal') || body.includes('paypal.com')) return 'paypal'
  if (hay.includes('zelle') || body.includes('zelle') || /\bzelle\b/.test(body)) return 'zelle'
  return 'unknown'
}

// A refund/declined/outgoing email → flag, don't auto-apply.
function isRefundOrDecline(blob) {
  return /\b(refund|refunded|reversed|declined|canceled|cancelled|returned|request(ed)? money)\b/i.test(blob)
}

// OUTGOING money — money the account owner SENT to someone else (a Venmo/PayPal/Zelle payment
// receipt). These must be ignored, never credited. We catch them deterministically (zero tokens)
// before Claude. Note these match the "you …" direction, NOT "… you" (which is incoming):
//   "You paid Jane $40" / "You sent $40 to Jane" / "Your payment to Jane" / "Receipt for your payment".
function isOutgoingPayment(blob) {
  return (
    /\byou\s+paid\b/i.test(blob) ||
    /\byou\s+sent\b/i.test(blob) ||
    /\byou'?ve\s+sent\b/i.test(blob) ||
    /\byour\s+payment\s+to\b/i.test(blob) ||
    /\breceipt\s+for\s+your\s+payment\b/i.test(blob) ||
    /\b(sent|paid)\s+\$?[\d,]+(?:\.\d{1,2})?\s+to\b/i.test(blob)
  )
}

// Claude reads the email and returns the transaction. Strict JSON via structured outputs.
async function parseWithClaude(provider, { subject, text }) {
  const client = new Anthropic()
  const schema = {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Total payment amount in dollars (positive). 0 if not a received payment.' },
      senderName: { type: 'string', description: "Name of the person who SENT the money. '' if unknown." },
      memo: { type: 'string', description: "The full memo / note / 'for' text the sender wrote, verbatim — include ALL names if several are listed. '' if none." },
      transactionId: { type: 'string', description: "Confirmation / transaction number. '' if none." },
      isPayment: { type: 'boolean', description: 'true ONLY if money was RECEIVED by the account owner (someone paid THEM). false for any money the account owner SENT or PAID to someone else, refunds, payment requests, or receipts of outgoing payments.' },
    },
    required: ['amount', 'senderName', 'memo', 'transactionId', 'isPayment'],
    additionalProperties: false,
  }
  const resp = await client.messages.create({
    model: EMAIL_MODEL,
    max_tokens: 500,
    system: `Extract the transaction details from this ${provider} payment-notification email. Set isPayment=true ONLY when money was RECEIVED by the account owner ("X paid you", "you received $Y from X"). Set isPayment=false for OUTGOING money the account owner sent or paid to someone else ("you paid X", "you sent $Y to X", "your payment to X", "receipt for your payment") — ignore those. The memo is where a parent writes which student(s) the payment is for — copy it verbatim, keeping every name they listed.`,
    messages: [{ role: 'user', content: [{ type: 'text', text: `Subject: ${subject}\n\n${text}`.slice(0, 8000) }] }],
    output_config: { format: { type: 'json_schema', schema } },
  })
  const out = JSON.parse(resp.content.find((b) => b.type === 'text')?.text || '{}')
  if (!out.isPayment || !out.amount) return null
  return { amount: money(out.amount), senderName: out.senderName || '', memo: out.memo || '', transactionId: out.transactionId || null, usedModel: EMAIL_MODEL }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST HOOK — remove before real production.
// Any email containing the magic word "yuvantesting" anywhere is treated as a PayPal
// payment for testing, so you can send a PLAIN email from any account (no real
// Venmo/PayPal/Zelle formatting) and have it credited. The amount is the first $-figure
// (or "amount/paid/pay" number) in the email; the student is matched from the email text,
// so include the student's name like a normal memo. Deliberately bypasses Claude so it
// works for free and deterministically. Delete this block (and the call below) to disable.
const TEST_WORD = 'yuvantesting'
function parseTestEmail(blob) {
  // Strip the trigger word FIRST so it never becomes part of the memo or student matching —
  // e.g. so "yuvantesting" can't be mistaken for a student named "yuvan". The rest of the email
  // is then treated exactly like a real PayPal payment: real amount + real memo (student names).
  const cleaned = blob.replace(new RegExp(TEST_WORD, 'ig'), ' ').replace(/\s+/g, ' ').trim()
  const m =
    /\$\s*([\d,]+(?:\.\d{1,2})?)/.exec(cleaned) ||
    /\b(?:amount|paid|pay|for)\D{0,10}?([\d,]+(?:\.\d{1,2})?)\b/i.exec(cleaned)
  const amount = m ? money(m[1]) : 0
  const fromM = /\bfrom\s+([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,2})/i.exec(cleaned)
  return {
    provider: 'paypal',
    amount,
    senderName: fromM ? fromM[1].trim() : 'Test payment',
    memo: cleaned, // the email text WITHOUT the trigger word → real student name(s) match here
    transactionId: null,
    usedModel: 'test-hook',
    // A test email is always a payment intent — never flag it. If the amount couldn't be read,
    // the pipeline still routes it to Notifications for manual review (set the amount there).
    flagged: false,
    reason: null,
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Main entry. Returns { provider, amount, senderName, memo, transactionId, usedModel|null,
// flagged, reason } — flagged transactions are surfaced for review instead of auto-applied.
export async function parsePaymentEmail(email) {
  const from = email.from || ''
  const subject = email.subject || ''
  const text = collapse(email.text || stripHtml(email.html || ''))
  const provider = detectProvider({ from, subject, text, html: email.html })
  const blob = `${subject} ${text}`

  // TEST HOOK (see above): "yuvantesting" → treat as a PayPal payment, credit the named student.
  if (new RegExp(TEST_WORD, 'i').test(blob)) {
    return parseTestEmail(blob)
  }

  if (isRefundOrDecline(blob)) {
    return { provider, flagged: true, reason: 'refund-or-non-payment', amount: 0, senderName: '', memo: '', transactionId: null, usedModel: null }
  }

  // Ignore OUTGOING payments (money the account owner sent) — only received money is credited.
  if (isOutgoingPayment(blob)) {
    return { provider, flagged: true, reason: 'outgoing-payment', amount: 0, senderName: '', memo: '', transactionId: null, usedModel: null }
  }

  // Claude reads EVERY email — no tokenless regex path.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { provider, flagged: true, reason: 'no-api-key', amount: 0, senderName: '', memo: '', transactionId: null, usedModel: null }
  }

  const ai = await parseWithClaude(provider, { subject, text })
  if (!ai || !ai.amount) {
    return { provider, flagged: true, reason: 'not-a-payment', amount: 0, senderName: '', memo: '', transactionId: null, usedModel: EMAIL_MODEL }
  }

  return {
    provider,
    amount: ai.amount,
    senderName: ai.senderName || '',
    memo: ai.memo || '',
    transactionId: ai.transactionId || null,
    usedModel: ai.usedModel,
    flagged: false,
    reason: null,
  }
}
