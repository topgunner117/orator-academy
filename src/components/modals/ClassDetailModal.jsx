import React, { useRef, useState } from 'react'
import Modal from '../Modal.jsx'
import AddStudentsModal from './AddStudentsModal.jsx'
import PhotoImportModal from './PhotoImportModal.jsx'
import StarRating from '../StarRating.jsx'
import Avatar from '../Avatar.jsx'
import { useStore } from '../../store.jsx'
import { getOccurrenceById, goalKeyFor, orderedGoals } from '../../utils/engine.js'
import { METRICS, CLASS_TYPES } from '../../constants.js'
import { formatTimeRange, prettyDate, parseISO, isoDate } from '../../utils/dates.js'
import { studentName, studentById } from '../../utils/helpers.js'

export default function ClassDetailModal({ occId, onClose, onMove, onDelete }) {
  const { state, dispatch } = useStore()
  const occ = getOccurrenceById(state, occId)
  const [addStudents, setAddStudents] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const photoInputRef = useRef(null)

  if (!occ) {
    return (
      <Modal title="Class" onClose={onClose}>
        <p className="muted">This session no longer exists.</p>
      </Modal>
    )
  }

  const goalKey = goalKeyFor(occ)
  const goalStore = state.goals[goalKey] || { classGoals: [], studentGoals: {} }
  const today = isoDate(parseISO(occ.date))

  const updateMeta = (patch) => {
    if (occ.recurring) dispatch({ type: 'UPDATE_TEMPLATE', id: occ.templateId, patch })
    else dispatch({ type: 'UPDATE_OCCURRENCE', id: occ.occId, patch })
  }

  const saveName = () => {
    if (nameDraft.trim()) updateMeta({ name: nameDraft.trim() })
    setEditingName(false)
  }

  return (
    <Modal title="" onClose={onClose} wide>
      <div className="detail">
        {/* Header */}
        <div className="detail-head">
          <div style={{ flex: 1 }}>
            {editingName ? (
              <input
                className="input"
                style={{ fontSize: 18, fontWeight: 700 }}
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
              />
            ) : (
              <h2
                className="detail-name"
                onClick={() => {
                  setNameDraft(occ.name)
                  setEditingName(true)
                }}
                title="Click to rename"
              >
                {occ.name} <span className="edit-pencil">✎</span>
              </h2>
            )}
            <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
              <span className={`chip ${occ.type}`}>{CLASS_TYPES[occ.type]?.label}</span>
              <span className="chip">{prettyDate(occ.date)}</span>
              {occ.kind === 'moved' && <span className="chip amber">Moved this week</span>}
              {occ.type === 'summer' && <span className="chip summer">One day of a Mon–Fri week</span>}
              {!occ.recurring && occ.type !== 'makeup' && occ.type !== 'summer' && <span className="chip">One-off</span>}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => photoInputRef.current?.click()} title="Read handwritten notes from a photo">
              📷 Import notes
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) setPhotoFile(f)
              }}
            />
            <button className="btn btn-sm" onClick={() => onMove(occ)}>
              ↔ Move
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(occ)}>
              🗑 Delete
            </button>
          </div>
        </div>

        {/* Time editor */}
        <div className="detail-time card-pad" style={{ background: 'var(--surface-2)', borderRadius: 12, marginBottom: 18 }}>
          <div className="row wrap" style={{ gap: 16 }}>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                Start
              </div>
              <input
                type="time"
                className="input"
                style={{ width: 130 }}
                value={occ.startTime}
                onChange={(e) => updateMeta({ startTime: e.target.value })}
              />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                End
              </div>
              <input
                type="time"
                className="input"
                style={{ width: 130 }}
                value={occ.endTime}
                onChange={(e) => updateMeta({ endTime: e.target.value })}
              />
            </div>
            <div style={{ alignSelf: 'flex-end', paddingBottom: 9, color: 'var(--text-soft)', fontWeight: 600 }}>
              {formatTimeRange(occ.startTime, occ.endTime)}
              {occ.recurring && <span className="muted"> · changes all weeks</span>}
              {occ.type === 'summer' && <span className="muted"> · this day only</span>}
            </div>
          </div>
        </div>

        {/* Class goals */}
        <Section title="Class goals" sub="Shared objective for this class. Carries over each session until met.">
          <GoalList
            goals={orderedGoals(goalStore.classGoals)}
            onAdd={(text) => dispatch({ type: 'ADD_GOAL', goalKey, text, date: today })}
            onToggle={(g, met) => dispatch({ type: 'SET_GOAL_MET', goalKey, goalId: g.id, met, date: today })}
            onDelete={(g) => dispatch({ type: 'DELETE_GOAL', goalKey, goalId: g.id })}
            placeholder="e.g. Finish first speech draft"
          />
        </Section>

        {/* Class notes */}
        <Section title="Class notes" sub="Notes for the whole class this session.">
          <textarea
            className="textarea"
            placeholder="What happened in class, themes, reminders…"
            value={occ.data.classNotes || ''}
            onChange={(e) => dispatch({ type: 'SET_CLASS_NOTES', occId: occ.occId, value: e.target.value })}
          />
        </Section>

        {/* Students */}
        <div className="spread" style={{ marginBottom: 10, marginTop: 22 }}>
          <h3 style={{ fontSize: 16 }}>Students ({occ.studentIds.length})</h3>
          <button className="btn btn-sm" onClick={() => setAddStudents(true)}>
            ＋ Add students
          </button>
        </div>

        {occ.studentIds.length === 0 ? (
          <div className="empty" style={{ padding: 28 }}>
            <p>No students in this session yet.</p>
          </div>
        ) : (
          <div className="stack">
            {occ.studentIds.map((sid) => (
              <StudentBlock
                key={sid}
                occ={occ}
                studentId={sid}
                isTemp={occ.tempStudentIds.includes(sid)}
                sessionDate={today}
              />
            ))}
          </div>
        )}
      </div>

      {addStudents && (
        <AddStudentsModal
          target={{ kind: 'session', occId: occ.occId }}
          defaultPermanent={false}
          title="Add students to this session"
          onClose={() => setAddStudents(false)}
        />
      )}

      {photoFile && <PhotoImportModal occId={occ.occId} file={photoFile} onClose={() => setPhotoFile(null)} />}
    </Modal>
  )
}

function Section({ title, sub, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 16 }}>{title}</h3>
      {sub && <div className="muted" style={{ fontSize: 12.5, marginBottom: 10, marginTop: 2 }}>{sub}</div>}
      {children}
    </div>
  )
}

function GoalList({ goals, onAdd, onToggle, onDelete, placeholder }) {
  const [text, setText] = useState('')

  const add = () => {
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }

  return (
    <div className="goal-list">
      {goals.map((g) => (
        <div key={g.id} className={`goal-item${g.met ? ' done' : ''}`}>
          <div className="goal-main">
            <div className="goal-text">{g.text}</div>
            <div className="goal-meta">
              Set {prettyDate(g.createdDate)}
              {g.met && g.completedDate ? ` · completed ${prettyDate(g.completedDate)}` : ''}
            </div>
          </div>
          {g.met ? (
            <button className="chip green" title="Reopen" onClick={() => onToggle(g, false)}>
              ✓ Complete
            </button>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => onToggle(g, true)}>
                ✓ Met
              </button>
              <button className="icon-btn" title="Delete goal" style={{ width: 30, height: 30 }} onClick={() => onDelete(g)}>
                ✕
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="goal-add">
        <input
          className="input"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}

function StudentBlock({ occ, studentId, isTemp, sessionDate }) {
  const { state, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const s = studentById(state, studentId)
  const evals = occ.data.evaluations?.[studentId] || { metrics: {}, note: '' }
  const attendance = occ.data.attendance?.[studentId]
  // Individual goals are global to the student — they follow them into every class.
  const studentGoals = orderedGoals(state.studentGoals[studentId] || [])

  const setMetric = (key, value) =>
    dispatch({ type: 'SET_EVALUATION', occId: occ.occId, studentId, metricKey: key, value })

  return (
    <div className="student-block card">
      <div className="student-block-head" onClick={() => setOpen((o) => !o)}>
        <div className="row">
          <Avatar student={s} size="sm" className={attendance ? `att-${attendance}` : ''} />
          <div>
            <div style={{ fontWeight: 700 }}>{studentName(s)}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {studentGoals.filter((g) => !g.met).length} open goal(s)
            </div>
          </div>
          {isTemp && <span className="chip oneonone">Temporary</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="seg" onClick={(e) => e.stopPropagation()}>
            <button
              className={attendance === 'present' ? 'on att-present' : ''}
              onClick={() => dispatch({ type: 'SET_ATTENDANCE', occId: occ.occId, studentId, value: 'present' })}
            >
              Present
            </button>
            <button
              className={attendance === 'absent' ? 'on att-absent' : ''}
              onClick={() => dispatch({ type: 'SET_ATTENDANCE', occId: occ.occId, studentId, value: 'absent' })}
            >
              Absent
            </button>
          </div>
          <button
            className="icon-btn"
            title="Remove from this session"
            style={{ width: 30, height: 30 }}
            onClick={(e) => {
              e.stopPropagation()
              dispatch({ type: 'REMOVE_STUDENT_FROM_SESSION', occId: occ.occId, studentId })
            }}
          >
            ✕
          </button>
          <span className="chevron">{open ? '▴' : '▾'}</span>
        </div>
      </div>

      {open && (
        <div className="student-block-body">
          <div className="sub-label">Individual goal <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· follows this student into every class</span></div>
          <GoalList
            goals={studentGoals}
            onAdd={(text) => dispatch({ type: 'ADD_STUDENT_GOAL', studentId, text, date: sessionDate })}
            onToggle={(g, met) => dispatch({ type: 'SET_STUDENT_GOAL_MET', studentId, goalId: g.id, met, date: sessionDate })}
            onDelete={(g) => dispatch({ type: 'DELETE_STUDENT_GOAL', studentId, goalId: g.id })}
            placeholder="e.g. Reduce filler words"
          />

          <div className="sub-label" style={{ marginTop: 16 }}>
            Presentation metrics
          </div>
          <div className="metrics-grid">
            {METRICS.map((m) => (
              <div className="metric-row" key={m.key}>
                <span className="metric-label">{m.label}</span>
                <StarRating value={evals.metrics[m.key] || 0} onChange={(v) => setMetric(m.key, v)} size={18} />
              </div>
            ))}
          </div>

          <div className="sub-label" style={{ marginTop: 16 }}>
            Presentation notes
          </div>
          <textarea
            className="textarea"
            placeholder="Notes on this student's presentation today…"
            value={evals.note || ''}
            onChange={(e) => dispatch({ type: 'SET_EVALUATION', occId: occ.occId, studentId, metricKey: null, value: e.target.value })}
          />
        </div>
      )}
    </div>
  )
}
