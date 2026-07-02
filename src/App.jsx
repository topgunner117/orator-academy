import React, { useState } from 'react'
import { useStore, nowOf } from './store.jsx'
import Landing from './Landing.jsx'
import SchedulePage from './pages/SchedulePage.jsx'
import StudentsPage from './pages/StudentsPage.jsx'
import ProgressPage from './pages/ProgressPage.jsx'
import PaymentsPage from './pages/PaymentsPage.jsx'
import LedgersPage from './pages/LedgersPage.jsx'
import ReconcilePage from './pages/ReconcilePage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

const NAV = [
  { id: 'schedule', label: 'Schedule', ico: '🗓️' },
  { id: 'students', label: 'Students', ico: '👥' },
  { id: 'progress', label: 'Progress', ico: '📈' },
  { id: 'payments', label: 'Payments', ico: '💳' },
  { id: 'ledgers', label: 'Ledgers', ico: '📒' },
  { id: 'reconcile', label: 'Reconcile', ico: '🧾' },
  { id: 'settings', label: 'Settings', ico: '⚙️' },
]

export default function App() {
  const [page, setPage] = useState('schedule')
  const { state, synced } = useStore()
  const [entered, setEntered] = useState(() => {
    try {
      return sessionStorage.getItem('oa-entered') === '1'
    } catch {
      return false
    }
  })

  if (!entered) {
    return (
      <Landing
        onEnter={() => {
          try {
            sessionStorage.setItem('oa-entered', '1')
          } catch {
            /* ignore */
          }
          setEntered(true)
        }}
      />
    )
  }

  const pages = {
    schedule: <SchedulePage />,
    students: <StudentsPage />,
    progress: <ProgressPage />,
    payments: <PaymentsPage />,
    ledgers: <LedgersPage />,
    reconcile: <ReconcilePage />,
    settings: <SettingsPage />,
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand" onClick={() => setEntered(false)} title="Back to intro" role="button" tabIndex={0}>
          <div className="brand-mark">
            <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="3.1" fill="#fff" />
              <path
                d="M9.2 9.6a6.3 6.3 0 0 0 0 8.8M18.8 9.6a6.3 6.3 0 0 1 0 8.8"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.92"
              />
              <path
                d="M6 6.6a10.5 10.5 0 0 0 0 14.8M22 6.6a10.5 10.5 0 0 1 0 14.8"
                stroke="#fff"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.5"
              />
            </svg>
          </div>
          <div>
            <div className="brand-name">Orator Academy</div>
            <div className="brand-sub">DATABASE</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item${page === n.id ? ' active' : ''}`}
              onClick={() => setPage(n.id)}
            >
              <span className="ico">{n.ico}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {synced ? 'Synced to cloud' : 'Saved on this device'}
          <br />
          {state.students.filter((s) => !s.archived).length} active students
        </div>
      </aside>

      <main className="main">
        {state.spoofDate && (
          <div className="spoofbar">
            <span>🕓</span> Simulating{' '}
            <strong>
              {nowOf(state).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </strong>{' '}
            — not the real date. Change it in Settings.
          </div>
        )}
        {pages[page]}
      </main>
    </div>
  )
}
