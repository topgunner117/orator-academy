import React, { useEffect, useMemo, useState } from 'react'
import { useStore, nowOf } from '../store.jsx'
import { studentName, studentById } from '../utils/helpers.js'
import { DEFAULT_SMS_TEMPLATE, buildReminderMessage } from '../utils/sms.js'
import {
  fetchIntegrationStatus,
  fetchAuditLog,
  fetchNeedsAttention,
  fetchCapturedEmails,
  fetchSmsLog,
  undoAutoPayment,
  simulateEmail,
  fetchConsoleEvents,
} from '../utils/api.js'

const Dot = ({ on, label, off = 'Not set' }) => (
  <span className={`int-dot ${on ? 'on' : ''}`}>
    <span className="int-dot-led" /> {on ? label : off}
  </span>
)

export default function IntegrationsSettings() {
  const { state, dispatch, synced } = useStore()
  const [status, setStatus] = useState(null)
  const [reachable, setReachable] = useState(true)

  const refreshStatus = () =>
    fetchIntegrationStatus()
      .then((s) => {
        setStatus(s)
        setReachable(true)
      })
      .catch(() => setReachable(false))

  useEffect(() => {
    refreshStatus()
  }, [])

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Integrations</h3>
            <div className="muted" style={{ fontSize: 12.5 }}>
              AI note-reading, the SMS reminder button, and Gmail payment auto-apply. Secrets live on the server only —
              nothing sensitive is stored here.
            </div>
          </div>
          <button className="btn btn-sm" onClick={refreshStatus}>
            ↻ Refresh
          </button>
        </div>

        {!reachable ? (
          <div className="form-error" style={{ marginTop: 14 }}>
            Can't reach the backend server. Start it with <code>npm run dev</code> in <code>/server</code>. The app still
            works locally; integrations need the server.
          </div>
        ) : (
          <div className="int-status" style={{ marginTop: 14 }}>
            <Dot on={synced} label="Cloud sync on" off="Local only" />
            <Dot on={status?.ai} label="AI configured" />
            <Dot on={status?.sms} label="Twilio SMS live" off="SMS dev-mock" />
            <Dot on={status?.email} label="Email poller live" off="Poller dormant" />
          </div>
        )}
      </div>

      <PaymentHandles state={state} dispatch={dispatch} />
      <SmsTemplate state={state} dispatch={dispatch} />
      <EmailPipeline emailModel={status?.emailModel} />
      <SmsHistory />
      <DevConsole />
    </div>
  )
}

// ── Dev Console: live feed of every integration trigger (photo / email / SMS) ──
// Works in dev-mock too, so you can verify every integration is wired up without spending money.
const KIND_META = {
  photo: { icon: '📷', label: 'Image' },
  email: { icon: '📧', label: 'Email' },
  sms: { icon: '💬', label: 'SMS' },
}

function DevConsole() {
  const [events, setEvents] = useState([])
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(true)

  const load = () => {
    setBusy(true)
    fetchConsoleEvents()
      .then((r) => setEvents(r.events || []))
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  useEffect(() => {
    load()
  }, [])
  useEffect(() => {
    if (!auto) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [auto])

  const shown = events.filter((e) => filter === 'all' || e.kind === filter)
  const counts = events.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] || 0) + 1 }), {})

  return (
    <div className="card card-pad">
      <div className="spread wrap" style={{ gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>🖥️ Console</h3>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Every photo, email, and SMS trigger — with the model that handled it. Logs in dev-mock too, so you can confirm
            all integrations are wired without spending anything.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto
          </label>
          <button className="btn btn-sm" onClick={load} disabled={busy}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="console-tabs">
        {[
          ['all', `All (${events.length})`],
          ['photo', `📷 ${counts.photo || 0}`],
          ['email', `📧 ${counts.email || 0}`],
          ['sms', `💬 ${counts.sms || 0}`],
        ].map(([k, label]) => (
          <button key={k} className={`console-tab${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="muted" style={{ fontSize: 12.5, padding: '14px 2px' }}>
          No triggers yet. Import a photo, send a reminder, or run the 🧪 Simulate email tool above — each one appears here
          instantly, even without any API keys.
        </div>
      ) : (
        <div className="console-feed">
          {shown.map((e) => (
            <div className="console-event" key={e.id}>
              <button className="console-row" onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}>
                <span className="console-kind">{KIND_META[e.kind]?.icon || '•'}</span>
                <span className="console-summary">{e.summary}</span>
                <span className={`cbadge ${e.mock ? 'mock' : 'live'}`}>{e.mock ? 'mock' : 'live'}</span>
                <span className="cbadge model">{e.model || '—'}</span>
                <span className="console-time">
                  {new Date(e.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </button>
              {open[e.id] && <pre className="console-detail">{JSON.stringify(e.detail, null, 2)}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Studio payment handles ───────────────────────────────────────────────────
function PaymentHandles({ state, dispatch }) {
  const h = state.config?.paymentHandles || {}
  const set = (key, value) => dispatch({ type: 'SET_CONFIG', patch: { paymentHandles: { [key]: value } } })
  const field = (key, label, ph) => (
    <div className="field">
      <label className="label">{label}</label>
      <input className="input" value={h[key] || ''} placeholder={ph} onChange={(e) => set(key, e.target.value)} />
    </div>
  )
  return (
    <div className="card card-pad">
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Studio payment handles</h3>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Where parents send money. These fill the <code>{'{payVia}'}</code> part of reminder texts.
      </div>
      <div className="settings-fields">
        {field('venmo', 'Venmo', '@OratorAcademy')}
        {field('zelle', 'Zelle', 'pay@oratoracademy.com')}
        {field('paypal', 'PayPal', 'paypal.me/oratoracademy')}
      </div>
    </div>
  )
}

// ── SMS message template ─────────────────────────────────────────────────────
function SmsTemplate({ state, dispatch }) {
  const [draft, setDraft] = useState(state.config?.smsTemplate || DEFAULT_SMS_TEMPLATE)
  const commit = () => dispatch({ type: 'SET_CONFIG', patch: { smsTemplate: draft } })

  // Live preview against the first student with a balance (or just the first student).
  const previewId = useMemo(() => {
    const active = state.students.filter((s) => !s.archived)
    return active[0]?.id
  }, [state.students])
  const preview = previewId
    ? buildReminderMessage({ ...state, config: { ...state.config, smsTemplate: draft } }, previewId, nowOf(state))
    : ''

  return (
    <div className="card card-pad">
      <div className="spread">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Payment-reminder text</h3>
        <button
          className="btn btn-sm"
          onClick={() => {
            setDraft(DEFAULT_SMS_TEMPLATE)
            dispatch({ type: 'SET_CONFIG', patch: { smsTemplate: DEFAULT_SMS_TEMPLATE } })
          }}
        >
          Reset to default
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>
        Placeholders: <code>{'{student}'}</code> <code>{'{amount}'}</code> <code>{'{outstanding}'}</code>{' '}
        <code>{'{payVia}'}</code> <code>{'{studio}'}</code> <code>{'{venmo}'}</code> <code>{'{zelle}'}</code>{' '}
        <code>{'{paypal}'}</code>
      </div>
      <textarea
        className="textarea"
        style={{ minHeight: 90 }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      {preview && (
        <div className="int-preview">
          <div className="sub-label" style={{ marginBottom: 4 }}>Preview</div>
          {preview}
        </div>
      )}
    </div>
  )
}

// ── Gmail payment auto-apply: status, needs-attention, audit, dev tools ───────
function EmailPipeline({ emailModel }) {
  const { state } = useStore()
  const [audit, setAudit] = useState([])
  const [needs, setNeeds] = useState([])
  const [captured, setCaptured] = useState([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    try {
      const [a, n, c] = await Promise.all([fetchAuditLog(), fetchNeedsAttention(), fetchCapturedEmails()])
      setAudit(a.audit || [])
      setNeeds(n.items || [])
      setCaptured(c.emails || [])
    } catch {
      /* server down — leave empty */
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const nameFor = (id) => (id ? studentName(studentById(state, id)) : '—')
  const applied = audit.filter((a) => a.type === 'email-payment')

  const undo = async (paymentId) => {
    try {
      await undoAutoPayment(paymentId)
      await load()
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card card-pad">
      <div className="spread">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Gmail payment auto-apply</h3>
        <button className="btn btn-sm" onClick={load} disabled={busy}>
          ↻ Refresh
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Forwarded Venmo/PayPal/Zelle emails are read by {emailModel || 'Claude Haiku'} and auto-applied to the matching
        student (parents put the student's name in the memo). A built-in regex fallback handles PayPal/Venmo offline when
        no API key is set.
      </div>

      <SimulateEmail onDone={load} />

      {/* Needs attention */}
      <div className="sub-label" style={{ marginTop: 18 }}>Needs attention ({needs.length})</div>
      {needs.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5 }}>Nothing flagged. No-match / refund / unreadable emails show up here.</p>
      ) : (
        <div className="int-rows">
          {needs.map((it) => (
            <div className="int-row warn" key={it.key}>
              <div>
                <strong>{it.provider}</strong> · ${Number(it.amount || 0).toFixed(2)} · {it.date}
              </div>
              <span className="int-tag">{it.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Auto-applied audit */}
      <div className="sub-label" style={{ marginTop: 18 }}>Auto-applied payments ({applied.length})</div>
      {applied.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5 }}>None yet.</p>
      ) : (
        <div className="int-rows">
          {applied.map((a) => {
            const p = a.data?.payment || {}
            return (
              <div className={`int-row${a.undone ? ' undone' : ''}`} key={a.id}>
                <div>
                  <strong>${Number(p.amount || 0).toFixed(2)}</strong> → {nameFor(p.studentId)}
                  <span className="muted" style={{ marginLeft: 8, fontSize: 11.5 }}>
                    {p.emailRef?.provider} · {p.dateReceived}
                    {p.emailRef?.memo ? ` · "${p.emailRef.memo.slice(0, 40)}"` : ''}
                  </span>
                </div>
                {a.undone ? (
                  <span className="int-tag">undone</span>
                ) : (
                  <button className="btn btn-sm" onClick={() => undo(a.paymentId)}>
                    Undo
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Captured emails (dev pipeline proof) */}
      {captured.length > 0 && (
        <>
          <div className="sub-label" style={{ marginTop: 18 }}>Captured emails (dev) — last {captured.length}</div>
          <div className="int-rows">
            {captured.map((c) => (
              <div className="int-row" key={c.id}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{c.subject || '(no subject)'}</div>
                  <div className="muted int-snippet">{c.snippet}</div>
                  {c.createdAt && (
                    <div className="muted" style={{ fontSize: 11 }}>
                      🕓 {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <span className="int-tag">{c.parsed?.flagged ? c.parsed.reason : c.parsed?.provider}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Dev tool: push a fake email through the real pipeline so the whole loop is provable
// before a real Gmail forward is wired up.
function SimulateEmail({ onDone }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('Venmo <venmo@venmo.com>')
  const [subject, setSubject] = useState('Jordan paid you $40.00')
  const [text, setText] = useState('Jordan Reyes paid you $40.00\nNote: Jordan June classes\nPayment ID: 1234567890')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    setOut(null)
    try {
      const res = await simulateEmail({ from, subject, text, messageId: `sim-${Date.now()}@local` })
      setOut(res)
      onDone?.()
    } catch (e) {
      setOut({ status: 'error', error: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        🧪 Test the pipeline with a sample email
      </button>
    )

  return (
    <div className="int-sim">
      <div className="sub-label">Simulate a forwarded email</div>
      <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
      <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={{ marginTop: 8 }} />
      <textarea className="textarea" style={{ minHeight: 80, marginTop: 8 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Body" />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={busy}>
          {busy ? 'Running…' : 'Run through pipeline'}
        </button>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {out && (
        <div className={`int-sim-out ${out.status === 'applied' ? 'ok' : out.status === 'error' ? 'err' : 'warn'}`}>
          <strong>{out.status}</strong>
          {out.status === 'applied' && ` — $${Number(out.parsed?.amount || 0).toFixed(2)} applied`}
          {out.status === 'no-match' && ' — parsed, but no student matched the memo'}
          {out.status === 'flagged' && ` — ${out.reason}`}
          {out.status === 'duplicate' && ' — already processed (idempotency works ✅)'}
          {out.error && ` — ${out.error}`}
        </div>
      )}
    </div>
  )
}

// ── SMS send history ─────────────────────────────────────────────────────────
function SmsHistory() {
  const { state } = useStore()
  const [sends, setSends] = useState([])
  useEffect(() => {
    fetchSmsLog()
      .then((r) => setSends(r.sends || []))
      .catch(() => {})
  }, [])
  if (sends.length === 0) return null
  const nameFor = (id) => (id ? studentName(studentById(state, id)) : '—')
  return (
    <div className="card card-pad">
      <h3 style={{ fontSize: 15, marginBottom: 10 }}>Recent reminder texts</h3>
      <div className="int-rows">
        {sends.slice(0, 8).map((s) => (
          <div className="int-row" key={s.id}>
            <div style={{ minWidth: 0 }}>
              <strong>{nameFor(s.studentId)}</strong> <span className="muted">· {s.to}</span>
              <div className="muted int-snippet">{s.body}</div>
            </div>
            <span className="int-tag">{s.mock ? 'mock' : s.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
