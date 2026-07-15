import React, { useState } from 'react'
import { useStore, normSender } from '../store.jsx'
import Modal from './Modal.jsx'
import StudentGrid from './StudentGrid.jsx'
import { studentById, studentName } from '../utils/helpers.js'

const fmtDateTime = (ts) => {
  const d = new Date(ts)
  return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Unknown-payment notifications: email payments with no student named in the memo. Each can be
// assigned to a student (or split between 2 siblings), or filed under summer lessons.
export default function PaymentNotifications() {
  const { state, dispatch } = useStore()
  const list = state.unassignedPayments || []
  const [assigning, setAssigning] = useState(null)

  return (
    <div className={`card card-pad notif-card${list.length ? ' has-items' : ''}`}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 16 }}>🔔 Notifications — unassigned payments{list.length ? ` (${list.length})` : ''}</h3>
        <span className="muted" style={{ fontSize: 12 }}>Payments received with no student name in the memo</span>
      </div>
      {list.length === 0 && (
        <div className="muted" style={{ fontSize: 13, padding: '6px 2px' }}>
          Nothing to assign right now. When a payment email arrives with no student name in the memo, it appears here with
          its timestamp, amount, and sender — click <strong>Assign</strong> to pick the student(s) or file it under summer.
        </div>
      )}
      <div className="int-rows">
        {list.map((u) => (
          <div className="notif-row" key={u.id}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                Student unknown payment ·{' '}
                {u.amount ? (
                  <span style={{ color: 'var(--accent)' }}>${Number(u.amount).toFixed(2)}</span>
                ) : (
                  <span style={{ color: 'var(--amber)' }}>amount unknown</span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {fmtDateTime(u.ts)} · from {u.senderName || 'unknown'}
                {u.memo ? ` · “${u.memo}”` : ''} · {u.provider}
              </div>
            </div>
            <div className="row" style={{ gap: 6, flexShrink: 0 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setAssigning(u)}>
                Assign
              </button>
              <button
                className="icon-btn"
                style={{ width: 28, height: 28 }}
                title="Dismiss (delete this notification)"
                onClick={() => dispatch({ type: 'DISMISS_UNASSIGNED_PAYMENT', id: u.id })}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      {assigning && <AssignPaymentModal payment={assigning} onClose={() => setAssigning(null)} />}
    </div>
  )
}

function AssignPaymentModal({ payment, onClose }) {
  const { state, dispatch } = useStore()
  const [reason, setReason] = useState('group') // group | oneonone | summer  (default group; if /40 it's group anyway)
  const [siblings, setSiblings] = useState(false)
  const [picked, setPicked] = useState([])
  const [amount, setAmount] = useState(payment.amount ? String(payment.amount) : '')
  const [remember, setRemember] = useState(false)

  const isSummer = reason === 'summer'
  const need = siblings ? 2 : 1
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100

  // Sender name → whether we can offer/show the "remember this sender" option (single-student only).
  const senderKey = normSender(payment.senderName)
  const existingMapId = senderKey ? (state.senderMappings || {})[senderKey] : null
  const existingMapStudent = existingMapId ? studentById(state, existingMapId) : null
  const canRemember = !isSummer && !siblings && !!senderKey

  const togglePick = (id) =>
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      if (need === 1) return [id]
      return cur.length >= 2 ? [cur[1], id] : [...cur, id]
    })

  const canAssign = amt > 0 && (isSummer || picked.length === need)
  const apply = () => {
    if (amt <= 0) return
    if (isSummer) {
      dispatch({ type: 'ASSIGN_UNASSIGNED_TO_SUMMER', id: payment.id, amount: amt })
    } else if (picked.length === need) {
      // Optionally remember this sender so future unidentified payments from them auto-credit
      // this student (only meaningful for a single-student assignment with a real sender name).
      if (remember && canRemember && picked.length === 1) {
        dispatch({ type: 'SET_SENDER_MAPPING', senderName: payment.senderName, studentId: picked[0] })
      }
      dispatch({ type: 'ASSIGN_UNASSIGNED_PAYMENT', id: payment.id, studentIds: picked, amount: amt })
    } else return
    onClose()
  }

  const share = siblings ? amt / 2 : amt

  return (
    <Modal
      title="Assign payment"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={!canAssign}>
            {isSummer ? 'Save to summer lessons' : siblings ? 'Split between 2 students' : 'Assign to student'}
          </button>
        </>
      }
    >
      <div className="assign-head">
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Amount received</label>
          <div className="affix">
            <span className="affix-pre">$</span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus={!payment.amount}
              style={{ paddingLeft: 26, maxWidth: 170 }}
            />
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            from {payment.senderName || 'unknown'}
            {payment.memo ? ` · “${payment.memo}”` : ''} · {payment.provider}
            {!payment.amount && <span style={{ color: 'var(--amber)' }}> · amount not detected — enter it above</span>}
          </div>
        </div>
      </div>

      {existingMapStudent && (
        <div className="hint" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <span>
            📌 Payments from <strong>{payment.senderName}</strong> with no name in the memo are auto-credited to{' '}
            <strong>{studentName(existingMapStudent)}</strong>.
          </span>
          <button
            className="btn btn-sm"
            onClick={() => dispatch({ type: 'DELETE_SENDER_MAPPING', senderName: payment.senderName })}
          >
            Forget
          </button>
        </div>
      )}

      {/* Reason */}
      <div className="sub-label" style={{ marginTop: 14 }}>Reason</div>
      <div className="seg-row">
        {[
          ['group', 'Group classes'],
          ['oneonone', '1-on-1'],
          ['summer', 'Summer classes'],
        ].map(([k, label]) => (
          <button key={k} className={`seg-btn${reason === k ? ' on' : ''}`} onClick={() => setReason(k)}>
            {label}
          </button>
        ))}
      </div>
      {reason === 'group' && amt > 0 && amt % 40 === 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>${amt} is a multiple of $40 — group classes.</div>
      )}

      {isSummer ? (
        <div className="hint" style={{ marginTop: 14 }}>
          This payment will be filed under <strong>Summer lessons</strong> in Payments — no student needed.
        </div>
      ) : (
        <>
          <div className="spread" style={{ marginTop: 16 }}>
            <div className="sub-label" style={{ margin: 0 }}>Assign to {siblings ? '2 students (split evenly)' : 'a student'}</div>
            <label className="row" style={{ gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
              <span className="muted">Siblings — split in 2</span>
              <button
                type="button"
                className={`switch${siblings ? ' on' : ''}`}
                onClick={() => {
                  setSiblings((v) => !v)
                  setPicked([])
                }}
                aria-label="Toggle sibling split"
              />
            </label>
          </div>
          {siblings && (
            <div className="muted" style={{ fontSize: 11.5, margin: '4px 0 8px' }}>
              Each selected student gets ${share.toFixed(2)}. Pick exactly 2.
            </div>
          )}
          <StudentGrid selectedIds={picked} onPick={togglePick} autoFocus />

          {canRemember && (
            <label className="remember-sender" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>
                Always credit payments from <strong>{payment.senderName}</strong> to{' '}
                {picked.length === 1 ? <strong>{studentName(studentById(state, picked[0]))}</strong> : 'this student'} when no name
                is in the memo
              </span>
            </label>
          )}
        </>
      )}
    </Modal>
  )
}
