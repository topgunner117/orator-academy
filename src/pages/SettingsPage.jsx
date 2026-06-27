import React, { useState } from 'react'
import { useStore, nowOf } from '../store.jsx'
import Modal from '../components/Modal.jsx'
import IntegrationsSettings from '../components/IntegrationsSettings.jsx'
import { isoDate } from '../utils/dates.js'
import { factoryReset } from '../utils/api.js'

export default function SettingsPage() {
  const { state, dispatch } = useStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [wiping, setWiping] = useState(false)

  const doFactoryReset = async () => {
    setWiping(true)
    try {
      await factoryReset()
    } catch {
      /* even if the server is down, clear the local copy below */
    }
    try {
      localStorage.removeItem('orator-academy-v1')
      sessionStorage.removeItem('orator-academy-v1')
    } catch {
      /* ignore */
    }
    window.location.reload()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Saving, billing options, and class management.</div>
        </div>
      </div>

      <div className="stack" style={{ maxWidth: 720, gap: 16 }}>
        <SettingRow
          title="Save progress"
          desc={
            state.testMode
              ? 'Test Mode is ON — progress is kept for this browser session (survives reloads) and resets when the tab/app is closed.'
              : 'Permanent saving is ON — changes are stored in this browser and persist across closes.'
          }
        >
          <div className="row" style={{ gap: 10 }}>
            <span className="muted" style={{ fontSize: 12 }}>{state.testMode ? 'Test mode' : 'Saving'}</span>
            <button
              className={`switch${!state.testMode ? ' on' : ''}`}
              onClick={() => dispatch({ type: 'SET_TEST_MODE', value: !state.testMode })}
              aria-label="Toggle saving"
            />
          </div>
        </SettingRow>

        <BillingRow />

        <SpoofDateRow />

        <SettingRow
          title="Reset classes"
          desc="Deletes every class from the schedule so you can rebuild the term. Keeps all students, metrics, notes, goals, and payment history."
          danger
        >
          <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
            Reset all classes
          </button>
        </SettingRow>

        <SettingRow
          title="Factory reset"
          desc="Wipes ALL data — students, classes, progress, payments, and the console log — back to an empty app. The app and every feature stay; only the data is erased. Use this to clear test data before handing the app off."
          danger
        >
          <button className="btn btn-danger" onClick={() => setConfirmWipe(true)}>
            Factory reset
          </button>
        </SettingRow>

        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Studio at a glance</h3>
          <div className="settings-stats">
            <span>{state.students.filter((s) => !s.archived).length} active students</span>
            <span>{state.students.filter((s) => s.archived).length} archived</span>
            <span>{state.templates.length} recurring classes</span>
            <span>{state.payments.length} payments recorded</span>
          </div>
        </div>

        <IntegrationsSettings />
      </div>

      {confirmReset && (
        <Modal
          title="Reset all classes?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  dispatch({ type: 'RESET_CLASSES' })
                  setConfirmReset(false)
                }}
              >
                Yes, reset classes
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            This removes all <strong>{state.templates.length}</strong> recurring classes and any one-off sessions from the
            schedule. You can then build new permanent classes and re-add permanent students.
          </p>
          <p className="muted">Students, metrics, notes, goals, and payments are all preserved.</p>
        </Modal>
      )}

      {confirmWipe && (
        <Modal
          title="Factory reset — erase everything?"
          onClose={() => !wiping && setConfirmWipe(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmWipe(false)} disabled={wiping}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={doFactoryReset} disabled={wiping}>
                {wiping ? 'Wiping…' : 'Yes, erase ALL data'}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            This permanently erases <strong>every</strong> student, class, progress report, payment, and the console log —
            on both this browser and the server — returning the app to a clean, empty state.
          </p>
          <p className="muted">
            The app and all its features stay exactly as they are; only the data is wiped. This cannot be undone. The page
            will reload when it's done.
          </p>
        </Modal>
      )}
    </div>
  )
}

function SettingRow({ title, desc, children, danger }) {
  return (
    <div className="card card-pad spread" style={danger ? { borderColor: '#f0c4cb' } : undefined}>
      <div style={{ paddingRight: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
          {desc}
        </div>
      </div>
      {children}
    </div>
  )
}

// Lets you simulate "today" being any date — useful for testing billing cycles,
// outstanding fees, and the schedule across the year.
function SpoofDateRow() {
  const { state, dispatch } = useStore()
  const spoofed = !!state.spoofDate
  const [draft, setDraft] = useState(isoDate(nowOf(state)))

  const apply = (iso) => {
    setDraft(iso)
    dispatch({ type: 'SET_SPOOF_DATE', value: iso })
  }

  return (
    <div className="card card-pad" style={spoofed ? { borderColor: '#c9c0f0' } : undefined}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ paddingRight: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Simulate date</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
            Pretend it's a different day. Everything time-based — outstanding fees, billing cycles, the
            schedule's “today” — uses this date.{' '}
            {spoofed ? (
              <strong style={{ color: 'var(--accent)' }}>
                Currently simulating {nowOf(state).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.
              </strong>
            ) : (
              'Off — using the real date.'
            )}
          </div>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
        <input type="date" className="input" style={{ maxWidth: 180 }} value={draft} onChange={(e) => apply(e.target.value)} />
        <button className="btn btn-sm" onClick={() => apply('2026-11-07')}>
          Jump to Nov 7, 2026
        </button>
        <button className="btn btn-sm" disabled={!spoofed} onClick={() => dispatch({ type: 'SET_SPOOF_DATE', value: null })}>
          Use real date
        </button>
      </div>
    </div>
  )
}

// Editable billing settings: cost per class and late-fee percentage.
function BillingRow() {
  const { state, dispatch } = useStore()
  const [price, setPrice] = useState(String(state.classPrice ?? 40))
  const [pct, setPct] = useState(String(Math.round((state.lateFeeRate ?? 0.1) * 100)))

  const commitPrice = () => {
    const n = parseFloat(price)
    if (!isNaN(n) && n >= 0) dispatch({ type: 'SET_CLASS_PRICE', value: Math.round(n * 100) / 100 })
    else setPrice(String(state.classPrice ?? 40))
  }
  const commitPct = () => {
    const n = parseFloat(pct)
    if (!isNaN(n) && n >= 0) dispatch({ type: 'SET_LATE_FEE_RATE', value: n / 100 })
    else setPct(String(Math.round((state.lateFeeRate ?? 0.1) * 100)))
  }

  return (
    <div className="card card-pad">
      <div style={{ fontWeight: 700, fontSize: 15 }}>Billing</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 3, marginBottom: 16 }}>
        Set what each group class costs and your late-fee policy.
      </div>
      <div className="settings-fields">
        <div>
          <label className="label">Cost per group class</label>
          <div className="affix">
            <span className="affix-pre">$</span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => e.key === 'Enter' && commitPrice()}
              style={{ paddingLeft: 26, maxWidth: 150 }}
            />
          </div>
        </div>
        <div>
          <label className="label">Late fee</label>
          <div className="row" style={{ gap: 12 }}>
            <div className="affix">
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={pct}
                disabled={!state.lateFeeEnabled}
                onChange={(e) => setPct(e.target.value)}
                onBlur={commitPct}
                onKeyDown={(e) => e.key === 'Enter' && commitPct()}
                style={{ paddingRight: 28, maxWidth: 110 }}
              />
              <span className="affix-post">%</span>
            </div>
            <button
              className={`switch${state.lateFeeEnabled ? ' on' : ''}`}
              onClick={() => dispatch({ type: 'TOGGLE_LATE_FEE', value: !state.lateFeeEnabled })}
              aria-label="Toggle late fee"
            />
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 7 }}>
            {state.lateFeeEnabled ? `${pct}% added to balances unpaid past the 10th.` : 'Off — no late fee applied.'}
          </div>
        </div>
      </div>
    </div>
  )
}
