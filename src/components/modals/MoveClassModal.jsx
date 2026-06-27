import React, { useState } from 'react'
import Modal from '../Modal.jsx'
import { useStore } from '../../store.jsx'
import { isInBreak, parseISO, timeToMinutes, prettyDate } from '../../utils/dates.js'

// proposal: { occ, newDate, startTime, endTime }
export default function MoveClassModal({ proposal, onClose }) {
  const { dispatch } = useStore()
  const [date, setDate] = useState(proposal.newDate)
  const [start, setStart] = useState(proposal.startTime)
  const [end, setEnd] = useState(proposal.endTime)
  const [error, setError] = useState('')

  const confirm = () => {
    if (isInBreak(parseISO(date))) return setError('No classes between June 18 and the start of October.')
    if (timeToMinutes(end) <= timeToMinutes(start)) return setError('End time must be after the start time.')
    dispatch({ type: 'MOVE_OCCURRENCE', occ: proposal.occ, newDate: date, startTime: start, endTime: end })
    onClose()
  }

  return (
    <Modal
      title="Move this session"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirm}>
            Move session
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Confirm the date and time for <strong>{proposal.occ.name}</strong>. Moving it
        {proposal.occ.recurring ? ' only affects this week — future weeks stay on the regular schedule.' : ' updates this one-off session.'}
      </p>

      <div className="field">
        <label className="label">Date</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="hint">{prettyDate(date)}</div>
      </div>

      <div className="field-row">
        <div className="field">
          <label className="label">Start time</label>
          <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">End time</label>
          <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      {proposal.occ.recurring && (
        <div className="hint">
          The regular {proposal.occ.name} slot will be removed for this week only.
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </Modal>
  )
}
