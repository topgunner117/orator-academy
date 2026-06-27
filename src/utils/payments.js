import { GROUP_CLASS_PRICE, LATE_FEE_RATE, PAYMENT_DUE_DAY } from '../constants.js'
import { weekdayDatesInMonth, isoDate, monthLabel } from './dates.js'

const round2 = (n) => Math.round(n * 100) / 100

// How many group sessions a student is scheduled for in a given month, and the
// per-class breakdown. Moved sessions are inherently included — a move relocates a
// session within the schedule, it doesn't change how many of that class occur.
export function sessionsForStudentInMonth(state, studentId, year, month) {
  const price = state.classPrice ?? GROUP_CLASS_PRICE
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`
  const breakdown = []
  for (const t of state.templates) {
    if (t.type !== 'group') continue
    if (!(t.permanentStudentIds || []).includes(studentId)) continue
    let dates = weekdayDatesInMonth(year, month, t.dayOfWeek)
    // Don't back-bill sessions before the class was created.
    if (t.createdAt) {
      const created = isoDate(new Date(t.createdAt))
      dates = dates.filter((d) => d >= created)
    }
    const overrideKey = `${studentId}::${t.id}::${ym}`
    const override = state.chargeOverrides?.[overrideKey]
    if (dates.length === 0 && override == null) continue
    const actualCount = dates.length
    const count = override != null ? override : actualCount
    breakdown.push({
      templateId: t.id,
      name: t.name,
      count,
      actualCount,
      overrideKey,
      overridden: override != null,
      amount: count * price,
    })
  }
  return breakdown
}

// ── Running account ledger ──────────────────────────────────────────────────
// One continuous ledger per student: monthly charges post on the 1st (a cycle is only
// charged once it has started), payments and credits reduce the balance, every row carries
// a running balance. This is the single source of truth for what a student owes.
export function studentLedger(state, studentId, today = new Date()) {
  const entries = []

  // Charges — each billed month from the past year up to (and including) the current month.
  // Future months aren't charged yet, so they never appear as "owed".
  for (let i = -14; i <= 0; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    const ym = `${y}-${String(m + 1).padStart(2, '0')}`
    for (const b of sessionsForStudentInMonth(state, studentId, y, m)) {
      entries.push({
        id: `charge-${b.templateId}-${ym}`,
        date: `${ym}-01`,
        ts: `${ym}-01T00:00:00`,
        kind: 'charge',
        description: `${monthLabel(ym)} — ${b.name}`,
        charge: b.amount,
        credit: 0,
        // editable class-count metadata
        count: b.count,
        actualCount: b.actualCount,
        overrideKey: b.overrideKey,
        overridden: b.overridden,
      })
    }
  }

  // Payments received.
  for (const p of state.payments.filter((p) => p.studentId === studentId)) {
    entries.push({
      id: p.id,
      date: p.dateReceived,
      ts: p.ts || `${p.dateReceived}T00:00:00`,
      kind: 'payment',
      description: 'Payment received',
      source: p.source || 'manual', // 'email' = auto-applied from a forwarded payment notification
      charge: 0,
      credit: p.amount,
    })
  }

  // Manual credits.
  for (const a of (state.adjustments || []).filter((a) => a.studentId === studentId)) {
    entries.push({
      id: a.id,
      date: a.date,
      ts: a.ts || `${a.date}T00:00:00`,
      kind: 'credit',
      description: a.reason ? `Credit — ${a.reason}` : 'Account credit',
      charge: 0,
      credit: a.amount,
    })
  }

  const sortKind = { charge: 0, payment: 1, credit: 1 }
  const sortEntries = (list) =>
    list.sort(
      (x, y) =>
        x.date.localeCompare(y.date) || sortKind[x.kind] - sortKind[y.kind] || (x.ts || '').localeCompare(y.ts || ''),
    )
  sortEntries(entries)

  const runningBalance = () => {
    let bal = 0
    for (const e of entries) {
      bal += e.charge - e.credit
      e.balanceAfter = round2(bal)
    }
    return round2(bal)
  }
  let balance = runningBalance()

  // The current month's charge isn't "outstanding" until after the due day (the 10th).
  const due = new Date(today.getFullYear(), today.getMonth(), PAYMENT_DUE_DAY)
  let notYetDue = 0
  if (today <= due) {
    notYetDue = round2(sessionsForStudentInMonth(state, studentId, today.getFullYear(), today.getMonth()).reduce((s, b) => s + b.amount, 0))
  }

  const owedBeforeFee = Math.max(0, balance)
  const outstandingBeforeFee = Math.max(0, round2(owedBeforeFee - notYetDue))

  // Optional late fee on the past-due (outstanding) amount.
  const lateFeeRate = state.lateFeeRate ?? LATE_FEE_RATE
  let lateFee = 0
  if (state.lateFeeEnabled && outstandingBeforeFee > 0) {
    lateFee = round2(outstandingBeforeFee * lateFeeRate)
    entries.push({
      id: `latefee-${isoDate(today)}`,
      date: isoDate(today),
      ts: `${isoDate(today)}T23:59:59`,
      kind: 'charge',
      description: `Late fee (${Math.round(lateFeeRate * 100)}%)`,
      charge: lateFee,
      credit: 0,
    })
    sortEntries(entries)
    balance = runningBalance()
  }

  const totalCharges = round2(entries.reduce((s, e) => s + e.charge, 0))
  const totalCredits = round2(entries.reduce((s, e) => s + e.credit, 0))

  return { entries, balance, totalCharges, totalCredits, notYetDue, lateFee }
}

// Owed / outstanding summary for one student.
export function studentOwed(state, studentId, today = new Date()) {
  const led = studentLedger(state, studentId, today)
  const owed = Math.max(0, led.balance)
  const outstanding = Math.max(0, round2(owed - led.notYetDue))
  return { balance: led.balance, owed, outstanding, notYetDue: led.notYetDue }
}

// Total money a parent actually paid for a student — payments only, NOT account credits.
export function studentPaidTotal(state, studentId) {
  return round2((state.payments || []).filter((p) => p.studentId === studentId).reduce((s, p) => s + (p.amount || 0), 0))
}

// Reconciliation view: what was charged vs. what was actually paid (credits excluded).
// owed = charged − paid (if positive); excess = paid − charged (if positive).
export function reconcile(state, studentId, today = new Date()) {
  let charged = 0
  for (let i = -14; i <= 0; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    for (const b of sessionsForStudentInMonth(state, studentId, d.getFullYear(), d.getMonth())) charged += b.amount
  }
  charged = round2(charged)
  const paid = studentPaidTotal(state, studentId)
  const net = round2(charged - paid)
  return { charged, paid, owed: Math.max(0, net), excess: Math.max(0, -net) }
}

// Studio-wide totals for the payments home page.
export function studioTotals(state, today = new Date()) {
  let owed = 0
  let outstanding = 0
  for (const s of state.students.filter((s) => !s.archived)) {
    const o = studentOwed(state, s.id, today)
    owed += o.owed
    outstanding += o.outstanding
  }
  return { owed: round2(owed), outstanding: round2(outstanding) }
}
