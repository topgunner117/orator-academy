import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import Avatar from './Avatar.jsx'
import { studentName } from '../utils/helpers.js'

// Searchable grid of student cards. `selectedIds` highlights cards; `onPick(id)` fires on click.
// Used everywhere a student is chosen (Payments, Reconcile, assign-payment), replacing dropdowns.
export default function StudentGrid({ selectedIds = [], onPick, emptyHint, autoFocus }) {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const active = state.students.filter((s) => !s.archived)
  const sel = new Set(selectedIds)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? active.filter((s) => studentName(s).toLowerCase().includes(needle)) : active
    return [...list].sort((a, b) => studentName(a).localeCompare(studentName(b)))
  }, [active, q])

  return (
    <div className="student-picker">
      <input
        className="input"
        placeholder="Search students…"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      {active.length === 0 ? (
        <div className="empty" style={{ padding: 24 }}>
          <p>{emptyHint || 'No students yet. Add students first.'}</p>
        </div>
      ) : (
        <div className="picker-grid">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`picker-card${sel.has(s.id) ? ' on' : ''}`}
              onClick={() => onPick(s.id)}
            >
              <Avatar student={s} size="sm" />
              <span className="picker-name">{studentName(s)}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="muted" style={{ fontSize: 13, padding: 10 }}>No match.</div>}
        </div>
      )}
    </div>
  )
}
