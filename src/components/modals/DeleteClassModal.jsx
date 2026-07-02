import React from 'react'
import Modal from '../Modal.jsx'
import { useStore } from '../../store.jsx'
import { prettyDate } from '../../utils/dates.js'

export default function DeleteClassModal({ occ, onClose }) {
  const { dispatch } = useStore()
  const standalone = !occ.recurring
  const isSummer = occ.type === 'summer' && occ.weekId

  const deleteOne = () => {
    dispatch({ type: 'DELETE_OCCURRENCE', occId: occId(occ), standalone })
    onClose()
  }
  const deleteAll = () => {
    dispatch({ type: 'DELETE_TEMPLATE', id: occ.templateId })
    onClose()
  }
  const deleteWeek = () => {
    dispatch({ type: 'DELETE_SUMMER_WEEK', weekId: occ.weekId })
    onClose()
  }

  return (
    <Modal
      title="Delete class"
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <p style={{ marginTop: 0 }}>
        Delete <strong>{occ.name}</strong> on {prettyDate(occ.date)}?
      </p>

      <div className="stack" style={{ marginTop: 8 }}>
        <button className="del-option" onClick={deleteOne}>
          <div>
            <div style={{ fontWeight: 700 }}>{isSummer ? 'Just this day' : 'Just this session'}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Removes only the {prettyDate(occ.date)} session{isSummer ? ' — the rest of the week stays.' : '.'}
            </div>
          </div>
          <span>→</span>
        </button>

        {occ.recurring && (
          <button className="del-option danger" onClick={deleteAll}>
            <div>
              <div style={{ fontWeight: 700 }}>All recurring sessions</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Deletes this class and every future weekly session.
              </div>
            </div>
            <span>→</span>
          </button>
        )}

        {isSummer && (
          <button className="del-option danger" onClick={deleteWeek}>
            <div>
              <div style={{ fontWeight: 700 }}>The whole summer week</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Deletes all five Monday–Friday sessions of this week.
              </div>
            </div>
            <span>→</span>
          </button>
        )}
      </div>
    </Modal>
  )
}

function occId(occ) {
  return occ.occId
}
