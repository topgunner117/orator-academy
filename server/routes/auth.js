import { Router } from 'express'
import { checkPassword, issueToken, verifyToken, usingFallbackPassword, tokenFromReq } from '../services/auth.js'

const router = Router()

// Basic in-memory brute-force throttle: after too many failures from one IP, lock that IP out
// briefly. Enough to make guessing impractical for a single shared password.
const attempts = new Map() // ip -> { count, first, blockedUntil }
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 8
const BLOCK_MS = 15 * 60 * 1000

router.post('/login', (req, res) => {
  const ip = req.ip || 'unknown'
  const now = Date.now()
  const rec = attempts.get(ip) || { count: 0, first: now, blockedUntil: 0 }

  if (rec.blockedUntil > now) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' })
  }
  if (now - rec.first > WINDOW_MS) {
    rec.count = 0
    rec.first = now
  }

  const { password } = req.body || {}
  if (!checkPassword(password)) {
    rec.count += 1
    if (rec.count >= MAX_FAILS) rec.blockedUntil = now + BLOCK_MS
    attempts.set(ip, rec)
    return res.status(401).json({ error: 'Incorrect password' })
  }

  attempts.delete(ip) // reset on success
  res.json({ token: issueToken(), usingFallbackPassword })
})

// Lightweight check the client calls on boot to see if its stored token is still valid.
router.get('/status', (req, res) => {
  res.json({ authenticated: verifyToken(tokenFromReq(req)) })
})

export default router
