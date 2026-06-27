import { API_BASE } from '../config.js'

// Small fetch wrapper that throws a useful Error on non-2xx.
async function req(path, opts) {
  const res = await fetch(`${API_BASE}${path}`, opts)
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      msg = (await res.json()).error || msg
    } catch {
      /* non-JSON error */
    }
    throw new Error(msg)
  }
  return res.json()
}

const jsonPost = (path, body) => req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Send a class-notes photo to the backend for Claude to transcribe + organize.
// image: a base64 data URL. context: { className, date, roster: [{id, name}] }.
export function parseNotesPhoto(image, context) {
  return jsonPost('/api/ai/parse-notes', { image, ...context })
  // → { mock, model, result: { classGoals, classNotes, students:[{name,goals,notes,matchedStudentId,matchConfident}] } }
}

// ── Whole-state sync (server is the source of truth when reachable) ──
export const fetchRemoteState = () => req('/api/state') // { state, version }
export const saveRemoteState = (state, baseVersion) =>
  req('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, baseVersion }) }) // { state, version }

// ── SMS payment reminder ──
export const sendPaymentReminder = (payload) => jsonPost('/api/sms/payment-reminder', payload) // { studentId, to, message }
export const fetchSmsLog = () => req('/api/sms/log') // { sends: [...] }

// ── Integrations (status / audit / needs-attention / captured emails / dev tools) ──
export const fetchIntegrationStatus = () => req('/api/integrations/status') // { ai, sms, email, emailModel }
export const fetchAuditLog = () => req('/api/integrations/audit') // { audit: [...] }
export const fetchNeedsAttention = () => req('/api/integrations/needs-attention') // { items: [...] }
export const fetchCapturedEmails = () => req('/api/integrations/captured-emails') // { emails: [...] }
export const undoAutoPayment = (id) => jsonPost(`/api/integrations/payments/${id}/undo`, {})
export const simulateEmail = (email) => jsonPost('/api/integrations/simulate-email', email)

// ── Dev Console + factory reset ──
export const fetchConsoleEvents = () => req('/api/integrations/events') // { events: [...] }
export const factoryReset = () => jsonPost('/api/integrations/reset', {})
