// SMS sending via Twilio. Lazy-imports the `twilio` package only when credentials are
// present, so the server still boots + runs in dev-mock mode with nothing installed.

const SID = process.env.TWILIO_SID
const TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = process.env.TWILIO_FROM

export const smsConfigured = () => !!(SID && TOKEN && FROM)

// Normalize to E.164-ish: keep a leading +, strip spaces/dashes/parens. Assume US (+1)
// when 10 digits and no country code is given.
export function normalizePhone(raw) {
  let s = (raw || '').trim().replace(/[()\s.-]/g, '')
  if (!s) return ''
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '')
  s = s.replace(/\D/g, '')
  if (s.length === 10) return '+1' + s
  if (s.length === 11 && s.startsWith('1')) return '+' + s
  return '+' + s
}

// Returns { sid, status, mock }. In dev-mock it logs and pretends success.
export async function sendSms({ to, body }) {
  const dest = normalizePhone(to)
  if (!dest) throw new Error('No valid phone number.')

  if (!smsConfigured()) {
    console.log(`[twilio DEV MOCK] → ${dest}: ${body}`)
    return { sid: 'DEVMOCK-' + Date.now(), status: 'mock', mock: true }
  }

  const { default: twilio } = await import('twilio')
  const client = twilio(SID, TOKEN)
  const msg = await client.messages.create({ from: FROM, to: dest, body })
  return { sid: msg.sid, status: msg.status, mock: false }
}
