import React, { useMemo, useState } from 'react'
import { useStore, nowOf } from '../store.jsx'
import { isoDate, parseISO } from '../utils/dates.js'
import { studentName, studentById } from '../utils/helpers.js'
import { attendanceSummary } from '../utils/attendance.js'
import { reconcile } from '../utils/payments.js'
import StudentGrid from '../components/StudentGrid.jsx'
import PaymentNotifications from '../components/PaymentNotifications.jsx'

const fmtDate = (iso) => (iso ? parseISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const fmtDateTime = (ts) => {
  const d = new Date(ts)
  return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const ROLE_LABEL = { normal: 'Class', temp: 'Drop-in', makeup: '1-on-1 makeup', summer: 'Summer lessons' }

export default function ReconcilePage() {
  const { state } = useStore()
  const today = nowOf(state)
  const [selected, setSelected] = useState('')
  const s = selected ? studentById(state, selected) : null

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Reconcile payments</div>
          <div className="page-sub">Match a student's attendance against what was actually paid (credits excluded).</div>
        </div>
      </div>

      <PaymentNotifications />

      <div className="card card-pad">
        <div className="spread wrap" style={{ marginBottom: 16, gap: 12 }}>
          <h3 style={{ fontSize: 17 }}>{s ? `Reconcile — ${studentName(s)}` : 'Choose a student'}</h3>
          {selected && (
            <button className="btn btn-sm" onClick={() => setSelected('')}>
              ← Choose another student
            </button>
          )}
        </div>
        {!selected ? (
          <StudentGrid onPick={setSelected} emptyHint="Add students first." />
        ) : (
          <ReconcileView studentId={selected} today={today} />
        )}
      </div>
    </div>
  )
}

function ReconcileView({ studentId, today }) {
  const { state, dispatch } = useStore()
  const att = useMemo(() => attendanceSummary(state, studentId, today), [state, studentId, today])
  const rec = useMemo(() => reconcile(state, studentId, today), [state, studentId, today])
  const payments = useMemo(
    () => (state.payments || []).filter((p) => p.studentId === studentId).sort((a, b) => (b.ts || b.dateReceived).localeCompare(a.ts || a.dateReceived)),
    [state.payments, studentId],
  )
  const [detail, setDetail] = useState(false)
  const [amt, setAmt] = useState('')
  const [method, setMethod] = useState('cash')
  const [date, setDate] = useState(isoDate(today))

  const addPay = () => {
    const n = parseFloat(amt)
    if (!n || n <= 0) return
    dispatch({ type: 'ADD_PAYMENT', studentId, amount: Math.round(n * 100) / 100, dateReceived: date, method })
    setAmt('')
  }

  return (
    <div>
      <div className="reconcile-grid">
        {/* Left — classes attended */}
        <div className="recon-col">
          <div className="figure-label">Classes attended (marked present)</div>
          <div className="recon-big">{att.total}</div>
          <div className="recon-breakdown">
            <span><b>{att.breakdown.normal}</b> normal</span>
            <span><b>{att.breakdown.temp}</b> drop-in (temp)</span>
            <span><b>{att.breakdown.makeup}</b> 1-on-1 makeup</span>
            <span><b>{att.breakdown.summer || 0}</b> summer</span>
          </div>
        </div>

        {/* Right — money paid */}
        <div className="recon-col">
          <div className="figure-label">Total paid (cash + check + online)</div>
          <div className="recon-big">${rec.paid.toFixed(2)}</div>
          <div className="recon-breakdown">
            <span>Charged <b>${rec.charged.toFixed(2)}</b></span>
            {rec.owed > 0 ? (
              <span className="recon-owed">Still owes <b>${rec.owed.toFixed(2)}</b></span>
            ) : rec.excess > 0 ? (
              <span className="recon-excess">Overpaid <b>${rec.excess.toFixed(2)}</b></span>
            ) : (
              <span className="recon-settled">Settled up ✓</span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Money actually paid — account credits are excluded.</div>
        </div>
      </div>

      <div className="ledger-form" style={{ marginTop: 16 }}>
        <div className="sub-label">Add cash / check payment</div>
        <div className="record-pay">
          <input className="input" type="number" min="0" step="0.01" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ maxWidth: 130 }} />
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value)} style={{ maxWidth: 110 }}>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="other">Other</option>
          </select>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 160 }} />
          <button className="btn btn-primary" onClick={addPay} disabled={!parseFloat(amt)}>
            Record payment
          </button>
        </div>
      </div>

      <button className="btn" style={{ marginTop: 14 }} onClick={() => setDetail((d) => !d)}>
        {detail ? 'Hide detailed breakdown' : 'Detailed breakdown'}
      </button>

      {detail && (
        <div className="reconcile-grid detail" style={{ marginTop: 14 }}>
          {/* Left — every session with status + timestamp */}
          <div className="recon-detail-col">
            <div className="sub-label" style={{ marginTop: 0 }}>Classes ({att.sessions.length})</div>
            <div className="recon-list">
              {att.sessions.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No sessions found.</div>}
              {att.sessions.map((c) => (
                <div className="recon-item" key={c.occId}>
                  <div style={{ minWidth: 0 }}>
                    <div className="recon-item-main">{c.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {fmtDate(c.date)} {c.startTime} · {ROLE_LABEL[c.role]}
                    </div>
                  </div>
                  <span className={`att-tag att-${c.attendance || 'none'}`}>
                    {c.attendance || 'unmarked'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — every payment with timestamp */}
          <div className="recon-detail-col">
            <div className="sub-label" style={{ marginTop: 0 }}>Payments ({payments.length})</div>
            <div className="recon-list">
              {payments.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No payments recorded.</div>}
              {payments.map((p) => (
                <div className="recon-item" key={p.id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="recon-item-main">${Number(p.amount).toFixed(2)}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {fmtDateTime(p.ts || `${p.dateReceived}T00:00:00`)} · {p.source === 'email' ? 'online' : p.method || 'cash'}
                    </div>
                  </div>
                  {p.source === 'email' && <span className="att-tag att-present">auto</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
