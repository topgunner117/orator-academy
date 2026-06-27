import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import Modal from './Modal.jsx'
import StudentGrid from './StudentGrid.jsx'

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
                Student unknown payment · <span style={{ color: 'var(--accent)' }}>${Number(u.amount).toFixed(2)}</span>
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
  const { dispatch } = useStore()
  const [reason, setReason] = useState('group') // group | oneonone | summer  (default group; if /40 it's group anyway)
  const [siblings, setSiblings] = useState(false)
  const [picked, setPicked] = useState([])

  const isSummer = reason === 'summer'
  const need = siblings ? 2 : 1

  const togglePick = (id) =>
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      if (need === 1) return [id]
      return cur.length >= 2 ? [cur[1], id] : [...cur, id]
    })

  const canAssign = isSummer || picked.length === need
  const apply = () => {
    if (isSummer) {
      dispatch({ type: 'ASSIGN_UNASSIGNED_TO_SUMMER', id: payment.id })
    } else if (picked.length === need) {
      dispatch({ type: 'ASSIGN_UNASSIGNED_PAYMENT', id: payment.id, studentIds: picked })
    } else return
    onClose()
  }

  const share = siblings ? Number(payment.amount) / 2 : Number(payment.amount)

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
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>${Number(payment.amount).toFixed(2)}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            from {payment.senderName || 'unknown'}
            {payment.memo ? ` · “${payment.memo}”` : ''} · {payment.provider}
          </div>
        </div>
      </div>

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
      {reason === 'group' && payment.amount % 40 === 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>${payment.amount} is a multiple of $40 — group classes.</div>
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
        </>
      )}
    </Modal>
  )
}
