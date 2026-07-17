import React, { useRef, useState } from 'react'
import Modal from '../Modal.jsx'
import AddStudentsModal from './AddStudentsModal.jsx'
import PhotoImportModal from './PhotoImportModal.jsx'
import StarRating from '../StarRating.jsx'
import Avatar from '../Avatar.jsx'
import GoalTree from '../GoalTree.jsx'
import { useStore, nowOf } from '../../store.jsx'
import { getOccurrenceById, goalKeyFor } from '../../utils/engine.js'
import { classNotesHistory } from '../../utils/classNotes.js'
import { printDocument } from '../../utils/print.js'
import { METRICS, CLASS_TYPES } from '../../constants.js'
import { formatTimeRange, prettyDate, longDate, parseISO, isoDate } from '../../utils/dates.js'
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
  const noteSessions = classNotesHistory(state, occ)

  const updateMeta = (patch) => {
    if (occ.recurring) dispatch({ type: 'UPDATE_TEMPLATE', id: occ.templateId, patch })
    else dispatch({ type: 'UPDATE_OCCURRENCE', id: occ.occId, patch })
  }

  const saveName = () => {
    if (nameDraft.trim()) updateMeta({ name: nameDraft.trim() })
    setEditingName(false)
  }

  return (
    <>
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
        <Section title="Class goals" sub="Shared objectives for this class — drag to reorder or nest into sub-goals, click to edit. Carries over each session until met.">
          <GoalTree
            goals={goalStore.classGoals}
            onAdd={(text) => dispatch({ type: 'ADD_GOAL', goalKey, text, date: today })}
            onToggle={(g, met) => dispatch({ type: 'SET_GOAL_MET', goalKey, goalId: g.id, met, date: today })}
            onDelete={(g) => dispatch({ type: 'DELETE_GOAL', goalKey, goalId: g.id })}
            onReorder={(next) => dispatch({ type: 'SET_CLASS_GOALS', goalKey, goals: next })}
            onEditText={(g, text) => dispatch({ type: 'EDIT_GOAL_TEXT', goalKey, goalId: g.id, text })}
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

        {/* Print every session's class notes for this class (with each session's date & time). */}
        <div className="spread wrap no-print" style={{ marginTop: 24, gap: 12 }}>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {noteSessions.length === 0
              ? 'No class notes written for this class yet.'
              : `${noteSessions.length} session${noteSessions.length === 1 ? '' : 's'} with class notes.`}
          </div>
          <button
            className="btn btn-sm"
            onClick={() =>
              printDocument(
                `Class Notes - ${occ.name} - ${nowOf(state).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`,
              )
            }
            disabled={noteSessions.length === 0}
            title={noteSessions.length === 0 ? 'No class notes to print yet' : 'Print all class notes for this class'}
          >
            🖨️ Print class notes
          </button>
        </div>
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

    {/* Print-only: a compiled document of this class's notes across every session. Rendered as a
        page-level sibling (outside the modal overlay) so the print layout isn't offset by it. */}
    <ClassNotesDocument occ={occ} sessions={noteSessions} studioName={state.config?.studioName} today={nowOf(state)} />
    </>
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

// Print-only compiled document: every session's class notes for this one class, in date order,
// each stamped with the session's date and scheduled time. Hidden on screen (only the class
// detail's contents show); `window.print()` reveals just this via the shared print-doc CSS.
function ClassNotesDocument({ occ, sessions, studioName, today }) {
  const studio = studioName || 'Orator Academy'
  return (
    <div className="print-doc notes-doc">
      <div className="print-only">
        <div className="ledger-doc-head">
          <div>
            <div className="ledger-doc-studio">{studio}</div>
            <h2 className="ledger-doc-title">Class notes — {occ.name}</h2>
          </div>
          <div className="ledger-doc-meta">
            Generated {today.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            <br />
            {sessions.length} session{sessions.length === 1 ? '' : 's'} with notes
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>No class notes recorded for this class.</p>
        ) : (
          <div className="stack" style={{ marginTop: 16 }}>
            {sessions.map((sn) => (
              <div className="notes-doc-entry" key={sn.occId}>
                <div className="notes-doc-meta">
                  {longDate(sn.date)}
                  {sn.startTime && ` · ${formatTimeRange(sn.startTime, sn.endTime)}`}
                  {sn.moved && ' · moved'}
                </div>
                <div className="notes-doc-body">{sn.notes}</div>
              </div>
            ))}
          </div>
        )}

        <div className="ledger-doc-foot">
          {studio} · class notes · {occ.name} — keep with the studio's physical records.
        </div>
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
  // Individual goals are global to the student — they follow them into every class. Stored order
  // is preserved (drag to reorder/nest), so no auto-sort here.
  const studentGoals = state.studentGoals[studentId] || []

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
          <div className="sub-label">Individual goal <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· follows this student into every class · drag to reorder or nest, click to edit</span></div>
          <GoalTree
            goals={studentGoals}
            onAdd={(text) => dispatch({ type: 'ADD_STUDENT_GOAL', studentId, text, date: sessionDate })}
            onToggle={(g, met) => dispatch({ type: 'SET_STUDENT_GOAL_MET', studentId, goalId: g.id, met, date: sessionDate })}
            onDelete={(g) => dispatch({ type: 'DELETE_STUDENT_GOAL', studentId, goalId: g.id })}
            onReorder={(next) => dispatch({ type: 'SET_STUDENT_GOALS', studentId, goals: next })}
            onEditText={(g, text) => dispatch({ type: 'EDIT_STUDENT_GOAL_TEXT', studentId, goalId: g.id, text })}
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
