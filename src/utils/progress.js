import { METRICS } from '../constants.js'
import { parseISO, addDays } from './dates.js'

// Resolve the date + class name for a given occId, even if the class was later deleted.
function occInfo(state, occId) {
  if (occId.includes('::')) {
    const [templateId, iso] = occId.split('::')
    const t = state.templates.find((x) => x.id === templateId)
    return { date: iso, name: t ? t.name : 'Past class', templateId }
  }
  const occ = state.occurrences.find((o) => o.id === occId)
  if (occ) return { date: occ.date, name: occ.name, templateId: occ.templateId }
  return null // standalone deleted — date unknown
}

// Every evaluation recorded for a student within the window (default: last 6 months).
export function studentEvaluations(state, studentId, months = 6, today = new Date()) {
  const since = new Date(today)
  since.setMonth(since.getMonth() - months)
  const rows = []
  for (const [occId, data] of Object.entries(state.occData)) {
    const ev = data.evaluations?.[studentId]
    const att = data.attendance?.[studentId]
    if (!ev && !att) continue
    const info = occInfo(state, occId)
    if (!info) continue
    const d = parseISO(info.date)
    if (d < since) continue
    rows.push({
      occId,
      date: info.date,
      className: info.name,
      metrics: ev?.metrics || {},
      note: ev?.note || '',
      attendance: att || null,
    })
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

// Averaged metrics over the window.
export function averagedMetrics(rows) {
  const out = {}
  for (const m of METRICS) {
    const vals = rows.map((r) => r.metrics[m.key]).filter((v) => typeof v === 'number' && v > 0)
    out[m.key] = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null
  }
  return out
}

export function attendanceSummary(rows) {
  const records = rows.filter((r) => r.attendance).map((r) => ({ date: r.date, status: r.attendance }))
  const present = records.filter((r) => r.status === 'present').length
  const total = records.length
  const rate = total ? Math.round((present / total) * 100) : null
  return { records: records.sort((a, b) => a.date.localeCompare(b.date)), present, total, rate }
}

// Notes only, newest first.
export function studentNotes(rows) {
  return rows.filter((r) => r.note && r.note.trim()).map((r) => ({ date: r.date, className: r.className, note: r.note }))
}

// The set of goalKeys (class ids) a student is enrolled in — a permanent member of a recurring
// template, on a standalone session's roster, or a temporary drop-in on any session. Used to show
// a student only the class goals from the classes they actually attend.
export function classGoalKeysForStudent(state, studentId) {
  const keys = new Set()
  if (!studentId) return keys
  for (const t of state.templates) {
    if ((t.permanentStudentIds || []).includes(studentId)) keys.add(t.id)
  }
  for (const o of state.occurrences) {
    if ((o.studentIds || []).includes(studentId)) keys.add(o.id)
  }
  // Temporary drop-ins live in occData, keyed by occId. A recurring occId is `${templateId}::${iso}`,
  // so the class goal for that session hangs off the template; a standalone occId is its own key.
  for (const [occId, data] of Object.entries(state.occData || {})) {
    if ((data?.tempStudentIds || []).includes(studentId)) {
      keys.add(occId.includes('::') ? occId.split('::')[0] : occId)
    }
  }
  return keys
}

// All currently-active goals (for the Progress overview). Class goals come from live classes;
// individual goals are global to each (non-archived) student.
export function activeGoals(state) {
  const liveKeys = new Set([...state.templates.map((t) => t.id), ...state.occurrences.map((o) => o.id)])
  const classGoals = []
  const studentGoals = []
  const nameFor = (key) => {
    const t = state.templates.find((x) => x.id === key)
    if (t) return t.name
    const o = state.occurrences.find((x) => x.id === key)
    return o ? o.name : 'Class'
  }
  for (const [key, g] of Object.entries(state.goals)) {
    if (!liveKeys.has(key)) continue
    const className = nameFor(key)
    for (const item of g.classGoals || []) classGoals.push({ ...item, className, goalKey: key })
  }
  for (const [sid, list] of Object.entries(state.studentGoals || {})) {
    const student = state.students.find((s) => s.id === sid)
    if (!student || student.archived) continue
    for (const item of list) studentGoals.push({ ...item, studentId: sid })
  }
  const sortGoals = (a, b) => Number(a.met) - Number(b.met) || a.createdDate.localeCompare(b.createdDate)
  return { classGoals: classGoals.sort(sortGoals), studentGoals: studentGoals.sort(sortGoals) }
}
