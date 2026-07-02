import React, { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { occIdFor } from './utils/engine.js'
import { isoDate } from './utils/dates.js'
import { uid } from './utils/id.js'
import { DEFAULT_SMS_TEMPLATE } from './utils/sms.js'
import { fetchRemoteState, saveRemoteState } from './utils/api.js'

const STORAGE_KEY = 'orator-academy-v1'

// The app's "current" date — respects a spoofed date when set (Settings → simulate date).
export function nowOf(state) {
  return state?.spoofDate ? new Date(state.spoofDate + 'T12:00:00') : new Date()
}

// Saving is always permanent: the server (when reachable) is the source of truth and
// localStorage is the offline cache. (The old Test Mode / sessionStorage flow was removed
// once the app went live.)
const initialState = {
  lateFeeEnabled: false,
  lateFeeRate: 0.1, // 10% — editable in Settings
  classPrice: 40, // dollars per group session — editable in Settings
  chargeOverrides: {}, // `${studentId}::${templateId}::${ym}` -> overridden class count for that month
  spoofDate: null, // 'YYYY-MM-DD' to simulate "today", or null for the real date
  students: [],
  templates: [], // recurring group / 1-on-1 classes
  occurrences: [], // standalone sessions: makeups + drag-moved sessions
  suppressions: {}, // `${templateId}::${iso}` -> 'moved' | 'canceled' (hide template that week)
  occData: {}, // occId -> { tempStudentIds, removedStudentIds, classNotes, evaluations, attendance }
  goals: {}, // goalKey -> { classGoals:[] }  (class-wide goals, per class)
  studentGoals: {}, // studentId -> [ goal ]  (individual goals — follow the student everywhere)
  payments: [], // { id, studentId, amount, dateReceived, ts, source?, method? } (source:'email' = auto-applied)
  adjustments: [], // { id, studentId, monthKey, amount, reason, date } — credit that reduces a month's bill
  unassignedPayments: [], // email payments with no student in the memo → Notifications (assign to a student)
  summerPayments: [], // { id, amount, dateReceived, ts, note, method } — summer-lessons folder (no student)
  progressRequests: [], // { id, studentId, note, requestedDate, resolved }
  config: {
    // Studio-level integration config (synced to the backend; holds NO secrets).
    studioName: 'Orator Academy',
    paymentHandles: { venmo: '', zelle: '', paypal: '' }, // where parents send money
    smsTemplate: DEFAULT_SMS_TEMPLATE,
  },
}

function ensureData(occData, occId) {
  return (
    occData[occId] || {
      tempStudentIds: [],
      removedStudentIds: [],
      classNotes: '',
      evaluations: {},
      attendance: {},
    }
  )
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return { ...state, ...action.state }

    case 'TOGGLE_LATE_FEE':
      return { ...state, lateFeeEnabled: action.value }

    case 'SET_LATE_FEE_RATE':
      return { ...state, lateFeeRate: Math.max(0, action.value) }

    case 'SET_CLASS_PRICE':
      return { ...state, classPrice: Math.max(0, action.value) }

    case 'SET_CHARGE_COUNT': {
      const next = { ...state.chargeOverrides }
      if (action.count == null || action.count === '') delete next[action.key]
      else next[action.key] = Math.max(0, Math.round(action.count))
      return { ...state, chargeOverrides: next }
    }

    case 'SET_SPOOF_DATE':
      return { ...state, spoofDate: action.value || null }

    // ── Students ──────────────────────────────────────────────────────────
    case 'ADD_STUDENT': {
      const phones = (action.parentPhones || (action.parentPhone ? [action.parentPhone] : []))
        .map((p) => (p || '').trim())
        .filter(Boolean)
      return {
        ...state,
        students: [
          ...state.students,
          {
            id: uid(),
            firstName: action.firstName.trim(),
            lastName: (action.lastName || '').trim(),
            parentPhones: phones,
            parentPhone: phones[0] || '', // legacy mirror (first = primary)
            createdAt: isoDate(new Date()),
            archived: false,
          },
        ],
      }
    }

    case 'UPDATE_STUDENT':
      return {
        ...state,
        students: state.students.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      }

    case 'ARCHIVE_STUDENT':
      return {
        ...state,
        students: state.students.map((s) =>
          s.id === action.id ? { ...s, archived: true, archivedAt: isoDate(new Date()) } : s,
        ),
        // remove from permanent rosters but keep all historical data
        templates: state.templates.map((t) => ({
          ...t,
          permanentStudentIds: (t.permanentStudentIds || []).filter((id) => id !== action.id),
        })),
      }

    case 'RESTORE_STUDENT':
      return {
        ...state,
        students: state.students.map((s) =>
          s.id === action.id ? { ...s, archived: false, archivedAt: undefined } : s,
        ),
      }

    // ── Classes ───────────────────────────────────────────────────────────
    case 'ADD_TEMPLATE': // recurring group / 1-on-1
      return { ...state, templates: [...state.templates, { id: uid(), ...action.template }] }

    case 'ADD_MAKEUP': // standalone, non-recurring, single student
      return {
        ...state,
        occurrences: [...state.occurrences, { id: uid(), kind: 'makeup', templateId: null, ...action.occ }],
      }

    // ── Summer lessons: a Mon–Fri week of five separate daily sessions ──────
    // Each day is its own occurrence (own goals, notes, ratings, attendance), linked by weekId
    // so the roster and deletion can act on the whole week at once. Never billed.
    case 'ADD_SUMMER_WEEK':
      return {
        ...state,
        occurrences: [
          ...state.occurrences,
          ...action.dates.map((date) => ({
            id: uid(),
            kind: 'summer',
            type: 'summer',
            templateId: null,
            weekId: action.weekId,
            name: action.name,
            date,
            startTime: action.startTime,
            endTime: action.endTime,
            studentIds: [],
          })),
        ],
      }

    case 'ADD_SUMMER_WEEK_STUDENT': {
      // Enroll for every day of the week — and clear any earlier single-day removals so the
      // student really appears on all five days again.
      const weekOccIds = state.occurrences.filter((o) => o.weekId === action.weekId).map((o) => o.id)
      const occData = { ...state.occData }
      for (const id of weekOccIds) {
        const d = occData[id]
        if (d?.removedStudentIds?.includes(action.studentId)) {
          occData[id] = { ...d, removedStudentIds: d.removedStudentIds.filter((x) => x !== action.studentId) }
        }
      }
      return {
        ...state,
        occData,
        occurrences: state.occurrences.map((o) =>
          o.weekId === action.weekId
            ? { ...o, studentIds: [...new Set([...(o.studentIds || []), action.studentId])] }
            : o,
        ),
      }
    }

    case 'REMOVE_SUMMER_WEEK_STUDENT': // un-enroll from every day of the week
      return {
        ...state,
        occurrences: state.occurrences.map((o) =>
          o.weekId === action.weekId
            ? { ...o, studentIds: (o.studentIds || []).filter((id) => id !== action.studentId) }
            : o,
        ),
      }

    case 'DELETE_SUMMER_WEEK':
      return { ...state, occurrences: state.occurrences.filter((o) => o.weekId !== action.weekId) }

    case 'UPDATE_TEMPLATE':
      return {
        ...state,
        templates: state.templates.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      }

    case 'UPDATE_OCCURRENCE': // standalone occurrence patch
      return {
        ...state,
        occurrences: state.occurrences.map((o) => (o.id === action.id ? { ...o, ...action.patch } : o)),
      }

    case 'DELETE_TEMPLATE': // delete all recurring instances of a class
      return {
        ...state,
        templates: state.templates.filter((t) => t.id !== action.id),
      }

    case 'DELETE_OCCURRENCE': {
      // Delete just one session. For recurring, suppress that week. For standalone, remove it.
      if (action.standalone) {
        return { ...state, occurrences: state.occurrences.filter((o) => o.id !== action.occId) }
      }
      return { ...state, suppressions: { ...state.suppressions, [action.occId]: 'canceled' } }
    }

    // ── Roster (permanent on template; temporary on a single session) ───────
    case 'SET_PERMANENT_STUDENTS':
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.id === action.templateId ? { ...t, permanentStudentIds: action.studentIds } : t,
        ),
      }

    case 'ADD_PERMANENT_STUDENT':
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.id === action.templateId
            ? {
                ...t,
                permanentStudentIds: [...new Set([...(t.permanentStudentIds || []), action.studentId])],
              }
            : t,
        ),
      }

    case 'ADD_TEMP_STUDENT': {
      const data = ensureData(state.occData, action.occId)
      return {
        ...state,
        occData: {
          ...state.occData,
          [action.occId]: {
            ...data,
            tempStudentIds: [...new Set([...(data.tempStudentIds || []), action.studentId])],
          },
        },
      }
    }

    case 'REMOVE_STUDENT_FROM_SESSION': {
      // Remove a student from this single session only.
      const data = ensureData(state.occData, action.occId)
      const isTemp = (data.tempStudentIds || []).includes(action.studentId)
      return {
        ...state,
        occData: {
          ...state.occData,
          [action.occId]: isTemp
            ? { ...data, tempStudentIds: data.tempStudentIds.filter((id) => id !== action.studentId) }
            : {
                ...data,
                removedStudentIds: [...new Set([...(data.removedStudentIds || []), action.studentId])],
              },
        },
      }
    }

    case 'REMOVE_PERMANENT_STUDENT':
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.id === action.templateId
            ? { ...t, permanentStudentIds: (t.permanentStudentIds || []).filter((id) => id !== action.studentId) }
            : t,
        ),
      }

    // ── Drag-move a session to a new day/time for that week only ────────────
    case 'MOVE_OCCURRENCE': {
      const { occ, newDate, startTime, endTime } = action
      if (occ.kind === 'recurring') {
        // Suppress origin this week, create a standalone moved session carrying the same template.
        const moved = {
          id: uid(),
          kind: 'moved',
          templateId: occ.templateId,
          originDate: occ.date,
          type: occ.type,
          name: occ.name,
          date: newDate,
          startTime,
          endTime,
          studentIds: [...occ.permanentStudentIds],
        }
        // carry over any session data to the new occId
        const carried = state.occData[occ.occId]
        const nextOccData = { ...state.occData }
        if (carried) nextOccData[moved.id] = carried
        return {
          ...state,
          suppressions: { ...state.suppressions, [occ.occId]: 'moved' },
          occurrences: [...state.occurrences, moved],
          occData: nextOccData,
        }
      }
      // standalone session: just relocate it
      return {
        ...state,
        occurrences: state.occurrences.map((o) =>
          o.id === occ.occId ? { ...o, date: newDate, startTime, endTime } : o,
        ),
      }
    }

    // ── Session data: notes / metrics / attendance ──────────────────────────
    case 'SET_CLASS_NOTES': {
      const data = ensureData(state.occData, action.occId)
      return { ...state, occData: { ...state.occData, [action.occId]: { ...data, classNotes: action.value } } }
    }

    case 'SET_EVALUATION': {
      const data = ensureData(state.occData, action.occId)
      const evals = data.evaluations || {}
      const current = evals[action.studentId] || { metrics: {}, note: '' }
      const updated =
        action.metricKey != null
          ? { ...current, metrics: { ...current.metrics, [action.metricKey]: action.value } }
          : { ...current, note: action.value }
      return {
        ...state,
        occData: {
          ...state.occData,
          [action.occId]: { ...data, evaluations: { ...evals, [action.studentId]: updated } },
        },
      }
    }

    case 'SET_ATTENDANCE': {
      const data = ensureData(state.occData, action.occId)
      return {
        ...state,
        occData: {
          ...state.occData,
          [action.occId]: { ...data, attendance: { ...(data.attendance || {}), [action.studentId]: action.value } },
        },
      }
    }

    // ── Goals (carry across sessions) ───────────────────────────────────────
    case 'ADD_GOAL': {
      const g = state.goals[action.goalKey] || { classGoals: [], studentGoals: {} }
      const item = { id: uid(), text: action.text, createdDate: action.date, met: false, completedDate: null }
      if (action.studentId) {
        const list = g.studentGoals[action.studentId] || []
        return {
          ...state,
          goals: {
            ...state.goals,
            [action.goalKey]: { ...g, studentGoals: { ...g.studentGoals, [action.studentId]: [...list, item] } },
          },
        }
      }
      return {
        ...state,
        goals: { ...state.goals, [action.goalKey]: { ...g, classGoals: [...g.classGoals, item] } },
      }
    }

    case 'SET_GOAL_MET': {
      const g = state.goals[action.goalKey]
      if (!g) return state
      const apply = (list) =>
        list.map((it) =>
          it.id === action.goalId
            ? { ...it, met: action.met, completedDate: action.met ? action.date : null }
            : it,
        )
      if (action.studentId) {
        return {
          ...state,
          goals: {
            ...state.goals,
            [action.goalKey]: {
              ...g,
              studentGoals: { ...g.studentGoals, [action.studentId]: apply(g.studentGoals[action.studentId] || []) },
            },
          },
        }
      }
      return { ...state, goals: { ...state.goals, [action.goalKey]: { ...g, classGoals: apply(g.classGoals) } } }
    }

    case 'DELETE_GOAL': {
      const g = state.goals[action.goalKey]
      if (!g) return state
      const remove = (list) => list.filter((it) => it.id !== action.goalId)
      if (action.studentId) {
        return {
          ...state,
          goals: {
            ...state.goals,
            [action.goalKey]: {
              ...g,
              studentGoals: { ...g.studentGoals, [action.studentId]: remove(g.studentGoals[action.studentId] || []) },
            },
          },
        }
      }
      return { ...state, goals: { ...state.goals, [action.goalKey]: { ...g, classGoals: remove(g.classGoals) } } }
    }

    // ── Individual student goals (global — follow the student into any class) ──
    case 'ADD_STUDENT_GOAL': {
      const list = state.studentGoals[action.studentId] || []
      return {
        ...state,
        studentGoals: {
          ...state.studentGoals,
          [action.studentId]: [...list, { id: uid(), text: action.text, createdDate: action.date, met: false, completedDate: null }],
        },
      }
    }

    case 'SET_STUDENT_GOAL_MET': {
      const list = state.studentGoals[action.studentId] || []
      return {
        ...state,
        studentGoals: {
          ...state.studentGoals,
          [action.studentId]: list.map((it) =>
            it.id === action.goalId ? { ...it, met: action.met, completedDate: action.met ? action.date : null } : it,
          ),
        },
      }
    }

    case 'DELETE_STUDENT_GOAL': {
      const list = state.studentGoals[action.studentId] || []
      return {
        ...state,
        studentGoals: { ...state.studentGoals, [action.studentId]: list.filter((it) => it.id !== action.goalId) },
      }
    }

    // ── Payments (account-level ledger entries) ─────────────────────────────
    case 'ADD_PAYMENT':
      return {
        ...state,
        payments: [
          ...state.payments,
          {
            id: uid(),
            studentId: action.studentId,
            amount: action.amount,
            dateReceived: action.dateReceived,
            ts: new Date().toISOString(),
            method: action.method || 'cash', // 'cash' | 'check' | 'email' (auto) | 'assigned'
            source: action.source || 'manual',
          },
        ],
      }

    case 'DELETE_PAYMENT':
      return { ...state, payments: state.payments.filter((p) => p.id !== action.id) }

    // Merge in payments the server applied (e.g. auto-applied from a forwarded email) that
    // this browser doesn't have yet — append by id, never duplicating.
    case 'MERGE_PAYMENTS': {
      const have = new Set(state.payments.map((p) => p.id))
      const add = (action.payments || []).filter((p) => p && !have.has(p.id))
      return add.length ? { ...state, payments: [...state.payments, ...add] } : state
    }

    // ── Unassigned payments (no student named in the memo) → Notifications ────
    case 'MERGE_UNASSIGNED': {
      const have = new Set(state.unassignedPayments.map((u) => u.id))
      const add = (action.items || []).filter((u) => u && !have.has(u.id))
      return add.length ? { ...state, unassignedPayments: [...state.unassignedPayments, ...add] } : state
    }

    case 'ASSIGN_UNASSIGNED_PAYMENT': {
      const u = state.unassignedPayments.find((x) => x.id === action.id)
      if (!u || !action.studentIds?.length) return state
      const total = action.amount != null ? action.amount : u.amount // manual-review amount wins
      const share = Math.round((total / action.studentIds.length) * 100) / 100
      const created = action.studentIds.map((sid) => ({
        id: uid(),
        studentId: sid,
        amount: share,
        dateReceived: u.dateReceived,
        ts: new Date().toISOString(),
        source: 'email',
        method: 'assigned',
        emailRef: u.emailRef || null,
      }))
      return {
        ...state,
        payments: [...state.payments, ...created],
        unassignedPayments: state.unassignedPayments.filter((x) => x.id !== action.id),
      }
    }

    case 'ASSIGN_UNASSIGNED_TO_SUMMER': {
      const u = state.unassignedPayments.find((x) => x.id === action.id)
      if (!u) return state
      return {
        ...state,
        summerPayments: [
          ...state.summerPayments,
          {
            id: uid(),
            amount: action.amount != null ? action.amount : u.amount,
            dateReceived: u.dateReceived,
            ts: new Date().toISOString(),
            note: (u.memo || u.senderName || 'Summer lessons').trim(),
            method: 'email',
            emailRef: u.emailRef || null,
          },
        ],
        unassignedPayments: state.unassignedPayments.filter((x) => x.id !== action.id),
      }
    }

    case 'DISMISS_UNASSIGNED_PAYMENT':
      return { ...state, unassignedPayments: state.unassignedPayments.filter((x) => x.id !== action.id) }

    // ── Summer-lessons folder (studio-level, no student) ─────────────────────
    case 'ADD_SUMMER_PAYMENT':
      return {
        ...state,
        summerPayments: [
          ...state.summerPayments,
          {
            id: uid(),
            amount: action.amount,
            dateReceived: action.dateReceived || isoDate(new Date()),
            ts: new Date().toISOString(),
            note: (action.note || '').trim(),
            method: action.method || 'cash',
          },
        ],
      }

    case 'DELETE_SUMMER_PAYMENT':
      return { ...state, summerPayments: state.summerPayments.filter((p) => p.id !== action.id) }

    // ── Studio config (payment handles, SMS template) ───────────────────────
    case 'SET_CONFIG':
      return {
        ...state,
        config: {
          ...state.config,
          ...action.patch,
          paymentHandles: { ...(state.config?.paymentHandles || {}), ...(action.patch.paymentHandles || {}) },
        },
      }

    // ── Billing credits (account-level reductions) ──────────────────────────
    case 'ADD_ADJUSTMENT':
      return {
        ...state,
        adjustments: [
          ...state.adjustments,
          {
            id: uid(),
            studentId: action.studentId,
            amount: action.amount,
            reason: (action.reason || '').trim(),
            date: action.date || isoDate(new Date()),
            ts: new Date().toISOString(),
          },
        ],
      }

    case 'DELETE_ADJUSTMENT':
      return { ...state, adjustments: state.adjustments.filter((a) => a.id !== action.id) }

    // ── Progress report requests ────────────────────────────────────────────
    case 'ADD_REQUEST':
      return {
        ...state,
        progressRequests: [
          ...state.progressRequests,
          { id: uid(), studentId: action.studentId, note: action.note || '', requestedDate: isoDate(new Date()), resolved: false },
        ],
      }

    case 'RESOLVE_REQUEST':
      return {
        ...state,
        progressRequests: state.progressRequests.map((r) =>
          r.id === action.id ? { ...r, resolved: action.resolved } : r,
        ),
      }

    case 'DELETE_REQUEST':
      return { ...state, progressRequests: state.progressRequests.filter((r) => r.id !== action.id) }

    // ── Settings: reset the schedule, keep all students + their data ─────────
    // Deletes classes (templates / sessions) but preserves metrics, notes, goals
    // and payment history so progress reports survive the summer reset.
    case 'RESET_CLASSES':
      return {
        ...state,
        templates: [],
        occurrences: [],
        suppressions: {},
      }

    default:
      return state
  }
}

const StoreContext = createContext(null)

function read(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    const local = read(localStorage)
    if (local) return { ...init, ...local }
    // Migrate any leftover sessionStorage cache from the old Test Mode flow.
    const session = read(sessionStorage)
    if (session) return { ...init, ...session }
    return init
  })

  // Backend sync. When the server is reachable it becomes the source of truth: load on boot,
  // and write the whole snapshot back (debounced) on every change. If it's unreachable the app
  // falls back to browser storage exactly as before, so it always works offline / without a server.
  const [synced, setSynced] = useState(false)
  const versionRef = useRef(0)
  const stateRef = useRef(state)
  const skipSaveRef = useRef(false)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { state: remote, version } = await fetchRemoteState()
        if (cancelled) return
        versionRef.current = version || 0
        if (remote && Object.keys(remote).length > 0) {
          skipSaveRef.current = true // we just loaded it; don't immediately echo it back
          dispatch({ type: 'LOAD', state: remote })
        } else {
          const saved = await saveRemoteState(stateRef.current, versionRef.current) // seed an empty server
          if (!cancelled) versionRef.current = saved.version
        }
        if (!cancelled) setSynced(true)
      } catch {
        if (!cancelled) setSynced(false) // backend down → local-only mode (unchanged behavior)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // When the tab regains focus, pull in any payments the server applied while we were away
  // (e.g. a forwarded email auto-applied to a student's ledger). Additive only — never clobbers
  // local edits. This is what makes an already-open ledger reflect auto-applied payments.
  useEffect(() => {
    if (!synced) return
    const refresh = async () => {
      try {
        const { state: remote, version } = await fetchRemoteState()
        if (version >= versionRef.current) versionRef.current = version
        const localIds = new Set((stateRef.current.payments || []).map((p) => p.id))
        const extra = (remote?.payments || []).filter((p) => p.source === 'email' && !localIds.has(p.id))
        const unIds = new Set((stateRef.current.unassignedPayments || []).map((u) => u.id))
        const newUn = (remote?.unassignedPayments || []).filter((u) => !unIds.has(u.id))
        if (extra.length || newUn.length) {
          skipSaveRef.current = true
          if (extra.length) dispatch({ type: 'MERGE_PAYMENTS', payments: extra })
          if (newUn.length) dispatch({ type: 'MERGE_UNASSIGNED', items: newUn })
        }
      } catch {
        /* offline — ignore */
      }
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [synced])

  useEffect(() => {
    // Local cache/fallback — kept even when synced, so a reload works if the backend is briefly down.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* storage full / unavailable — ignore */
    }

    if (!synced) return
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await saveRemoteState(stateRef.current, versionRef.current)
        versionRef.current = res.version
        // Adopt anything the server merged in (auto-applied payments, or unassigned payments the
        // poller queued while we were editing).
        const localIds = new Set((stateRef.current.payments || []).map((p) => p.id))
        const extra = (res.state?.payments || []).filter((p) => !localIds.has(p.id))
        const unIds = new Set((stateRef.current.unassignedPayments || []).map((u) => u.id))
        const newUn = (res.state?.unassignedPayments || []).filter((u) => !unIds.has(u.id))
        if (extra.length || newUn.length) {
          skipSaveRef.current = true
          if (extra.length) dispatch({ type: 'MERGE_PAYMENTS', payments: extra })
          if (newUn.length) dispatch({ type: 'MERGE_UNASSIGNED', items: newUn })
        }
      } catch {
        /* transient — local cache already written above */
      }
    }, 800)
    return () => clearTimeout(t)
  }, [state, synced])

  return <StoreContext.Provider value={{ state, dispatch, synced }}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export { occIdFor }
