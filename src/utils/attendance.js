import { weekStart, addDays, isoDate, parseISO } from './dates.js'
import { getOccurrencesForWeek } from './engine.js'

// Walk every week from the studio's earliest activity up to today, collecting every session a
// student was enrolled in, and tally the ones they were marked PRESENT for — split by role:
//   normal  = a class they're a permanent member of (group / recurring 1-on-1)
//   temp    = a session they dropped into as a temporary student
//   makeup  = a 1-on-1 makeup session
// Returns { total, breakdown:{normal,temp,makeup}, sessions:[{date,startTime,name,type,role,attendance}] }.
export function attendanceSummary(state, studentId, today = new Date()) {
  let earliest = null
  const consider = (iso) => {
    if (iso && (!earliest || iso < earliest)) earliest = iso
  }
  state.templates.forEach((t) => consider(t.createdAt ? isoDate(new Date(t.createdAt)) : null))
  state.occurrences.forEach((o) => consider(o.date))
  consider(state.students.find((s) => s.id === studentId)?.createdAt)
  const startDate = earliest ? parseISO(earliest) : addDays(today, -550)

  const todayIso = isoDate(today)
  const sessions = []
  let cursor = weekStart(startDate)
  const endWeek = weekStart(addDays(today, 7))
  let guard = 0
  while (cursor < endWeek && guard < 260) {
    guard++
    for (const occ of getOccurrencesForWeek(state, cursor)) {
      if (occ.date > todayIso) continue
      if (!occ.studentIds.includes(studentId)) continue
      const isTemp = (occ.tempStudentIds || []).includes(studentId)
      const role =
        occ.kind === 'makeup' || occ.type === 'makeup'
          ? 'makeup'
          : occ.type === 'summer'
            ? 'summer'
            : isTemp
              ? 'temp'
              : 'normal'
      sessions.push({
        occId: occ.occId,
        date: occ.date,
        startTime: occ.startTime,
        name: occ.name,
        type: occ.type,
        role,
        attendance: occ.data?.attendance?.[studentId] || null,
      })
    }
    cursor = addDays(cursor, 7)
  }

  sessions.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
  const present = sessions.filter((s) => s.attendance === 'present')
  const breakdown = { normal: 0, temp: 0, makeup: 0, summer: 0 }
  present.forEach((s) => {
    breakdown[s.role] = (breakdown[s.role] || 0) + 1
  })

  return { total: present.length, breakdown, sessions }
}
