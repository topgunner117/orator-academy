import './loadenv.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import aiRoutes from './routes/ai.js'
import stateRoutes from './routes/state.js'
import smsRoutes from './routes/sms.js'
import integrationsRoutes from './routes/integrations.js'
import * as store from './services/store.js'
import { startParserPoller, emailConfigured } from './jobs/pollParserInbox.js'
import { smsConfigured } from './services/twilio.js'

// Stay up no matter what. The email poller talks to a flaky external service (Gmail IMAP);
// a stray error there must never take down the SMS / AI / state endpoints. Log and keep running.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err?.message || err))
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err?.message || err))

const app = express()
const PORT = process.env.PORT || 8787

// Images + whole-state snapshots arrive as JSON, so allow a generous body size.
app.use(cors())
app.use(express.json({ limit: '25mb' }))

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    aiConfigured: !!process.env.ANTHROPIC_API_KEY,
    smsConfigured: smsConfigured(),
    emailConfigured: emailConfigured(),
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  })
})

app.use('/api/ai', aiRoutes)
app.use('/api/state', stateRoutes)
app.use('/api/sms', smsRoutes)
app.use('/api/integrations', integrationsRoutes)

// Serve the built frontend so production is ONE service on ONE URL. Only active when a build
// exists (after `npm run build` → podium/dist); a no-op in local dev, where Vite serves :5180.
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next() // let API 404s fall through
    res.sendFile(path.join(DIST, 'index.html'))
  })
  console.log('[web] serving built frontend from', DIST)
}

app.use((err, req, res, next) => {
  console.error('[server error]', err)
  res.status(500).json({ error: err.message || 'Server error' })
})

// Initialize the data store before accepting traffic, then start the email poller.
store
  .init()
  .then(() => {
    app.listen(PORT, () => {
      const ai = process.env.ANTHROPIC_API_KEY ? 'live' : 'DEV MOCK'
      const sms = smsConfigured() ? 'live' : 'DEV MOCK'
      const email = emailConfigured() ? 'live' : 'dormant'
      console.log(`Orator Academy server on http://localhost:${PORT}`)
      console.log(`  AI: ${ai}  ·  SMS: ${sms}  ·  Email poller: ${email}`)
      startParserPoller()
    })
  })
  .catch((err) => {
    console.error('[fatal] could not initialize the data store:', err)
    process.exit(1)
  })
