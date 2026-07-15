import React, { useRef, useState } from 'react'
import { prettyDate } from '../utils/dates.js'

// A goal list that supports:
//   • drag to REORDER (drop on the top/bottom edge of another goal)
//   • drag to NEST (drop on the middle of another goal → it becomes a sub-goal)
//   • click the text to EDIT it in place
//   • the existing add / mark-met / delete actions
//
// Goals are a flat array; hierarchy is expressed with an optional `parentId` on each item.
// Rendering groups by parentId (a goal whose parent no longer exists is shown at the top level,
// so deleting a parent simply promotes its children rather than losing them). Reorder/re-nest is
// computed here and handed back whole via onReorder, so the reducer just stores the new array.

const ROOT = '__root__'

function childMap(goals) {
  const ids = new Set(goals.map((g) => g.id))
  const map = new Map()
  for (const g of goals) {
    const p = g.parentId && ids.has(g.parentId) ? g.parentId : ROOT
    if (!map.has(p)) map.set(p, [])
    map.get(p).push(g)
  }
  return map
}

// Every id in the subtree rooted at `id` (so we never drop a goal inside its own descendants).
function subtreeIds(goals, id) {
  const map = childMap(goals)
  const out = new Set([id])
  const stack = [id]
  while (stack.length) {
    for (const c of map.get(stack.pop()) || []) {
      if (!out.has(c.id)) {
        out.add(c.id)
        stack.push(c.id)
      }
    }
  }
  return out
}

// Produce a new flat array with `dragId` moved relative to `targetId` per `mode`.
function moveGoal(goals, dragId, targetId, mode) {
  if (dragId === targetId) return goals
  if (subtreeIds(goals, dragId).has(targetId)) return goals // can't nest into own subtree
  const dragItem = goals.find((g) => g.id === dragId)
  const target = goals.find((g) => g.id === targetId)
  if (!dragItem || !target) return goals

  const parentExists = (pid) => pid && goals.some((g) => g.id === pid)
  const newParent = mode === 'child' ? targetId : parentExists(target.parentId) ? target.parentId : null
  const moved = { ...dragItem, parentId: newParent || undefined }

  const without = goals.filter((g) => g.id !== dragId)
  const tIdx = without.findIndex((g) => g.id === targetId)
  const insertAt = mode === 'before' ? tIdx : tIdx + 1 // 'after' and 'child' both land just after the target
  return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)]
}

export default function GoalTree({ goals, onAdd, onToggle, onDelete, onReorder, onEditText, placeholder }) {
  const [text, setText] = useState('')
  const [dragId, setDragId] = useState(null)
  const [hint, setHint] = useState(null) // { id, mode }
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')

  const map = childMap(goals)

  const add = () => {
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }

  const dropModeFor = (e, el) => {
    const rect = el.getBoundingClientRect()
    const frac = (e.clientY - rect.top) / rect.height
    if (frac < 0.28) return 'before'
    if (frac > 0.72) return 'after'
    return 'child'
  }

  const onRowDragOver = (e, g) => {
    if (!dragId || dragId === g.id) return
    if (subtreeIds(goals, dragId).has(g.id)) return // into own subtree — not allowed
    e.preventDefault()
    const mode = dropModeFor(e, e.currentTarget)
    if (!hint || hint.id !== g.id || hint.mode !== mode) setHint({ id: g.id, mode })
  }

  const onRowDrop = (e, g) => {
    e.preventDefault()
    if (dragId && hint && hint.id === g.id) {
      const next = moveGoal(goals, dragId, g.id, hint.mode)
      if (next !== goals) onReorder(next)
    }
    setDragId(null)
    setHint(null)
  }

  const startEdit = (g) => {
    setEditingId(g.id)
    setDraft(g.text)
  }
  const commitEdit = (g) => {
    const t = draft.trim()
    if (t && t !== g.text) onEditText(g, t)
    setEditingId(null)
  }

  const renderNodes = (parentKey, depth) =>
    (map.get(parentKey) || []).map((g) => {
      const isHint = hint && hint.id === g.id
      const editing = editingId === g.id
      return (
        <React.Fragment key={g.id}>
          <div
            className={`goal-node${g.met ? ' done' : ''}${dragId === g.id ? ' dragging' : ''}${
              isHint ? ` drop-${hint.mode}` : ''
            }`}
            style={{ marginLeft: depth * 22 }}
            draggable={!editing}
            onDragStart={(e) => {
              setDragId(g.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => {
              setDragId(null)
              setHint(null)
            }}
            onDragOver={(e) => onRowDragOver(e, g)}
            onDrop={(e) => onRowDrop(e, g)}
          >
            <span className="goal-grip" title="Drag to reorder or nest" aria-hidden="true">
              ⠿
            </span>
            <div className="goal-main">
              {editing ? (
                <input
                  className="input goal-edit-input"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitEdit(g)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(g)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <div className="goal-text goal-text-edit" onClick={() => startEdit(g)} title="Click to edit">
                  {g.text} <span className="edit-pencil">✎</span>
                </div>
              )}
              <div className="goal-meta">
                Set {prettyDate(g.createdDate)}
                {g.met && g.completedDate ? ` · completed ${prettyDate(g.completedDate)}` : ''}
              </div>
            </div>
            {g.met ? (
              <button className="chip green" title="Reopen" onClick={() => onToggle(g, false)}>
                ✓ Complete
              </button>
            ) : (
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm" onClick={() => onToggle(g, true)}>
                  ✓ Met
                </button>
                <button
                  className="icon-btn"
                  title="Delete goal"
                  style={{ width: 30, height: 30 }}
                  onClick={() => onDelete(g)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          {renderNodes(g.id, depth + 1)}
        </React.Fragment>
      )
    })

  return (
    <div className="goal-list goal-tree">
      {renderNodes(ROOT, 0)}
      <div className="goal-add">
        <input
          className="input"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}
