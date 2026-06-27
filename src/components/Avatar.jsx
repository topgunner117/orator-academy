import React from 'react'
import { initials, avatarColor } from '../utils/helpers.js'

// Shows the student's photo when one is set, otherwise their colored initials.
export default function Avatar({ student, size = 'md', className = '' }) {
  const sizeCls = size === 'sm' ? ' sm' : size === 'xs' ? ' xs' : ''
  const cls = `avatar${sizeCls}${className ? ' ' + className : ''}`
  if (student?.image) {
    return (
      <div className={cls} style={{ padding: 0, overflow: 'hidden' }}>
        <img src={student.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div className={cls} style={{ background: avatarColor(student?.id || '') }}>
      {initials(student)}
    </div>
  )
}
