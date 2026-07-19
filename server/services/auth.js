// Password authentication for the whole API.
//
// The app is single-tenant (one tutor), so auth is a single shared password checked SERVER-SIDE:
//   • The password lives in the APP_PASSWORD env var — never in the client bundle.
//   • A successful login returns a signed, expiring token; every /api data route requires it.
//   • The token is a stateless HMAC (no session store needed), signed with SESSION_SECRET.
//
// Fallback: if APP_PASSWORD is unset the password defaults to 'orator' so a deploy can't lock the
// tutor out before the env var is set in Railway. Set APP_PASSWORD to a strong value in production.

import crypto from 'crypto'

const PASSWORD = process.env.APP_PASSWORD || 'orator'
export const usingFallbackPassword = !process.env.APP_PASSWORD

// Sign tokens with SESSION_SECRET when provided, otherwise derive a secret from the password so a
// forged token is impossible without knowing the password. Changing the password invalidates
// existing tokens (desirable).
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('orator-academy|' + PASSWORD).digest('hex')

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

// Constant-time compare of two strings via fixed-length hashes (avoids length/timing leaks).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url')

export function checkPassword(pw) {
  return typeof pw === 'string' && pw.length > 0 && safeEqual(pw, PASSWORD)
}

export function issueToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  if (!safeEqual(sig, sign(payload))) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof exp === 'number' && Date.now() < exp
  } catch {
    return false
  }
}

function tokenFromReq(req) {
  const h = req.headers.authorization || ''
  if (h.startsWith('Bearer ')) return h.slice(7)
  return ''
}

// Express middleware: reject any request without a valid token.
export function requireAuth(req, res, next) {
  if (verifyToken(tokenFromReq(req))) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

export { tokenFromReq }
