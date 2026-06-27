import React, { useState } from 'react'

// 0–5 rating in 0.5 (half-star) intervals. Click left half = .5, right half = full.
export default function StarRating({ value = 0, onChange, readOnly = false, size = 22 }) {
  const [hover, setHover] = useState(null)
  const display = hover != null ? hover : value

  const handle = (e, star) => {
    if (readOnly) return
    const { left, width } = e.currentTarget.getBoundingClientRect()
    const isLeft = e.clientX - left < width / 2
    return star - (isLeft ? 0.5 : 0)
  }

  return (
    <div className="stars" style={{ '--star-size': `${size}px` }} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, display - (star - 1)))
        return (
          <span
            key={star}
            className={`star${readOnly ? ' ro' : ''}`}
            onMouseMove={(e) => !readOnly && setHover(handle(e, star))}
            onClick={(e) => !readOnly && onChange?.(handle(e, star))}
          >
            <span className="star-bg">★</span>
            <span className="star-fg" style={{ width: `${fill * 100}%` }}>
              ★
            </span>
          </span>
        )
      })}
      {!readOnly && (
        <span className="star-num">{(hover != null ? hover : value) > 0 ? (hover != null ? hover : value).toFixed(1) : '—'}</span>
      )}
    </div>
  )
}
