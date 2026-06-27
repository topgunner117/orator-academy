import { studentName } from './helpers.js'
import { studentOwed } from './payments.js'

// Editable, with {placeholders}. {payVia} expands to whichever handles are filled in.
export const DEFAULT_SMS_TEMPLATE =
  "Hi! This is {studio}. {student} has an outstanding balance of ${amount}. You can pay via {payVia}. " +
  "Please put {student}'s name in the payment memo so it's credited correctly. Thank you!"

// Build the "pay via Venmo …, Zelle …, PayPal …" clause from non-empty studio handles.
function payViaClause(handles = {}) {
  const parts = []
  if (handles.venmo) parts.push(`Venmo ${handles.venmo}`)
  if (handles.zelle) parts.push(`Zelle ${handles.zelle}`)
  if (handles.paypal) parts.push(`PayPal ${handles.paypal}`)
  if (parts.length === 0) return 'Venmo, Zelle, or PayPal'
  if (parts.length === 1) return parts[0]
  return parts.slice(0, -1).join(', ') + ', or ' + parts[parts.length - 1]
}

// Render the reminder message for a student from the configured template.
export function buildReminderMessage(state, studentId, today = new Date()) {
  const s = state.students.find((x) => x.id === studentId)
  const owed = studentOwed(state, studentId, today)
  const handles = state.config?.paymentHandles || {}
  const template = state.config?.smsTemplate || DEFAULT_SMS_TEMPLATE
  const fills = {
    studio: state.config?.studioName || 'Orator Academy',
    student: studentName(s),
    amount: owed.owed.toFixed(2),
    outstanding: owed.outstanding.toFixed(2),
    payVia: payViaClause(handles),
    venmo: handles.venmo || '',
    zelle: handles.zelle || '',
    paypal: handles.paypal || '',
  }
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in fills ? fills[k] : m))
}
