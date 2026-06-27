// Quick IMAP credential check: loads .env, connects to the parser inbox, prints the
// unseen-message count, and logs out. Touches nothing (no port, no DB). Run:  npm run imap-test
import 'dotenv/config'
import { ImapFlow } from 'imapflow'

const user = process.env.PARSER_IMAP_USER
const pass = process.env.PARSER_IMAP_PASS
if (!user || !pass) {
  console.error('PARSER_IMAP_USER / PARSER_IMAP_PASS not set in .env')
  process.exit(1)
}

const client = new ImapFlow({
  host: process.env.PARSER_IMAP_HOST || 'imap.gmail.com',
  port: Number(process.env.PARSER_IMAP_PORT || 993),
  secure: true,
  auth: { user, pass },
  logger: false,
})

try {
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    const status = await client.status('INBOX', { messages: true, unseen: true })
    const unseen = await client.search({ seen: false }, { uid: true })
    console.log(`✅ CONNECTED as ${user}`)
    console.log(`   INBOX total: ${status.messages} · unseen: ${status.unseen} · unseen UIDs: [${unseen}]`)
  } finally {
    lock.release()
  }
  await client.logout()
} catch (e) {
  console.error(`❌ IMAP FAILED: ${e.message}`)
  process.exit(1)
}
