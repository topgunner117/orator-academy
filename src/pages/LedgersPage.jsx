import React, { useMemo, useState } from 'react'
import { useStore, nowOf } from '../store.jsx'
import { ledgerMonths, monthLedger, groupByStudent } from '../utils/ledgers.js'
import { parseISO } from '../utils/dates.js'

const fmtDate = (iso) =>
  parseISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const fmtDateTime = (ts) => {
  const d = new Date(ts)
  return isNaN(d)
    ? ''
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// One compiled, printable document per month: every charge billed and every payment / credit
// that went through, with student, reason, and timestamp. The Print button gives the teacher a
// physical backup of the month's data.
export default function LedgersPage() {
  const { state } = useStore()
  const today = nowOf(state)

  const months = useMemo(() => ledgerMonths(state, today), [state, today])
  const [selected, setSelected] = useState('')
  const [view, setView] = useState('time') // 'time' = all transactions in order | 'student' = sectioned per student
  const ym = selected || months[0] || ''
  const doc = useMemo(() => (ym ? monthLedger(state, ym, today) : null), [state, ym, today])

  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="page-title">Ledgers</div>
          <div className="page-sub">
            A compiled document per month — every charge, payment, and credit that went through, with timestamps.
            Print each month for a physical backup.
          </div>
        </div>
        {doc && (
          <button className="btn btn-primary" onClick={() => window.print()}>
            🖨️ Print this ledger
          </button>
        )}
      </div>

      {months.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="big">📒</div>
            <h3>No activity yet</h3>
            <p>Ledgers appear automatically once charges are billed or payments are recorded.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="spread wrap no-print" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div className="month-tabs" style={{ marginBottom: 16 }}>
              {months.map((k) => (
                <button key={k} className={`month-tab${k === ym ? ' on' : ''}`} onClick={() => setSelected(k)}>
                  {monthLedger(state, k, today).label}
                </button>
              ))}
            </div>
            <div className="seg" title="How the month's transactions are organized">
              <button className={view === 'time' ? 'on' : ''} onClick={() => setView('time')}>
                All by time
              </button>
              <button className={view === 'student' ? 'on' : ''} onClick={() => setView('student')}>
                By student
              </button>
            </div>
          </div>

          {doc && <LedgerDocument doc={doc} state={state} today={today} view={view} />}
        </>
      )}
    </div>
  )
}

function LedgerDocument({ doc, state, today, view = 'time' }) {
  const studio = state.config?.studioName || 'Orator Academy'
  return (
    <div className="card ledger-doc print-doc">
      <div className="ledger-doc-head">
        <div>
          <div className="ledger-doc-studio">{studio}</div>
          <h2 className="ledger-doc-title">Monthly ledger — {doc.label}</h2>
        </div>
        <div className="ledger-doc-meta">
          Generated{' '}
          {today.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          <br />
          {doc.charges.length} charge{doc.charges.length === 1 ? '' : 's'} · {doc.received.length} transaction
          {doc.received.length === 1 ? '' : 's'} · {view === 'student' ? 'sectioned by student' : 'in time order'}
        </div>
      </div>

      {view === 'student' ? (
        <ByStudentSections doc={doc} />
      ) : (
        <ByTimeTables doc={doc} />
      )}

      {/* Month summary */}
      <div className="ledger-doc-totals">
        <span>Charged <b>${doc.totals.charged.toFixed(2)}</b></span>
        <span>Payments <b>${doc.totals.payments.toFixed(2)}</b></span>
        <span>Credits <b>${doc.totals.credits.toFixed(2)}</b></span>
        <span>Summer <b>${doc.totals.summer.toFixed(2)}</b></span>
        <span className="strong">Net for {doc.label}: <b>${(doc.totals.charged - doc.totals.received).toFixed(2)}</b></span>
      </div>

      <div className="ledger-doc-foot">
        {studio} · monthly ledger · {doc.label} — keep with the studio's physical records.
      </div>
    </div>
  )
}

// Every student's transactions in their own section — first student, then the next — with
// per-student subtotals. The studentless Summer-lessons folder comes last.
function ByStudentSections({ doc }) {
  const sections = groupByStudent(doc)
  if (sections.length === 0)
    return <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>No activity this month.</p>
  return (
    <div>
      {sections.map((sec) => (
        <div className="ledger-sec" key={sec.studentId}>
          <div className="ledger-sec-head">
            <span>{sec.student}</span>
            <span className="ledger-sec-sub">
              charged ${sec.charged.toFixed(2)} · received ${sec.received.toFixed(2)}
            </span>
          </div>
          <table className="ledger-table doc-table">
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th>Description / reason</th>
                <th className="num">Charge</th>
                <th className="num">Payment / Credit</th>
              </tr>
            </thead>
            <tbody>
              {sec.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="led-date">{fmtDate(r.date)}</div>
                    {r.kind !== 'charge' && <div className="led-time">{fmtDateTime(r.ts)}</div>}
                  </td>
                  <td>
                    {r.label}
                    {r.auto && <span className="auto-tag" title="Auto-applied from a forwarded payment email">auto</span>}
                  </td>
                  <td className="num">{r.charge > 0 ? `$${r.charge.toFixed(2)}` : ''}</td>
                  <td className="num credit">{r.credit > 0 ? `$${r.credit.toFixed(2)}` : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="foot-label">{sec.student} — subtotal</td>
                <td className="num strong">${sec.charged.toFixed(2)}</td>
                <td className="num credit strong">${sec.received.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  )
}

// The original layout: charges billed, then every payment / credit in time order.
function ByTimeTables({ doc }) {
  return (
    <div>
      {/* Charges billed */}
      <div className="sub-label" style={{ marginTop: 18 }}>Charges billed</div>
      {doc.charges.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>No charges billed this month.</p>
      ) : (
        <table className="ledger-table doc-table">
          <thead>
            <tr>
              <th>Posted</th>
              <th>Student</th>
              <th>Description</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.charges.map((c) => (
              <tr key={c.id}>
                <td>{fmtDate(c.date)}</td>
                <td>{c.student}</td>
                <td>{c.description}</td>
                <td className="num">${c.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="foot-label">Total charged</td>
              <td className="num strong">${doc.totals.charged.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* Payments & credits received */}
      <div className="sub-label" style={{ marginTop: 22 }}>Payments &amp; credits received</div>
      {doc.received.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>No payments or credits recorded this month.</p>
      ) : (
        <table className="ledger-table doc-table">
          <thead>
            <tr>
              <th>Date &amp; time</th>
              <th>Student</th>
              <th>Reason</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.received.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="led-date">{fmtDate(r.date)}</div>
                  <div className="led-time">{fmtDateTime(r.ts)}</div>
                </td>
                <td>{r.student}</td>
                <td>
                  {r.reason}
                  {r.auto && <span className="auto-tag" title="Auto-applied from a forwarded payment email">auto</span>}
                </td>
                <td className="num credit">${r.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="foot-label">Total received</td>
              <td className="num strong">${doc.totals.received.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
