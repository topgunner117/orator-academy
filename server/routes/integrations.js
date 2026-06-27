import { Router } from 'express'
import * as store from '../services/store.js'
import { smsConfigured } from '../services/twilio.js'
import { emailConfigured } from '../jobs/pollParserInbox.js'
import { processEmail } from '../services/paymentPipeline.js'

const router = Router()

// One call the Integrations settings page uses to show what's wired up.
router.get('/status', (req, res) => {
  res.json({
    ai: !!process.env.ANTHROPIC_API_KEY,
    sms: smsConfigured(),
    email: emailConfigured(),
    emailModel: process.env.ANTHROPIC_EMAIL_MODEL || 'claude-haiku-4-5-20251001',
  })
})

router.get('/audit', async (req, res, next) => {
  try {
    res.json({ audit: await store.listAudit() })
  } catch (err) {
    next(err)
  }
})

router.get('/needs-attention', async (req, res, next) => {
  try {
    res.json({ items: await store.listNeedsAttention() })
  } catch (err) {
    next(err)
  }
})

router.get('/captured-emails', async (req, res, next) => {
  try {
    res.json({ emails: await store.listCaptured() })
  } catch (err) {
    next(err)
  }
})

// Dev Console feed — every photo / email / SMS trigger, including dev-mock ones.
router.get('/events', async (req, res, next) => {
  try {
    res.json({ events: await store.listEvents() })
  } catch (err) {
    next(err)
  }
})

// Factory reset — wipe ALL data (students, classes, payments, logs) back to empty.
router.post('/reset', async (req, res, next) => {
  try {
    await store.resetAll()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// One-click reversal of an auto-applied payment.
router.post('/payments/:id/undo', async (req, res, next) => {
  try {
    res.json(await store.undoPayment(req.params.id))
  } catch (err) {
    next(err)
  }
})

// Dev/test tool: feed a fake (or pasted-real) email through the exact same pipeline as the
// poller, so the whole forward→parse→match→apply loop can be proven without a real inbox.
router.post('/simulate-email', async (req, res, next) => {
  try {
    const { from = '', subject = '', text = '', html = '', messageId, date } = req.body || {}
    if (!subject && !text && !html) return res.status(400).json({ error: 'Provide a subject or body.' })
    const result = await processEmail({ from, subject, text, html, messageId, date })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
