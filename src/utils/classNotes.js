// Every session of ONE class that has class notes written on it, oldest first.
//
// Which sessions belong to a class depends on how that class is stored:
//   • summer week — the five daily occurrences sharing a weekId
//   • recurring   — every `${templateId}::${iso}` key in occData, plus any session of the class
//                   that was dragged to another day (a standalone occurrence carrying templateId)
//   • one-off     — just itself (a makeup)
//
// Moving a session copies its notes onto the NEW occurrence's id but leaves the original
// `${templateId}::${iso}` key behind in occData, so suppressed weeks are skipped — otherwise a
// moved session's notes would appear twice in the printout (once at the origin slot, once where
// it was moved to). A canceled week is skipped for the same reason: it didn't happen.
export function classNotesHistory(state, occ) {
  const rows = []
  const add = (occId, meta) => {
    const notes = (state.occData?.[occId]?.classNotes || '').trim()
    if (notes) rows.push({ occId, notes, ...meta })
  }

  if (occ.weekId) {
    for (const o of state.occurrences) {
      if (o.weekId === occ.weekId) add(o.id, { date: o.date, startTime: o.startTime, endTime: o.endTime })
    }
  } else if (occ.templateId) {
    // The class's regular weekly slot. Times come from the template, which is the only record of
    // them — a template still exists here because the detail view resolved this occurrence.
    const t = state.templates.find((x) => x.id === occ.templateId)
    for (const key of Object.keys(state.occData || {})) {
      if (!key.startsWith(`${occ.templateId}::`)) continue
      if (state.suppressions?.[key]) continue // moved away or canceled that week
      add(key, {
        date: key.split('::')[1],
        startTime: t?.startTime || occ.startTime,
        endTime: t?.endTime || occ.endTime,
      })
    }
    // Sessions of this class that were dragged to a different day/time.
    for (const o of state.occurrences) {
      if (o.templateId !== occ.templateId) continue
      add(o.id, { date: o.date, startTime: o.startTime, endTime: o.endTime, moved: o.kind === 'moved' })
    }
  } else {
    add(occ.occId, { date: occ.date, startTime: occ.startTime, endTime: occ.endTime })
  }

  return rows.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
}
