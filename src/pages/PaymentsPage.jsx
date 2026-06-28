import React, { useMemo, useState } from 'react'
import { useStore, nowOf } from '../store.jsx'
import { studioTotals, studentLedger, studentOwed } from '../utils/payments.js'
import { isoDate, parseISO } from '../utils/dates.js'
import { studentName, studentById, studentPhones } from '../utils/helpers.js'
import { buildReminderMessage } from '../utils/sms.js'
import { sendPaymentReminder } from '../utils/api.js'
import Modal from '../components/Modal.jsx'
import StudentGrid from '../components/StudentGrid.jsx'
import PaymentNotifications from '../components/PaymentNotifications.jsx'
import { GROUP_CLASS_PRICE } from '../constants.js'

const fmtDate = (iso) =>
  parseISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = (ts) => {
  const d = new Date(ts)
  return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function PaymentsPage() {
  const { state } = useStore()
  const today = nowOf(state)
  const [selected, setSelected] = useState('')

  const totals = useMemo(() => studioTotals(state, today), [state, today])
  const selStudent = selected ? studentById(state, selected) : null

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Payments</div>
          <div className="page-sub">
            Group classes are ${state.classPrice ?? GROUP_CLASS_PRICE}/session, billed monthly. A cycle becomes outstanding once unpaid past the 10th.
          </div>
        </div>
      </div>

      <PaymentNotifications />

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="stat-label">Owed (uncollected)</div>
          <div className="stat-value">${totals.owed.toFixed(2)}</div>
          <div className="stat-sub">Total balance across all students</div>
        </div>
        <div className="stat" style={{ borderColor: totals.outstanding > 0 ? '#f0c4cb' : 'var(--border)' }}>
          <div className="stat-label" style={{ color: totals.outstanding > 0 ? 'var(--red)' : undefined }}>
            Outstanding
          </div>
          <div className="stat-value" style={{ color: totals.outstanding > 0 ? 'var(--red)' : undefined }}>
            ${totals.outstanding.toFixed(2)}
          </div>
          <div className="stat-sub">Unpaid past the 10th</div>
        </div>
        <div className="stat">
          <div className="stat-label">Late fees</div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            {state.lateFeeEnabled ? `On (${Math.round((state.lateFeeRate ?? 0.1) * 100)}%)` : 'Off'}
          </div>
          <div className="stat-sub">Toggle in Settings</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="spread wrap" style={{ marginBottom: 16, gap: 12 }}>
          <h3 style={{ fontSize: 17 }}>{selStudent ? `Statement — ${studentName(selStudent)}` : 'Statement of account'}</h3>
          {selected && (
            <button className="btn btn-sm" onClick={() => setSelected('')}>
              ← Choose another student
            </button>
          )}
        </div>

        {!selected ? (
          <StudentGrid onPick={setSelected} emptyHint="Add students first to record payments." />
        ) : (
          <StudentLedger studentId={selected} today={today} />
        )}
      </div>

      <SummerFolder />
    </div>
  )
}

// Small, hideable folder for summer-lesson payments (no student attached; only needed in summer).
function SummerFolder() {
  const { state, dispatch } = useStore()
  const summer = state.summerPayments || []
  const [open, setOpen] = useState(false)
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(isoDate(nowOf(state)))
  const [method, setMethod] = useState('cash')
  const total = summer.reduce((s, p) => s + (p.amount || 0), 0)

  const add = () => {
    const n = parseFloat(amt)
    if (!n || n <= 0) return
    dispatch({ type: 'ADD_SUMMER_PAYMENT', amount: Math.round(n * 100) / 100, dateReceived: date, note, method })
    setAmt('')
    setNote('')
  }

  return (
    <div className="card card-pad summer-folder">
      <button className="summer-head" onClick={() => setOpen((o) => !o)}>
        <span style={{ fontWeight: 700 }}>☀️ Summer lessons</span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {summer.length} payment{summer.length === 1 ? '' : 's'} · ${total.toFixed(2)} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Off-season payments not tied to a student. Add cash/check here, or file an email payment here via the
            Notifications “Summer classes” reason.
          </div>
          <div className="record-pay" style={{ marginBottom: 12 }}>
            <input className="input" type="number" min="0" step="0.01" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ maxWidth: 120 }} />
            <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ maxWidth: 200 }} />
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)} style={{ maxWidth: 110 }}>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
            </select>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 160 }} />
            <button className="btn btn-primary" onClick={add} disabled={!parseFloat(amt)}>
              Add
            </button>
          </div>
          {summer.length > 0 && (
            <div className="int-rows">
              {summer.map((p) => (
                <div className="int-row" key={p.id}>
                  <div>
                    <strong>${Number(p.amount).toFixed(2)}</strong>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                      {fmtDate(p.dateReceived)} · {p.method || 'cash'}
                      {p.note ? ` · ${p.note}` : ''}
                    </span>
                  </div>
                  <button className="icon-btn" style={{ width: 26, height: 26 }} title="Remove" onClick={() => dispatch({ type: 'DELETE_SUMMER_PAYMENT', id: p.id })}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StudentLedger({ studentId, today }) {
  const { state, dispatch } = useStore()
  const led = useMemo(() => studentLedger(state, studentId, today), [state, studentId, today])
  const owed = useMemo(() => studentOwed(state, studentId, today), [state, studentId, today])
  const s = studentById(state, studentId)
  const [reminderOpen, setReminderOpen] = useState(false)

  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(isoDate(today))
  const [payMethod, setPayMethod] = useState('cash')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditDate, setCreditDate] = useState(isoDate(today))

  const recordPayment = () => {
    const amt = parseFloat(payAmount)
    if (!amt || amt <= 0) return
    dispatch({ type: 'ADD_PAYMENT', studentId, amount: Math.round(amt * 100) / 100, dateReceived: payDate, method: payMethod })
    setPayAmount('')
  }

  const addCredit = () => {
    const amt = parseFloat(creditAmount)
    if (!amt || amt <= 0) return
    dispatch({ type: 'ADD_ADJUSTMENT', studentId, amount: Math.round(amt * 100) / 100, reason: creditReason, date: creditDate })
    setCreditAmount('')
    setCreditReason('')
  }

  const removeEntry = (e) => {
    if (e.kind === 'payment') dispatch({ type: 'DELETE_PAYMENT', id: e.id })
    else if (e.kind === 'credit') dispatch({ type: 'DELETE_ADJUSTMENT', id: e.id })
  }

  if (led.entries.length === 0) {
    return (
      <div className="empty">
        <p>
          <strong>{studentName(s)}</strong> has no charges yet. (Group-class cycles are billed once the month begins; 1-on-1
          and makeup sessions aren't billed automatically.)
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Account summary */}
      <div className="ledger-summary">
        <div>
          <div className="figure-label">Balance due</div>
          <div className="figure-value strong" style={{ fontSize: 24 }}>${owed.owed.toFixed(2)}</div>
        </div>
        <div>
          <div className="figure-label">Outstanding</div>
          <div className="figure-value" style={{ fontSize: 20, color: owed.outstanding > 0 ? 'var(--red)' : 'var(--text-soft)' }}>
            ${owed.outstanding.toFixed(2)}
          </div>
        </div>
        {owed.notYetDue > 0 && (
          <div>
            <div className="figure-label">Not due yet</div>
            <div className="figure-value" style={{ fontSize: 20, color: 'var(--amber)' }}>${owed.notYetDue.toFixed(2)}</div>
          </div>
        )}
        <div>
          <div className="figure-label">Total charged · paid</div>
          <div className="figure-value" style={{ fontSize: 16 }}>
            ${led.totalCharges.toFixed(2)} · ${led.totalCredits.toFixed(2)}
          </div>
        </div>
        <div className="reminder-cta">
          <button
            className="btn btn-primary"
            onClick={() => setReminderOpen(true)}
            disabled={!studentPhones(s).length || owed.owed <= 0}
            title={
              !studentPhones(s).length
                ? 'Add a parent phone number on the Students page first'
                : owed.owed <= 0
                  ? 'Nothing is owed'
                  : 'Text the parent a payment reminder'
            }
          >
            📱 Text payment reminder
          </button>
          {!studentPhones(s).length && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>No parent phone on file</div>}
        </div>
      </div>

      {reminderOpen && <ReminderModal student={s} studentId={studentId} today={today} onClose={() => setReminderOpen(false)} />}

      {/* The ledger */}
      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th className="num">Charge</th>
              <th className="num">Payment / Credit</th>
              <th className="num">Balance</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {led.entries.map((e) => (
              <tr key={e.id} className={`led-row led-${e.kind}`}>
                <td>
                  <div className="led-date">{fmtDate(e.date)}</div>
                  {e.kind !== 'charge' && <div className="led-time">{fmtTime(e.ts)}</div>}
                </td>
                <td>
                  {e.description}
                  {e.source === 'email' && <span className="auto-tag" title="Auto-applied from a forwarded payment email">auto</span>}
                  {e.overrideKey && <ClassCount entry={e} />}
                </td>
                <td className="num">{e.charge > 0 ? `$${e.charge.toFixed(2)}` : ''}</td>
                <td className="num credit">{e.credit > 0 ? `−$${e.credit.toFixed(2)}` : ''}</td>
                <td className="num bal">${e.balanceAfter.toFixed(2)}</td>
                <td className="num">
                  {(e.kind === 'payment' || e.kind === 'credit') && (
                    <button className="icon-btn" style={{ width: 26, height: 26 }} title="Remove" onClick={() => removeEntry(e)}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="foot-label">
                Balance due
              </td>
              <td className="num bal strong">${owed.owed.toFixed(2)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Entry forms */}
      <div className="ledger-forms">
        <div className="ledger-form">
          <div className="sub-label">Record payment received (cash / check)</div>
          <div className="record-pay">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              style={{ maxWidth: 130 }}
            />
            <select className="select" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ maxWidth: 110 }}>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
            <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ maxWidth: 160 }} />
            <button className="btn btn-primary" onClick={recordPayment} disabled={!parseFloat(payAmount)}>
              Record payment
            </button>
          </div>
        </div>

        <div className="ledger-form">
          <div className="sub-label">Add credit (reduces what they owe)</div>
          <div className="record-pay">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Credit amount"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              style={{ maxWidth: 130 }}
            />
            <input
              className="input"
              placeholder="Reason (optional)"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              style={{ maxWidth: 180 }}
            />
            <input className="input" type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} style={{ maxWidth: 160 }} />
            <button className="btn" onClick={addCredit} disabled={!parseFloat(creditAmount)}>
              Add credit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Preview → send a payment-reminder text. The message is built from the editable template
// (Settings → Integrations) so the teacher always sees exactly what will be sent first.
function ReminderModal({ student, studentId, today, onClose }) {
  const { state } = useStore()
  const phoneOptions = studentPhones(student)
  const [message, setMessage] = useState(() => buildReminderMessage(state, studentId, today))
  const [phone, setPhone] = useState(phoneOptions[0] || '')
  const [status, setStatus] = useState('preview') // preview | sending | sent | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const send = async () => {
    setStatus('sending')
    setError('')
    try {
      const res = await sendPaymentReminder({ studentId, to: phone.trim(), message })
      setResult(res)
      setStatus('sent')
    } catch (e) {
      setError(e.message || 'Could not send the text.')
      setStatus('error')
    }
  }

  return (
    <Modal
      title="Text payment reminder"
      onClose={onClose}
      footer={
        status === 'sent' ? (
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={send} disabled={status === 'sending' || !phone.trim() || !message.trim()}>
              {status === 'sending' ? 'Sending…' : 'Send text'}
            </button>
          </>
        )
      }
    >
      {status === 'sent' ? (
        <div className="form-success">
          {result?.mock ? (
            <>
              <strong>Dev mock — no real text was sent.</strong>
              <div className="muted" style={{ marginTop: 6, fontWeight: 400 }}>
                Set TWILIO_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM on the server to send for real. The message was logged.
              </div>
            </>
          ) : (
            <>✅ Text sent to {phone}.</>
          )}
        </div>
      ) : (
        <>
          <div className="field">
            <label className="label">To (parent phone)</label>
            {phoneOptions.length > 1 && (
              <select
                className="select"
                value={phoneOptions.includes(phone) ? phone : ''}
                onChange={(e) => setPhone(e.target.value)}
                style={{ maxWidth: 240, marginBottom: 8 }}
              >
                {phoneOptions.map((p, i) => (
                  <option key={i} value={p}>
                    {p}
                    {i === 0 ? ' · primary' : ''}
                  </option>
                ))}
              </select>
            )}
            <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ maxWidth: 240 }} />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label className="label">Message preview (editable)</label>
            <textarea className="textarea" style={{ minHeight: 120 }} value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
              {message.length} characters · edit the default in Settings → Integrations.
            </div>
          </div>
          {status === 'error' && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
        </>
      )}
    </Modal>
  )
}

// Editable class-count for a monthly charge. Defaults to the real session count; click to change.
function ClassCount({ entry }) {
  const { dispatch } = useStore()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(entry.count))

  const start = () => {
    setVal(String(entry.count))
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    const raw = val.trim()
    const n = raw === '' ? null : parseInt(raw, 10)
    if (n != null && (isNaN(n) || n < 0)) return // ignore invalid
    // Setting it back to the real count clears the override (returns to default).
    dispatch({ type: 'SET_CHARGE_COUNT', key: entry.overrideKey, count: n === entry.actualCount ? null : n })
  }

  if (editing) {
    return (
      <input
        className="count-input"
        type="number"
        min="0"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button
      className={`count-chip${entry.overridden ? ' overridden' : ''}`}
      onClick={start}
      title="Click to edit the number of classes this month"
    >
      × {entry.count}
      {entry.overridden && <span className="count-edited" title={`Actual: ${entry.actualCount}`}>edited</span>}
    </button>
  )
}
