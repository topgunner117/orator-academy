import { Router } from 'express'
import { sendSms, smsConfigured } from '../services/twilio.js'
import * as store from '../services/store.js'

const router = Router()

router.get('/status', (req, res) => res.json({ configured: smsConfigured() }))

router.get('/log', async (req, res, next) => {
  try {
    res.json({ sends: await store.listSms() })
  } catch (err) {
    next(err)
  }
})

// The browser builds the templated message (so all template logic lives client-side) and
// posts the final text here. We just send it and log it.
router.post('/payment-reminder', async (req, res, next) => {
  try {
    const { studentId, to, message } = req.body || {}
    if (!to) return res.status(400).json({ error: 'Missing parent phone number.' })
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is empty.' })

    let result
    try {
      result = await sendSms({ to, body: message })
    } catch (e) {
      await store.addSms({ studentId, to, body: message, status: 'failed', mock: !smsConfigured() })
      await store.logEvent({
        kind: 'sms',
        model: smsConfigured() ? 'Twilio' : 'dev-mock',
        mock: !smsConfigured(),
        summary: `SMS → ${to} — failed`,
        detail: { to, body: message, status: 'failed', error: e.message || 'send error', studentId: studentId || null },
      })
      return res.status(502).json({ error: e.message || 'Could not send the text.' })
    }

    const logged = await store.addSms({
      studentId,
      to,
      body: message,
      status: result.status,
      providerId: result.sid,
      mock: result.mock,
    })
    await store.logEvent({
      kind: 'sms',
      model: result.mock ? 'dev-mock' : 'Twilio',
      mock: result.mock,
      summary: `SMS → ${to} — ${result.status}`,
      detail: { to, body: message, status: result.status, providerId: result.sid, studentId: studentId || null },
    })
    res.json({ ok: true, mock: result.mock, send: logged })
  } catch (err) {
    next(err)
  }
})

export default router
