import React, { useState } from 'react'
import Modal from '../Modal.jsx'
import { useStore } from '../../store.jsx'
import { getOccurrenceById } from '../../utils/engine.js'
import { studentName } from '../../utils/helpers.js'
import Avatar from '../Avatar.jsx'

// target: { kind:'template', templateId } | { kind:'session', occId }
// defaultPermanent: true right after a class is made / when first prompted; false when adding later.
export default function AddStudentsModal({ target, defaultPermanent = true, onClose, title }) {
  const { state, dispatch } = useStore()
  const [permanent, setPermanent] = useState(defaultPermanent)

  // Resolve current membership live from state.
  let template, occ, permIds, tempIds, occId
  if (target.kind === 'template') {
    template = state.templates.find((t) => t.id === target.templateId)
    permIds = template?.permanentStudentIds || []
    tempIds = []
  } else {
    occ = getOccurrenceById(state, target.occId)
    occId = target.occId
    permIds = occ?.permanentStudentIds || []
    tempIds = occ?.tempStudentIds || []
  }

  const isPerm = (id) => permIds.includes(id)
  const isTemp = (id) => tempIds.includes(id)
  const inClass = (id) => isPerm(id) || isTemp(id)

  const maxOne = (occ?.type || template?.type) !== 'group' // 1-on-1 / makeup
  const enrolledCount = permIds.length + tempIds.length

  const active = state.students.filter((s) => !s.archived)

  const add = (id) => {
    if (maxOne && enrolledCount >= 1) return
    if (permanent) {
      if (target.kind === 'template') dispatch({ type: 'ADD_PERMANENT_STUDENT', templateId: target.templateId, studentId: id })
      else if (occ.recurring) dispatch({ type: 'ADD_PERMANENT_STUDENT', templateId: occ.templateId, studentId: id })
      else dispatch({ type: 'UPDATE_OCCURRENCE', id: occId, patch: { studentIds: [...permIds, id] } })
    } else {
      // temporary — needs a concrete session
      dispatch({ type: 'ADD_TEMP_STUDENT', occId, studentId: id })
    }
  }

  const remove = (id) => {
    if (isPerm(id)) {
      if (target.kind === 'template') dispatch({ type: 'REMOVE_PERMANENT_STUDENT', templateId: target.templateId, studentId: id })
      else if (occ.recurring) dispatch({ type: 'REMOVE_PERMANENT_STUDENT', templateId: occ.templateId, studentId: id })
      else dispatch({ type: 'UPDATE_OCCURRENCE', id: occId, patch: { studentIds: permIds.filter((x) => x !== id) } })
    } else {
      dispatch({ type: 'REMOVE_STUDENT_FROM_SESSION', occId, studentId: id })
    }
  }

  const toggle = (id) => (inClass(id) ? remove(id) : add(id))

  const canBePermanent = target.kind === 'template' || occ?.recurring
  const canBeTemporary = target.kind === 'session'

  return (
    <Modal
      title={title || 'Add students'}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      {active.length === 0 ? (
        <div className="empty" style={{ padding: 28 }}>
          <div className="big">👥</div>
          <p>No students exist yet. Add students from the Students page first.</p>
        </div>
      ) : (
        <>
          <div className={`mode-switch ${permanent ? 'perm' : 'temp'}`}>
            <div>
              <div style={{ fontWeight: 700 }}>{permanent ? 'Permanent' : 'Temporary'} enrollment</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {permanent
                  ? 'Student attends this class every session.'
                  : 'Student attends only this one session, then is removed.'}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Temp
              </span>
              <button
                className={`switch${permanent ? ' on' : ''}`}
                disabled={!canBePermanent || !canBeTemporary}
                onClick={() => setPermanent((p) => !p)}
                aria-label="Toggle permanent / temporary"
              />
              <span className="muted" style={{ fontSize: 12 }}>
                Perm
              </span>
            </div>
          </div>
          {!canBeTemporary && (
            <div className="hint">Setting permanent roster — temporary enrollment is added from a specific session.</div>
          )}

          {maxOne && (
            <div className="hint">This is a 1-on-1 class — it takes a single student.</div>
          )}

          <div className="roster-pick">
            {active.map((s) => {
              const glow = isPerm(s.id) ? 'glow-perm' : isTemp(s.id) ? 'glow-temp' : ''
              const selected = inClass(s.id)
              return (
                <button
                  key={s.id}
                  className={`pick-box ${glow}${selected ? ' selected' : ''}`}
                  onClick={() => toggle(s.id)}
                  disabled={!selected && maxOne && enrolledCount >= 1}
                >
                  <Avatar student={s} size="sm" />
                  <span className="pick-name">{studentName(s)}</span>
                  {isPerm(s.id) && <span className="chip" style={{ background: '#1b1e2b', color: '#fff' }}>Permanent</span>}
                  {isTemp(s.id) && <span className="chip oneonone">Temporary</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
