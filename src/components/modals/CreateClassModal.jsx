import React, { useMemo, useState } from 'react'
import Modal from '../Modal.jsx'
import { useStore, nowOf } from '../../store.jsx'
import { uid } from '../../utils/id.js'
import { DAYS, DAYS_SHORT } from '../../constants.js'
import {
  formatTime,
  isInBreak,
  parseISO,
  minutesToTime,
  timeToMinutes,
  firstOccurrenceOnOrAfter,
  summerWeekDates,
  prettyDate,
} from '../../utils/dates.js'
import { studentName } from '../../utils/helpers.js'

const defaultName = (type, dayOfWeek, startTime) => {
  if (type === 'makeup') return `Makeup — ${formatTime(startTime)}`
  if (type === 'summer') return `Summer lessons — ${formatTime(startTime)}`
  return `${DAYS_SHORT[dayOfWeek]} ${formatTime(startTime)}`
}

const hourToTime = (h) => `${String(h).padStart(2, '0')}:00`

// onCreated(templateId) is called for recurring classes so the parent can prompt for students.
export default function CreateClassModal({ onClose, onCreated, defaultDate, defaultDayOfWeek, defaultHour, defaultType }) {
  const { state, dispatch } = useStore()
  const [type, setType] = useState(defaultType || 'group')
  const [dayOfWeek, setDayOfWeek] = useState(defaultDayOfWeek ?? 3) // Wednesday
  // When opened from a calendar slot, prefill the clicked hour as the start time.
  const [start, setStart] = useState(defaultHour != null ? hourToTime(defaultHour) : '18:00')
  const [end, setEnd] = useState(defaultHour != null ? hourToTime(Math.min(defaultHour + 1, 23)) : '19:00')
  const [name, setName] = useState('')
  const [date, setDate] = useState(defaultDate || '')
  const [studentId, setStudentId] = useState('')
  const [error, setError] = useState('')

  const isMakeup = type === 'makeup'
  const isSummer = type === 'summer'
  const active = state.students.filter((s) => !s.archived)
  const summerDays = isSummer && date ? summerWeekDates(parseISO(date)) : null

  const namePreview = useMemo(
    () =>
      name.trim() ||
      (type === 'summer' && summerDays ? `Summer week of ${prettyDate(summerDays[0])}` : defaultName(type, dayOfWeek, start)),
    [name, type, dayOfWeek, start, summerDays],
  )

  // keep end after start
  const onStartChange = (v) => {
    setStart(v)
    if (timeToMinutes(v) >= timeToMinutes(end)) setEnd(minutesToTime(Math.min(timeToMinutes(v) + 60, 23 * 60 + 59)))
  }

  const create = () => {
    setError('')
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      setError('End time must be after the start time.')
      return
    }
    if (isSummer) {
      if (!date) return setError('Pick any date in the week you want — it snaps to Monday–Friday.')
      if (!isInBreak(parseISO(date))) return setError('Summer lessons live in the break window (June 18 → October).')
      const weekId = uid()
      const days = summerWeekDates(parseISO(date))
      dispatch({
        type: 'ADD_SUMMER_WEEK',
        weekId,
        name: name.trim() || `Summer week of ${prettyDate(days[0])}`,
        dates: days,
        startTime: start,
        endTime: end,
      })
      onCreated?.({ summerWeekId: weekId, firstDate: days[0] })
      return
    }
    if (isMakeup) {
      if (!date) return setError('Pick a date for the makeup session.')
      if (isInBreak(parseISO(date))) return setError('No classes between June 18 and the start of October.')
      if (!studentId) return setError('A makeup 1-on-1 needs one student.')
      dispatch({
        type: 'ADD_MAKEUP',
        occ: {
          type: 'makeup',
          name: name.trim() || defaultName('makeup', 0, start),
          date,
          startTime: start,
          endTime: end,
          studentIds: [studentId],
        },
      })
      // Jump the calendar to the makeup's date so it's visible.
      onCreated?.({ firstDate: date })
      return
    }
    // recurring group / 1-on-1
    const id = uid()
    const now = nowOf(state)
    const firstDate = firstOccurrenceOnOrAfter(dayOfWeek, now)
    dispatch({
      type: 'ADD_TEMPLATE',
      template: {
        id,
        type,
        name: name.trim() || defaultName(type, dayOfWeek, start),
        dayOfWeek,
        startTime: start,
        endTime: end,
        permanentStudentIds: [],
        createdAt: now.toISOString(),
      },
    })
    // Pass the first real session date so the schedule jumps to where the class appears.
    onCreated?.({ templateId: id, firstDate })
  }

  return (
    <Modal
      title="New class"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={create}>
            {isMakeup ? 'Add session' : isSummer ? 'Create week & add students' : 'Create class & add students'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label">Class type</label>
        <div className="seg" style={{ display: 'flex' }}>
          {[
            ['group', 'Group class'],
            ['oneonone', '1-on-1'],
            ['makeup', 'Makeup 1-on-1'],
            ['summer', 'Summer lessons'],
          ].map(([id, label]) => (
            <button key={id} className={type === id ? 'on' : ''} onClick={() => setType(id)} style={{ flex: 1 }}>
              {label}
            </button>
          ))}
        </div>
        <div className="hint">
          {type === 'group' && 'Recurring weekly group class — billed at $40 / session.'}
          {type === 'oneonone' && 'Recurring weekly 1-on-1 — takes a single student, not billed automatically.'}
          {type === 'makeup' && 'One-off session on a specific date. Not recurring, not billed, single student.'}
          {type === 'summer' && 'A Monday–Friday week during the summer break. Five separate daily sessions — each day gets its own goals, notes, and ratings. Free (never billed).'}
        </div>
      </div>

      {isMakeup || isSummer ? (
        <div className="field">
          <label className="label">{isSummer ? 'Week (pick any day — snaps to Mon–Fri)' : 'Date'}</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          {isSummer && summerDays && (
            <div className="hint">
              {prettyDate(summerDays[0])} → {prettyDate(summerDays[4])} · 5 daily sessions
            </div>
          )}
        </div>
      ) : (
        <div className="field">
          <label className="label">Repeats every</label>
          <div className="day-pick">
            {DAYS.map((d, i) => (
              <button key={d} className={`day-btn${dayOfWeek === i ? ' on' : ''}`} onClick={() => setDayOfWeek(i)}>
                {DAYS_SHORT[i]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label className="label">Start time</label>
          <input type="time" className="input" value={start} onChange={(e) => onStartChange(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">End time</label>
          <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      {isMakeup && (
        <div className="field">
          <label className="label">Student</label>
          <select className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select a student…</option>
            {active.map((s) => (
              <option key={s.id} value={s.id}>
                {studentName(s)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label className="label">
          Class name <span className="muted">(optional — defaults to day & time)</span>
        </label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={namePreview} />
      </div>

      {error && <div className="form-error">{error}</div>}
    </Modal>
  )
}
