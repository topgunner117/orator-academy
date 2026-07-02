import React, { useMemo, useRef, useState } from 'react'
import { useStore, nowOf } from '../store.jsx'
import { getOccurrencesForWeek } from '../utils/engine.js'
import {
  weekStart,
  addDays,
  isoDate,
  parseISO,
  dateForDayInWeek,
  isInBreak,
  formatTime,
  formatTimeRange,
  timeToMinutes,
  minutesToTime,
  sameDay,
} from '../utils/dates.js'
import { GRID_START_HOUR, GRID_END_HOUR, HOUR_HEIGHT, DAYS, DAYS_SHORT, CLASS_TYPES } from '../constants.js'
import { studentName, studentById } from '../utils/helpers.js'
import Avatar from '../components/Avatar.jsx'
import CreateClassModal from '../components/modals/CreateClassModal.jsx'
import AddStudentsModal from '../components/modals/AddStudentsModal.jsx'
import ClassDetailModal from '../components/modals/ClassDetailModal.jsx'
import MoveClassModal from '../components/modals/MoveClassModal.jsx'
import DeleteClassModal from '../components/modals/DeleteClassModal.jsx'

const HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => GRID_START_HOUR + i)
const GRID_START_MIN = GRID_START_HOUR * 60

export default function SchedulePage() {
  const { state } = useStore()
  const [anchor, setAnchor] = useState(() => weekStart(nowOf(state)))
  const [create, setCreate] = useState(null) // { defaultDate?, defaultDayOfWeek?, defaultType? }
  const [promptStudents, setPromptStudents] = useState(null) // AddStudentsModal target after creation
  const [detailOccId, setDetailOccId] = useState(null)
  const [moveProposal, setMoveProposal] = useState(null)
  const [deleteOcc, setDeleteOcc] = useState(null)
  const [navDir, setNavDir] = useState(0)
  const dragOcc = useRef(null)

  const go = (delta) => {
    setNavDir(delta)
    setAnchor((a) => addDays(a, delta * 7))
  }
  const goToday = () => {
    const target = weekStart(nowOf(state))
    const cur = weekStart(anchor)
    setNavDir(target < cur ? -1 : target > cur ? 1 : 0)
    setAnchor(target)
  }

  const occurrences = useMemo(() => getOccurrencesForWeek(state, anchor), [state, anchor])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)), [anchor])
  const today = nowOf(state)

  const weekLabel = `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(
    undefined,
    { month: 'short', day: 'numeric', year: 'numeric' },
  )}`

  const wholeWeekBreak = days.every((d) => isInBreak(d))

  const occByDay = (dow) => occurrences.filter((o) => new Date(o.date + 'T00:00').getDay() === dow)

  const onDrop = (e, day) => {
    e.preventDefault()
    const occ = dragOcc.current
    if (!occ) return
    const col = e.currentTarget.getBoundingClientRect()
    const relY = e.clientY - col.top
    let startMin = GRID_START_MIN + Math.round(((relY / HOUR_HEIGHT) * 60) / 15) * 15
    const duration = timeToMinutes(occ.endTime) - timeToMinutes(occ.startTime)
    startMin = Math.max(GRID_START_MIN, Math.min(startMin, GRID_END_HOUR * 60 - duration))
    setMoveProposal({
      occ,
      newDate: isoDate(day),
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(startMin + duration),
    })
    dragOcc.current = null
  }

  const slotClick = (day, hour) => {
    // During the break, a slot click starts a Summer lessons week instead of a regular class.
    if (isInBreak(day)) {
      setCreate({ defaultDate: isoDate(day), defaultHour: hour, defaultType: 'summer' })
      return
    }
    setCreate({ defaultDayOfWeek: day.getDay(), defaultDate: isoDate(day), defaultHour: hour })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Schedule</div>
          <div className="page-sub">Weekly class calendar. Click a slot to add a class, drag a class to reschedule it.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreate({})}>
          ＋ New class
        </button>
      </div>

      <div className="cal-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" onClick={() => go(-1)}>
            ‹
          </button>
          <button className="btn btn-sm" onClick={goToday}>
            Today
          </button>
          <button className="icon-btn" onClick={() => go(1)}>
            ›
          </button>
        </div>
        <div className="week-label">{weekLabel}</div>
        <div className="row" style={{ gap: 14, fontSize: 12, color: 'var(--text-soft)' }}>
          <span className="legend"><i className="dot group" /> Group</span>
          <span className="legend"><i className="dot oneonone" /> 1-on-1</span>
          <span className="legend"><i className="dot makeup" /> Makeup</span>
          <span className="legend"><i className="dot summer" /> Summer</span>
        </div>
      </div>

      {wholeWeekBreak && (
        <div className="break-banner">
          ☀️ Summer break — regular classes pause between June 18 and the start of October. Click any slot (or ＋ New
          class → Summer lessons) to add a Mon–Fri summer week.
        </div>
      )}

      <div className="cal card">
       <div
         className={`cal-switch ${navDir < 0 ? 'from-left' : navDir > 0 ? 'from-right' : 'fade'}`}
         key={isoDate(weekStart(anchor))}
       >
        {/* Day headers */}
        <div className="cal-head">
          <div className="cal-gutter-head" />
          {days.map((d, i) => (
            <div key={i} className={`cal-day-head${sameDay(d, today) ? ' is-today' : ''}`}>
              <div className="dow">{DAYS_SHORT[d.getDay()]}</div>
              <div className="dom">{d.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="cal-body">
          <div className="cal-gutter">
            {HOURS.map((h) => (
              <div key={h} className="hour-label" style={{ height: HOUR_HEIGHT }}>
                {formatTime(`${String(h).padStart(2, '0')}:00`)}
              </div>
            ))}
          </div>

          {days.map((day, di) => {
            const broken = isInBreak(day)
            return (
              <div
                key={di}
                className={`cal-col${broken ? ' broken' : ''}${sameDay(day, today) ? ' today-col' : ''}`}
                style={{ height: HOURS.length * HOUR_HEIGHT }}
                onDragOver={(e) => (!broken || dragOcc.current?.type === 'summer') && e.preventDefault()}
                onDrop={(e) => (!broken || dragOcc.current?.type === 'summer') && onDrop(e, day)}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="slot"
                    style={{ height: HOUR_HEIGHT }}
                    onClick={() => slotClick(day, h)}
                  />
                ))}

                {broken && <div className="col-break">☀️</div>}

                {/* Summer-lesson days are the only sessions that exist inside the break window. */}
                {occByDay(day.getDay()).map((occ) => (
                  <ClassBlock
                    key={occ.occId}
                    occ={occ}
                    onOpen={() => setDetailOccId(occ.occId)}
                    onDragStart={() => (dragOcc.current = occ)}
                  />
                ))}
              </div>
            )
          })}
        </div>
       </div>
      </div>

      {/* Modals */}
      {create && (
        <CreateClassModal
          defaultDate={create.defaultDate}
          defaultDayOfWeek={create.defaultDayOfWeek}
          defaultHour={create.defaultHour}
          defaultType={create.defaultType}
          onClose={() => setCreate(null)}
          onCreated={(res) => {
            setCreate(null)
            // Jump to the week of the class's first real session so it's immediately visible
            // (e.g. when creating during the summer break, the calendar moves to October).
            if (res?.firstDate) setAnchor(weekStart(parseISO(res.firstDate)))
            if (res?.templateId) setPromptStudents({ kind: 'template', templateId: res.templateId })
            else if (res?.summerWeekId) setPromptStudents({ kind: 'summerWeek', weekId: res.summerWeekId })
          }}
        />
      )}

      {promptStudents && (
        <AddStudentsModal
          target={promptStudents}
          defaultPermanent
          title={promptStudents.kind === 'summerWeek' ? 'Add students to this summer week' : 'Add students to this class'}
          onClose={() => setPromptStudents(null)}
        />
      )}

      {detailOccId && (
        <ClassDetailModal
          occId={detailOccId}
          onClose={() => setDetailOccId(null)}
          onMove={(occ) => {
            setDetailOccId(null)
            setMoveProposal({ occ, newDate: occ.date, startTime: occ.startTime, endTime: occ.endTime })
          }}
          onDelete={(occ) => {
            setDetailOccId(null)
            setDeleteOcc(occ)
          }}
        />
      )}

      {moveProposal && <MoveClassModal proposal={moveProposal} onClose={() => setMoveProposal(null)} />}
      {deleteOcc && <DeleteClassModal occ={deleteOcc} onClose={() => setDeleteOcc(null)} />}
    </div>
  )
}

function ClassBlock({ occ, onOpen, onDragStart }) {
  const { state } = useStore()
  const startMin = timeToMinutes(occ.startTime)
  const endMin = timeToMinutes(occ.endTime)
  const top = ((startMin - GRID_START_MIN) / 60) * HOUR_HEIGHT
  const height = Math.max(28, ((endMin - startMin) / 60) * HOUR_HEIGHT - 4)
  const students = occ.studentIds.map((id) => studentById(state, id)).filter(Boolean)

  return (
    <div
      className={`block ${occ.type}`}
      style={{ top, height }}
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
    >
      <div className="block-name">{occ.name}</div>
      <div className="block-time">{formatTimeRange(occ.startTime, occ.endTime)}</div>
      {height > 52 && (
        <div className="block-count">
          {students.length} {students.length === 1 ? 'student' : 'students'}
        </div>
      )}
      <div className="block-tooltip">
        <div className="tt-title">{occ.name}</div>
        <div className="tt-sub">
          {CLASS_TYPES[occ.type]?.label} · {formatTimeRange(occ.startTime, occ.endTime)}
        </div>
        <div className="tt-students">
          {students.length === 0 && <span className="muted">No students yet</span>}
          {students.map((s) => (
            <div className="tt-student" key={s.id}>
              <Avatar student={s} size="xs" />
              {studentName(s)}
              {occ.tempStudentIds.includes(s.id) && <span className="chip oneonone" style={{ marginLeft: 'auto' }}>Temp</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
