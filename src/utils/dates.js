import { BREAK_START, BREAK_END, DAYS_SHORT } from '../constants.js'

// ── Date helpers (all dates handled as local-time, ISO yyyy-mm-dd keys) ──────

export function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Week starts on Sunday (US calendar convention)
export function weekStart(d) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() - r.getDay())
  return r
}

export function sameDay(a, b) {
  return isoDate(a) === isoDate(b)
}

// Returns the date for a given day-of-week (0–6) within the week of `start`
export function dateForDayInWeek(start, dayOfWeek) {
  return addDays(weekStart(start), dayOfWeek)
}

// Summer break test — true when classes are not allowed on this date
export function isInBreak(d) {
  const year = d.getFullYear()
  const start = new Date(year, BREAK_START.month, BREAK_START.day)
  const end = new Date(year, BREAK_END.month, BREAK_END.day)
  return d >= start && d < end
}

// First date (on/after `from`) that falls on `dayOfWeek` and is not in the break window.
// Used to jump the calendar to a new recurring class's first real session.
export function firstOccurrenceOnOrAfter(dayOfWeek, from = new Date()) {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 420; i++) {
    if (d.getDay() === dayOfWeek && !isInBreak(d)) return isoDate(d)
    d.setDate(d.getDate() + 1)
  }
  return isoDate(d)
}

// Monday of the week containing `d` (summer-lesson weeks run Mon–Fri).
export function mondayOf(d) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const day = r.getDay()
  r.setDate(r.getDate() + (day === 0 ? 1 : 1 - day)) // Sunday snaps forward to Monday
  return r
}

// The five ISO dates (Mon–Fri) of the summer-lesson week containing `d`.
export function summerWeekDates(d) {
  const mon = mondayOf(d)
  return Array.from({ length: 5 }, (_, i) => isoDate(addDays(mon, i)))
}

// "18:00" -> minutes since midnight
export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// "18:00" -> "6:00 PM"
export function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`
}

export function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function prettyDate(d) {
  const date = typeof d === 'string' ? parseISO(d) : d
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function shortDate(d) {
  const date = typeof d === 'string' ? parseISO(d) : d
  return `${DAYS_SHORT[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`
}

// "Wednesday, June 10, 2026" — spelled out for the rows of a printed document.
export function longDate(d) {
  const date = typeof d === 'string' ? parseISO(d) : d
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// All dates a given weekday falls on within a calendar month (for billing counts)
export function weekdayDatesInMonth(year, month, dayOfWeek) {
  const dates = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    if (d.getDay() === dayOfWeek && !isInBreak(d)) dates.push(isoDate(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}
