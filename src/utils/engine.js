import { isoDate, dateForDayInWeek, isInBreak, addDays, weekStart, parseISO } from './dates.js'

// occId uniquely identifies a dated session for storing notes/metrics/attendance.
// Recurring sessions: `${templateId}::${isoDate}`. Standalone (makeup/moved): the occurrence's own id.
export function occIdFor(templateId, iso) {
  return `${templateId}::${iso}`
}

// Goals carry across sessions, so they hang off the recurring template (or the makeup's own id).
export function goalKeyFor(occ) {
  return occ.templateId || occ.id
}

const EMPTY_DATA = { tempStudentIds: [], removedStudentIds: [], classNotes: '', evaluations: {}, attendance: {} }

function buildFromTemplate(state, template, date) {
  const iso = isoDate(date)
  const occId = occIdFor(template.id, iso)
  const data = { ...EMPTY_DATA, ...(state.occData[occId] || {}) }
  const removed = new Set(data.removedStudentIds || [])
  const permanent = (template.permanentStudentIds || []).filter((id) => !removed.has(id))
  return {
    occId,
    templateId: template.id,
    kind: 'recurring',
    type: template.type,
    name: template.name,
    date: iso,
    dayOfWeek: template.dayOfWeek,
    startTime: template.startTime,
    endTime: template.endTime,
    recurring: true,
    permanentStudentIds: permanent,
    tempStudentIds: data.tempStudentIds || [],
    studentIds: [...permanent, ...(data.tempStudentIds || [])],
    data,
  }
}

function buildFromStandalone(state, occ) {
  const data = { ...EMPTY_DATA, ...(state.occData[occ.id] || {}) }
  const permanent = occ.studentIds || []
  return {
    occId: occ.id,
    templateId: occ.templateId || null,
    kind: occ.kind, // 'makeup' | 'moved'
    type: occ.type,
    name: occ.name,
    date: occ.date,
    dayOfWeek: parseISO(occ.date).getDay(),
    startTime: occ.startTime,
    endTime: occ.endTime,
    recurring: false,
    originDate: occ.originDate || null,
    permanentStudentIds: permanent,
    tempStudentIds: data.tempStudentIds || [],
    studentIds: [...permanent, ...(data.tempStudentIds || [])],
    data,
  }
}

// All sessions visible in the week containing `anchorDate`
export function getOccurrencesForWeek(state, anchorDate) {
  const start = weekStart(anchorDate)
  const end = addDays(start, 7)
  const out = []

  for (const template of state.templates) {
    const date = dateForDayInWeek(start, template.dayOfWeek)
    if (isInBreak(date)) continue
    const occId = occIdFor(template.id, isoDate(date))
    if (state.suppressions[occId]) continue // moved away / canceled this week
    out.push(buildFromTemplate(state, template, date))
  }

  for (const occ of state.occurrences) {
    const d = parseISO(occ.date)
    if (d >= start && d < end) out.push(buildFromStandalone(state, occ))
  }

  return out.sort((a, b) => a.startTime.localeCompare(b.startTime))
}

// Resolve a single occurrence for the detail view by its occId.
export function getOccurrenceById(state, occId, isoHint) {
  // standalone?
  const standalone = state.occurrences.find((o) => o.id === occId)
  if (standalone) return buildFromStandalone(state, standalone)
  // recurring: occId is `${templateId}::${iso}`
  const [templateId, iso] = occId.split('::')
  const template = state.templates.find((t) => t.id === templateId)
  if (!template) return null
  return buildFromTemplate(state, template, parseISO(iso || isoHint))
}

// Goal carry-over: open goals (not yet met) show first; completed goals sink to the bottom.
export function orderedGoals(list = []) {
  const open = list.filter((g) => !g.met)
  const done = list.filter((g) => g.met)
  return [...open, ...done]
}
