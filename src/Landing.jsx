import React, { useEffect, useState } from 'react'
import './landing.css'

const PASSWORD = 'orator'

export default function Landing({ onEnter }) {
  const [ready, setReady] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [pw, setPw] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60)
    return () => clearTimeout(t)
  }, [])

  const enter = () => {
    if (pw.trim().toLowerCase() !== PASSWORD) {
      setError(true)
      setTimeout(() => setError(false), 650)
      return
    }
    setLeaving((l) => {
      if (l) return l
      setTimeout(onEnter, 760) // let the exit animation play
      return true
    })
  }

  return (
    <div className={`oa-landing${ready ? ' ready' : ''}${leaving ? ' leaving' : ''}`}>
      <div className="oa-bg">
        <div className="oa-orb oa-orb-1" />
        <div className="oa-orb oa-orb-2" />
        <div className="oa-orb oa-orb-3" />
        <div className="oa-grid" />
        <div className="oa-grain" />
      </div>

      <div className="oa-content">
        <div className="oa-mark">
          <span className="oa-ring oa-ring-1" />
          <span className="oa-ring oa-ring-2" />
          <span className="oa-ring oa-ring-3" />
          <span className="oa-tile">
            <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="3.1" fill="#fff" />
              <path d="M9.2 9.6a6.3 6.3 0 0 0 0 8.8M18.8 9.6a6.3 6.3 0 0 1 0 8.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.92" />
              <path d="M6 6.6a10.5 10.5 0 0 0 0 14.8M22 6.6a10.5 10.5 0 0 1 0 14.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
            </svg>
          </span>
        </div>

        <div className="oa-eyebrow">PUBLIC SPEAKING TUITION</div>
        <h1 className="oa-title">Orator Academy</h1>
        <div className="oa-word">Database</div>
        <p className="oa-tag">
          Schedules, students, progress &amp; payments — one quietly powerful studio for the modern speaking coach.
        </p>

        <div className={`oa-signin${error ? ' error' : ''}`}>
          <input
            className="oa-pass"
            type="password"
            autoFocus
            placeholder="Password"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value)
              setError(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && enter()}
            aria-label="Password"
          />
          <button className="oa-enter" onClick={enter}>
            <span className="oa-enter-label">Enter the studio</span>
            <span className="oa-enter-ico">→</span>
            <span className="oa-enter-shine" />
          </button>
        </div>

        <div className={`oa-hint${error ? ' err' : ''}`}>
          {error ? 'Incorrect password — try again' : (
            <>
              Enter the password, then press <kbd>Enter</kbd>
            </>
          )}
        </div>
      </div>

      <div className="oa-foot">ORATOR ACADEMY DATABASE · v1.0 · Test build</div>
    </div>
  )
}
