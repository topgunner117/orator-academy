import { API_BASE } from '../config.js'

// ── Session token (from POST /api/auth/login) ────────────────────────────────
const TOKEN_KEY = 'oa-token'
const STATE_CACHE_KEY = 'orator-academy-v1'

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}
const setToken = (t) => {
  try {
    localStorage.setItem(TOKEN_KEY, t)
  } catch {
    /* ignore */
  }
}
export const clearToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

// The app registers a handler here so an expired/invalid token (any 401) bounces back to login.
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = typeof fn === 'function' ? fn : () => {}
}

// Small fetch wrapper: attaches the session token, throws a useful Error on non-2xx, and on a 401
// clears the token and notifies the app to show the login screen.
async function req(path, opts = {}) {
  const token = getToken()
  const headers = { ...(opts.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') {
      clearToken()
      onUnauthorized()
    }
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

// ── Auth ─────────────────────────────────────────────────────────────────────
// Exchange the password for a session token. Throws on wrong password / lockout.
export async function login(password) {
  const res = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (res?.token) setToken(res.token)
  return res // { token, usingFallbackPassword }
}

// True if the stored token is still valid on the server.
export async function checkAuth() {
  if (!getToken()) return false
  try {
    const { authenticated } = await req('/api/auth/status')
    return !!authenticated
  } catch {
    return false
  }
}

// Clear the token AND the locally cached snapshot, so signing out leaves no data behind.
export function logout() {
  clearToken()
  try {
    localStorage.removeItem(STATE_CACHE_KEY)
    sessionStorage.removeItem(STATE_CACHE_KEY)
    sessionStorage.removeItem('oa-entered')
  } catch {
    /* ignore */
  }
}

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
