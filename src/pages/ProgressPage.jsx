import React, { useMemo, useState } from 'react'
import { useStore, nowOf } from '../store.jsx'
import StarRating from '../components/StarRating.jsx'
import { METRICS } from '../constants.js'
import {
  studentEvaluations,
  averagedMetrics,
  attendanceSummary,
  studentNotes,
  activeGoals,
} from '../utils/progress.js'
import { studentName, studentById } from '../utils/helpers.js'
import Avatar from '../components/Avatar.jsx'
import { prettyDate } from '../utils/dates.js'

export default function ProgressPage() {
  const { state, dispatch } = useStore()
  const active = state.students.filter((s) => !s.archived)
  const [selected, setSelected] = useState(active[0]?.id || '')
  const [reqStudent, setReqStudent] = useState('')
  const [reqNote, setReqNote] = useState('')

  const openRequests = state.progressRequests.filter((r) => !r.resolved)

  const rows = useMemo(() => (selected ? studentEvaluations(state, selected, 6, nowOf(state)) : []), [state, selected])
  const avg = useMemo(() => averagedMetrics(rows), [rows])
  const attendance = useMemo(() => attendanceSummary(rows), [rows])
  const notes = useMemo(() => studentNotes(rows), [rows])
  const goals = useMemo(() => activeGoals(state), [state])

  const addRequest = () => {
    if (!reqStudent) return
    dispatch({ type: 'ADD_REQUEST', studentId: reqStudent, note: reqNote })
    setReqStudent('')
    setReqNote('')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Progress</div>
          <div className="page-sub">Progress reports, performance trends, and every active goal in one place.</div>
        </div>
      </div>

      {/* Requests widget — always at the top */}
      <div className="card card-pad" style={{ marginBottom: 22, borderColor: '#dfe2ee' }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 16 }}>
            📨 Progress report requests{' '}
            {openRequests.length > 0 && <span className="chip red">{openRequests.length} open</span>}
          </h3>
        </div>

        <div className="row wrap" style={{ gap: 10, marginBottom: openRequests.length ? 16 : 0 }}>
          <select className="select" style={{ maxWidth: 200 }} value={reqStudent} onChange={(e) => setReqStudent(e.target.value)}>
            <option value="">Request a report for…</option>
            {active.map((s) => (
              <option key={s.id} value={s.id}>
                {studentName(s)}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="Note (optional) — e.g. parent requested for conference"
            value={reqNote}
            onChange={(e) => setReqNote(e.target.value)}
          />
          <button className="btn btn-primary" onClick={addRequest} disabled={!reqStudent}>
            Add request
          </button>
        </div>

        {openRequests.length > 0 && (
          <div className="stack">
            {openRequests.map((r) => {
              const s = studentById(state, r.studentId)
              return (
                <div className="spread req-row" key={r.id}>
                  <div className="row">
                    <Avatar student={s} size="sm" />
                    <div>
                      <div style={{ fontWeight: 600 }}>{studentName(s)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Requested {prettyDate(r.requestedDate)}
                        {r.note ? ` · ${r.note}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => setSelected(r.studentId)}>
                      View report
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'RESOLVE_REQUEST', id: r.id, resolved: true })}>
                      ✓ Done
                    </button>
                    <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => dispatch({ type: 'DELETE_REQUEST', id: r.id })}>
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Report */}
      <div className="card card-pad" style={{ marginBottom: 22 }}>
        <div className="spread wrap" style={{ marginBottom: 16, gap: 12 }}>
          <h3 style={{ fontSize: 17 }}>Progress report</h3>
          <select className="select" style={{ maxWidth: 240 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select a student…</option>
            {active.map((s) => (
              <option key={s.id} value={s.id}>
                {studentName(s)}
              </option>
            ))}
          </select>
        </div>

        {!selected ? (
          <div className="empty">
            <div className="big">📈</div>
            <p>Select a student to see their 6-month progress report.</p>
          </div>
        ) : (
          <>
            <div className="report-grid">
              {/* Averaged metrics */}
              <div>
                <div className="sub-label">Averaged metrics · last 6 months</div>
                <div className="metrics-grid" style={{ marginTop: 8 }}>
                  {METRICS.map((m) => (
                    <div className="metric-row" key={m.key}>
                      <span className="metric-label">{m.label}</span>
                      <div className="row" style={{ gap: 8 }}>
                        <StarRating value={avg[m.key] || 0} readOnly size={16} />
                        <span className="muted" style={{ fontSize: 12, width: 26 }}>
                          {avg[m.key] != null ? avg[m.key].toFixed(1) : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attendance */}
              <div>
                <div className="sub-label">Attendance</div>
                {attendance.total === 0 ? (
                  <p className="muted" style={{ fontSize: 13 }}>No attendance recorded yet.</p>
                ) : (
                  <>
                    <div className="att-rate">
                      <div className="att-rate-num">{attendance.rate}%</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {attendance.present} of {attendance.total} sessions present
                      </div>
                    </div>
                    <div className="att-strip">
                      {attendance.records.map((r, i) => (
                        <span
                          key={i}
                          className={`att-dot ${r.status}`}
                          title={`${prettyDate(r.date)} — ${r.status}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="sub-label" style={{ marginTop: 22 }}>
              Notes · last 6 months ({notes.length})
            </div>
            {notes.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No presentation notes recorded yet.</p>
            ) : (
              <div className="stack" style={{ marginTop: 8 }}>
                {notes.map((n, i) => (
                  <div className="note-card" key={i}>
                    <div className="note-meta">
                      {prettyDate(n.date)} · {n.className}
                    </div>
                    <div>{n.note}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* All active goals */}
      <div className="report-grid">
        <div className="card card-pad">
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Ongoing class goals</h3>
          <GoalOverview list={goals.classGoals} />
        </div>
        <div className="card card-pad">
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Ongoing individual goals</h3>
          <GoalOverview list={goals.studentGoals} showStudent state={state} />
        </div>
      </div>
    </div>
  )
}

function GoalOverview({ list, showStudent, state }) {
  if (list.length === 0) return <p className="muted" style={{ fontSize: 13 }}>No goals yet.</p>
  return (
    <div className="stack">
      {list.map((g) => (
        <div key={g.id} className={`goal-item${g.met ? ' done' : ''}`}>
          <div className="goal-main">
            <div className="goal-text">{g.text}</div>
            <div className="goal-meta">
              {showStudent ? `${studentName(studentById(state, g.studentId))} · ` : ''}
              {g.className ? `${g.className} · ` : ''}set {prettyDate(g.createdDate)}
            </div>
          </div>
          {g.met && <span className="chip green">✓</span>}
        </div>
      ))}
    </div>
  )
}
