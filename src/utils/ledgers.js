// Monthly ledger documents — one per calendar month, compiling every transaction that went
// through the studio that month: charges billed, payments received (cash / check / online
// auto-applied), account credits, and summer-lesson payments. Each row carries the student,
// the reason, and a timestamp. Built for printing as a physical backup of the data.

import { monthLabel } from './dates.js'
import { sessionsForStudentInMonth } from './payments.js'
import { studentName } from './helpers.js'
import { GROUP_CLASS_PRICE } from '../constants.js'

const round2 = (n) => Math.round(n * 100) / 100
const ymOf = (iso) => (iso || '').slice(0, 7)

// Months (newest first, 'YYYY-MM') with any financial activity — charges, payments,
// credits, or summer payments.
export function ledgerMonths(state, today = new Date()) {
  const months = new Set()
  for (const p of state.payments || []) if (p.dateReceived) months.add(ymOf(p.dateReceived))
  for (const a of state.adjustments || []) if (a.date) months.add(ymOf(a.date))
  for (const sp of state.summerPayments || []) if (sp.dateReceived) months.add(ymOf(sp.dateReceived))
  // Billed months: same 14-month window the statement ledger uses.
  for (let i = -14; i <= 0; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const anyCharges = (state.students || []).some(
      (s) => sessionsForStudentInMonth(state, s.id, d.getFullYear(), d.getMonth()).length > 0,
    )
    if (anyCharges) months.add(ym)
  }
  return [...months].sort().reverse()
}

// Human-readable reason line for a received payment.
function paymentReason(p) {
  if (p.source === 'email') {
    const ref = p.emailRef || {}
    const bits = [`Online payment${ref.provider ? ` (${ref.provider})` : ''}`]
    if (ref.senderName) bits.push(`from ${ref.senderName}`)
    if (ref.memo) bits.push(`memo “${ref.memo}”`)
    if (p.method === 'assigned') bits.push('assigned manually')
    return bits.join(' · ')
  }
  const m = p.method || 'cash'
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} payment`
}

// Everything that happened in one month, compiled for the printable document.
export function monthLedger(state, ym, today = new Date()) {
  const [y, m] = ym.split('-').map(Number)
  const price = state.classPrice ?? GROUP_CLASS_PRICE
  const byId = (id) => state.students.find((s) => s.id === id)

  // Charges billed that month (posted on the 1st; a cycle only bills once the month started).
  const charges = []
  if (new Date(y, m - 1, 1) <= today) {
    for (const s of state.students || []) {
      for (const b of sessionsForStudentInMonth(state, s.id, y, m - 1)) {
        charges.push({
          id: `charge-${s.id}-${b.templateId}`,
          date: `${ym}-01`,
          studentId: s.id,
          student: studentName(s),
          description: `${b.name} — ${b.count} session${b.count === 1 ? '' : 's'} × $${price}${b.overridden ? ' (count edited)' : ''}`,
          amount: round2(b.amount),
        })
      }
    }
  }
  charges.sort((a, b) => a.student.localeCompare(b.student))

  // Money received that month — payments, credits, summer payments — with timestamps.
  const received = []
  for (const p of (state.payments || []).filter((p) => ymOf(p.dateReceived) === ym)) {
    received.push({
      id: p.id,
      ts: p.ts || `${p.dateReceived}T00:00:00`,
      date: p.dateReceived,
      studentId: p.studentId,
      student: studentName(byId(p.studentId)),
      kind: 'payment',
      amount: round2(p.amount || 0),
      reason: paymentReason(p),
      auto: p.source === 'email',
    })
  }
  for (const a of (state.adjustments || []).filter((a) => ymOf(a.date) === ym)) {
    received.push({
      id: a.id,
      ts: a.ts || `${a.date}T00:00:00`,
      date: a.date,
      studentId: a.studentId,
      student: studentName(byId(a.studentId)),
      kind: 'credit',
      amount: round2(a.amount || 0),
      reason: a.reason ? `Credit — ${a.reason}` : 'Account credit',
    })
  }
  for (const sp of (state.summerPayments || []).filter((p) => ymOf(p.dateReceived) === ym)) {
    received.push({
      id: sp.id,
      ts: sp.ts || `${sp.dateReceived}T00:00:00`,
      date: sp.dateReceived,
      studentId: null,
      student: 'Summer lessons',
      kind: 'summer',
      amount: round2(sp.amount || 0),
      reason: sp.note ? `Summer lessons — ${sp.note}` : 'Summer lessons',
      auto: sp.method === 'email',
    })
  }
  received.sort((a, b) => a.ts.localeCompare(b.ts))

  const sum = (rows) => round2(rows.reduce((s, r) => s + r.amount, 0))
  const totals = {
    charged: sum(charges),
    payments: sum(received.filter((r) => r.kind === 'payment')),
    credits: sum(received.filter((r) => r.kind === 'credit')),
    summer: sum(received.filter((r) => r.kind === 'summer')),
  }
  totals.received = round2(totals.payments + totals.credits + totals.summer)

  return { ym, label: monthLabel(ym), charges, received, totals }
}
