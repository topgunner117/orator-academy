import React, { useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import Modal from '../components/Modal.jsx'
import Avatar from '../components/Avatar.jsx'
import { studentName, readImageScaled } from '../utils/helpers.js'

export default function StudentsPage() {
  const { state, dispatch } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [showArchive, setShowArchive] = useState(false)

  const active = state.students.filter((s) => !s.archived)
  const archived = state.students.filter((s) => s.archived)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Students</div>
          <div className="page-sub">Add or remove students. They can then be enrolled in classes.</div>
        </div>
        <div className="row">
          {archived.length > 0 && (
            <button className="btn" onClick={() => setShowArchive(true)}>
              🗄️ Archive ({archived.length})
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            ＋ Add student
          </button>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="big">👥</div>
            <h3>No students yet</h3>
            <p>Add your first student to start enrolling them in classes.</p>
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setShowAdd(true)}>
              ＋ Add student
            </button>
          </div>
        </div>
      ) : (
        <div className="student-grid">
          {active.map((s) => (
            <StudentCard key={s.id} student={s} />
          ))}
        </div>
      )}

      {showAdd && <AddStudentModal onClose={() => setShowAdd(false)} />}
      {showArchive && (
        <Modal title="Archived students" onClose={() => setShowArchive(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Archived students keep all their history. Restore one to enroll them again.
          </p>
          <div className="stack">
            {archived.map((s) => (
              <div className="spread roster-row" key={s.id}>
                <div className="row">
                  <Avatar student={s} size="sm" />
                  <div>
                    <div style={{ fontWeight: 600 }}>{studentName(s)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Archived {s.archivedAt}
                    </div>
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => dispatch({ type: 'RESTORE_STUDENT', id: s.id })}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function classCount(state, studentId) {
  return state.templates.filter((t) => (t.permanentStudentIds || []).includes(studentId)).length
}

function StudentCard({ student }) {
  const { state, dispatch } = useStore()
  const fileRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const count = classCount(state, student.id)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    try {
      const image = await readImageScaled(file)
      dispatch({ type: 'UPDATE_STUDENT', id: student.id, patch: { image } })
    } catch {
      /* ignore unreadable images */
    }
  }

  return (
    <div className="student-card card">
      <div className="avatar-wrap" onClick={() => fileRef.current?.click()} title="Add / change photo">
        <Avatar student={student} />
        <div className="avatar-cam">{student.image ? '✎' : '＋'}</div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      <div className="student-meta">
        <button className="student-name student-name-btn" onClick={() => setEditing(true)} title="Edit student">
          {studentName(student)}
        </button>
        <div className="muted" style={{ fontSize: 12 }}>
          Enrolled {count} {count === 1 ? 'class' : 'classes'}
        </div>
        <div className="muted student-phone" style={{ fontSize: 11.5 }}>
          {student.parentPhone ? `📱 ${student.parentPhone}` : 'No parent phone'}
        </div>
      </div>
      {editing && <EditStudentModal student={student} onClose={() => setEditing(false)} />}
      {student.image && (
        <button
          className="photo-remove"
          title="Remove photo"
          onClick={() => dispatch({ type: 'UPDATE_STUDENT', id: student.id, patch: { image: null } })}
        >
          Remove photo
        </button>
      )}
      <button
        className="archive-x"
        title="Archive student"
        onClick={() => {
          if (confirm(`Archive ${studentName(student)}? Their data is kept in the archive.`))
            dispatch({ type: 'ARCHIVE_STUDENT', id: student.id })
        }}
      >
        ✕
      </button>
    </div>
  )
}

function AddStudentModal({ onClose }) {
  const { dispatch } = useStore()
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [phone, setPhone] = useState('')

  const save = () => {
    if (!first.trim()) return
    dispatch({ type: 'ADD_STUDENT', firstName: first, lastName: last, parentPhone: phone })
    onClose()
  }

  return (
    <Modal
      title="Add student"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!first.trim()}>
            Add student
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label className="label">First name</label>
          <input
            className="input"
            autoFocus
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Jordan"
          />
        </div>
        <div className="field">
          <label className="label">
            Last name <span className="muted">(optional)</span>
          </label>
          <input
            className="input"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Reyes"
          />
        </div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label className="label">
          Parent phone <span className="muted">(optional — for payment-reminder texts)</span>
        </label>
        <input
          className="input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="(555) 123-4567"
        />
      </div>
    </Modal>
  )
}

function EditStudentModal({ student, onClose }) {
  const { dispatch } = useStore()
  const [first, setFirst] = useState(student.firstName || '')
  const [last, setLast] = useState(student.lastName || '')
  const [phone, setPhone] = useState(student.parentPhone || '')

  const save = () => {
    if (!first.trim()) return
    dispatch({
      type: 'UPDATE_STUDENT',
      id: student.id,
      patch: { firstName: first.trim(), lastName: last.trim(), parentPhone: phone.trim() },
    })
    onClose()
  }

  return (
    <Modal
      title="Edit student"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!first.trim()}>
            Save changes
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label className="label">First name</label>
          <input className="input" autoFocus value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">
            Last name <span className="muted">(optional)</span>
          </label>
          <input className="input" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label className="label">
          Parent phone <span className="muted">(for payment-reminder texts)</span>
        </label>
        <input
          className="input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="(555) 123-4567"
        />
      </div>
    </Modal>
  )
}
