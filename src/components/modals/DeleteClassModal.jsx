import React from 'react'
import Modal from '../Modal.jsx'
import { useStore } from '../../store.jsx'
import { prettyDate } from '../../utils/dates.js'

export default function DeleteClassModal({ occ, onClose }) {
  const { dispatch } = useStore()
  const standalone = !occ.recurring

  const deleteOne = () => {
    dispatch({ type: 'DELETE_OCCURRENCE', occId: occId(occ), standalone })
    onClose()
  }
  const deleteAll = () => {
    dispatch({ type: 'DELETE_TEMPLATE', id: occ.templateId })
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
            <div style={{ fontWeight: 700 }}>Just this session</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Removes only the {prettyDate(occ.date)} session.
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
      </div>
    </Modal>
  )
}

function occId(occ) {
  return occ.occId
}
