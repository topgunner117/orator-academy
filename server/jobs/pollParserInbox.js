// Polls the dedicated parser inbox (a brand-new Gmail YOU own; the teacher only forwards
// transaction emails to it). Lazy-imports imapflow + mailparser so the server runs fine with
// nothing installed and no creds — the poller just stays dormant until configured.

import { processEmail } from '../services/paymentPipeline.js'

const USER = process.env.PARSER_IMAP_USER
const PASS = process.env.PARSER_IMAP_PASS
const HOST = process.env.PARSER_IMAP_HOST || 'imap.gmail.com'
const PORT = Number(process.env.PARSER_IMAP_PORT || 993)
const INTERVAL = Number(process.env.PARSER_POLL_SECONDS || 60) * 1000

export const emailConfigured = () => !!(USER && PASS)

let running = false

async function pollOnce() {
  const { ImapFlow } = await import('imapflow')
  const { simpleParser } = await import('mailparser')
  const client = new ImapFlow({ host: HOST, port: PORT, secure: true, auth: { user: USER, pass: PASS }, logger: false })
  // ImapFlow emits 'error' asynchronously (e.g. when Gmail drops an idle connection). An
  // unhandled 'error' event on an EventEmitter crashes the whole process — so always attach a
  // handler. We just log it; the cycle's promise rejects too and the next tick reconnects.
  client.on('error', (err) => console.error('[poller] imap connection error:', err.message))
  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      // Find unseen messages first, then fetch them by UID (passing a search object straight to
      // fetch() isn't supported by imapflow).
      const uids = await client.search({ seen: false }, { uid: true })
      if (!uids || !uids.length) return
      console.log(`[poller] ${uids.length} new message(s) to process`)

      // Drain the fetch stream FULLY before issuing any other IMAP command — imapflow forbids
      // running commands (like flag updates) while a fetch iterator is still open.
      const fetched = []
      for await (const msg of client.fetch(uids, { source: true, envelope: true }, { uid: true })) {
        fetched.push({ uid: msg.uid, source: msg.source, envelope: msg.envelope })
      }

      for (const msg of fetched) {
        try {
          const parsed = await simpleParser(msg.source)
          await processEmail({
            messageId: parsed.messageId || (msg.envelope && msg.envelope.messageId) || null,
            from: parsed.from?.text || '',
            subject: parsed.subject || '',
            text: parsed.text || '',
            html: parsed.html || '',
            date: (parsed.date || new Date()).toISOString().slice(0, 10),
          })
        } catch (e) {
          console.error('[poller] failed on one message:', e.message)
        }
      }

      // Mark them all read in one command now that the fetch stream is closed. Idempotency in
      // the store is the real guard against double-applying; \Seen just stops re-fetching.
      await client
        .messageFlagsAdd(uids, ['\\Seen'], { uid: true })
        .catch((e) => console.error('[poller] could not mark messages read:', e.message))
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export function startParserPoller() {
  if (!emailConfigured()) {
    console.log('[poller] dormant — PARSER_IMAP_USER/PASS not set (use the dev "Simulate email" tool to test).')
    return
  }
  console.log(`[poller] watching ${USER} every ${INTERVAL / 1000}s`)
  const tick = async () => {
    if (running) return
    running = true
    try {
      await pollOnce()
    } catch (e) {
      console.error('[poller] cycle error:', e.message)
    } finally {
      running = false
    }
  }
  tick()
  setInterval(tick, INTERVAL)
}
