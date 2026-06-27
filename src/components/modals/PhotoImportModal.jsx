import React, { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal.jsx'
import { useStore, nowOf } from '../../store.jsx'
import { getOccurrenceById, goalKeyFor } from '../../utils/engine.js'
import { studentName, studentById, readImageForAI } from '../../utils/helpers.js'
import { isoDate, parseISO } from '../../utils/dates.js'
import { parseNotesPhoto } from '../../utils/api.js'

// Reviews the AI's parsed notes, lets the teacher edit/confirm, then dispatches
// the existing goal/note actions. Ratings are never set here (stay manual).
export default function PhotoImportModal({ occId, file, onClose }) {
  const { state, dispatch } = useStore()
  const occ = getOccurrenceById(state, occId)
  const active = state.students.filter((s) => !s.archived)

  const [status, setStatus] = useState('loading') // loading | review | error
  const [error, setError] = useState('')
  const [mock, setMock] = useState(false)
  const [review, setReview] = useState(null)

  const today = useMemo(() => isoDate(parseISO(occ?.date || isoDate(nowOf(state)))), [occ, state])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const image = await readImageForAI(file)
        const roster = (occ?.studentIds || []).map((id) => ({ id, name: studentName(studentById(state, id)) }))
        const { result, mock } = await parseNotesPhoto(image, { className: occ?.name, date: occ?.date, roster })
        if (cancelled) return
        setMock(mock)
        setReview({
          classGoals: (result.classGoals || []).map((text) => ({ text, include: true })),
          classNotes: { text: result.classNotes || '', include: !!(result.classNotes || '').trim() },
          students: (result.students || []).map((s) => ({
            name: s.name,
            studentId: s.matchedStudentId || '',
            goals: (s.goals || []).map((text) => ({ text, include: true })),
            notes: { text: s.notes || '', include: !!(s.notes || '').trim() },
          })),
        })
        setStatus('review')
      } catch (e) {
        if (cancelled) return
        setError(e.message || 'Could not read the notes.')
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = () => {
    const goalKey = goalKeyFor(occ)

    review.classGoals.filter((g) => g.include && g.text.trim()).forEach((g) => {
      dispatch({ type: 'ADD_GOAL', goalKey, text: g.text.trim(), date: today })
    })

    if (review.classNotes.include && review.classNotes.text.trim()) {
      const existing = occ.data.classNotes || ''
      const merged = existing ? `${existing}\n${review.classNotes.text.trim()}` : review.classNotes.text.trim()
      dispatch({ type: 'SET_CLASS_NOTES', occId: occ.occId, value: merged })
    }

    review.students.forEach((s) => {
      if (!s.studentId) return
      s.goals.filter((g) => g.include && g.text.trim()).forEach((g) => {
        dispatch({ type: 'ADD_STUDENT_GOAL', studentId: s.studentId, text: g.text.trim(), date: today })
      })
      if (s.notes.include && s.notes.text.trim()) {
        const cur = occ.data.evaluations?.[s.studentId]?.note || ''
        const merged = cur ? `${cur}\n${s.notes.text.trim()}` : s.notes.text.trim()
        dispatch({ type: 'SET_EVALUATION', occId: occ.occId, studentId: s.studentId, metricKey: null, value: merged })
      }
    })

    onClose()
  }

  // ── helpers to edit the review state immutably ──
  const setClassGoal = (i, patch) =>
    setReview((r) => ({ ...r, classGoals: r.classGoals.map((g, j) => (j === i ? { ...g, ...patch } : g)) }))
  const setStudent = (i, patch) =>
    setReview((r) => ({ ...r, students: r.students.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const setStudentGoal = (si, gi, patch) =>
    setReview((r) => ({
      ...r,
      students: r.students.map((s, j) =>
        j === si ? { ...s, goals: s.goals.map((g, k) => (k === gi ? { ...g, ...patch } : g)) } : s,
      ),
    }))

  // Reclassify a parsed goal as a note for this student: append its text to their notes and
  // drop it from the goals list.
  const moveGoalToNotes = (si, gi) =>
    setReview((r) => ({
      ...r,
      students: r.students.map((s, j) => {
        if (j !== si) return s
        const text = (s.goals[gi]?.text || '').trim()
        if (!text) return { ...s, goals: s.goals.filter((_, k) => k !== gi) }
        const cur = s.notes.text || ''
        return {
          ...s,
          goals: s.goals.filter((_, k) => k !== gi),
          notes: { text: cur ? `${cur}\n${text}` : text, include: true },
        }
      }),
    }))

  return (
    <Modal
      title="Import notes from photo"
      onClose={onClose}
      wide
      footer={
        status === 'review' ? (
          <>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={apply}>
              Apply to class
            </button>
          </>
        ) : (
          <button className="btn" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {status === 'loading' && (
        <div className="empty" style={{ padding: 40 }}>
          <div className="big">🪄</div>
          <p>Reading your handwriting and sorting it…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="form-error">
          {error}
          <div className="muted" style={{ marginTop: 8, fontWeight: 400 }}>
            Make sure the backend server is running (npm run dev in /server).
          </div>
        </div>
      )}

      {status === 'review' && review && (
        <div className="photo-review">
          {mock && (
            <div className="hint" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
              Dev mock — this is sample data because no Anthropic key is set on the server. The flow is real;
              the parsing isn't.
            </div>
          )}
          <p className="muted" style={{ marginTop: 0 }}>
            Review what was read. Uncheck anything you don't want, fix the wording, and confirm which student each
            block belongs to. Ratings stay manual.
          </p>

          {/* Class goals */}
          <div className="sub-label">Class goals</div>
          {review.classGoals.length === 0 && <p className="muted" style={{ fontSize: 13 }}>None found.</p>}
          {review.classGoals.map((g, i) => (
            <ReviewLine
              key={i}
              checked={g.include}
              onToggle={() => setClassGoal(i, { include: !g.include })}
              value={g.text}
              onChange={(v) => setClassGoal(i, { text: v })}
            />
          ))}

          {/* Class notes */}
          <div className="sub-label" style={{ marginTop: 16 }}>
            Class notes
          </div>
          <div className="review-row">
            <input
              type="checkbox"
              checked={review.classNotes.include}
              onChange={() => setReview((r) => ({ ...r, classNotes: { ...r.classNotes, include: !r.classNotes.include } }))}
            />
            <textarea
              className="textarea"
              style={{ minHeight: 54 }}
              value={review.classNotes.text}
              onChange={(e) => setReview((r) => ({ ...r, classNotes: { ...r.classNotes, text: e.target.value } }))}
            />
          </div>

          {/* Students */}
          <div className="sub-label" style={{ marginTop: 18 }}>
            Students
          </div>
          {review.students.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No individual notes found.</p>}
          <div className="stack">
            {review.students.map((s, si) => (
              <div className="review-student card" key={si}>
                <div className="row wrap" style={{ gap: 10, marginBottom: 10 }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Read as “<strong>{s.name}</strong>” →
                  </span>
                  <select className="select" style={{ maxWidth: 220 }} value={s.studentId} onChange={(e) => setStudent(si, { studentId: e.target.value })}>
                    <option value="">Skip (don't import)</option>
                    {active.map((st) => (
                      <option key={st.id} value={st.id}>
                        {studentName(st)}
                      </option>
                    ))}
                  </select>
                </div>

                {s.goals.length > 0 && <div className="sub-label" style={{ margin: '4px 0' }}>Goals</div>}
                {s.goals.map((g, gi) => (
                  <ReviewLine
                    key={gi}
                    checked={g.include}
                    onToggle={() => setStudentGoal(si, gi, { include: !g.include })}
                    value={g.text}
                    onChange={(v) => setStudentGoal(si, gi, { text: v })}
                    disabled={!s.studentId}
                    action={
                      <button
                        type="button"
                        className="btn btn-sm move-to-note"
                        title="This is a note, not a goal — move it into this student's notes"
                        onClick={() => moveGoalToNotes(si, gi)}
                      >
                        → Note
                      </button>
                    }
                  />
                ))}

                {s.notes.text.trim() && (
                  <>
                    <div className="sub-label" style={{ margin: '8px 0 4px' }}>Notes</div>
                    <div className="review-row">
                      <input
                        type="checkbox"
                        checked={s.notes.include}
                        disabled={!s.studentId}
                        onChange={() => setStudent(si, { notes: { ...s.notes, include: !s.notes.include } })}
                      />
                      <textarea
                        className="textarea"
                        style={{ minHeight: 48 }}
                        value={s.notes.text}
                        onChange={(e) => setStudent(si, { notes: { ...s.notes, text: e.target.value } })}
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

function ReviewLine({ checked, onToggle, value, onChange, disabled, action }) {
  return (
    <div className="review-row">
      <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      {!disabled && action}
    </div>
  )
}
