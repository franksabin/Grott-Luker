import { useEffect, useState } from 'react'
import { Check, Send, FileDown, Loader2, Save } from 'lucide-react'
import { Panel, Field, Note } from '../components/ui.jsx'
import { MileageEditor, MileageReport } from '../components/MileageEditor.jsx'
import { blankLog, hasAnyEntries, compute } from '../lib/mileage.js'
import { isValidEmail } from '../lib/knowYourNumbers.js'
import { submitMileageLog } from '../lib/api.js'
import { money, number } from '../lib/format.js'

const STORE_KEY = 'gl-mileage-log-client'

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.log?.trips) return parsed
    }
  } catch {
    /* ignore */
  }
  return { contact: { name: '', email: '', phone: '', notes: '' }, log: blankLog() }
}

export default function ClientMileageLog() {
  const [state, setState] = useState(load)
  const { contact, log } = state
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [savedTick, setSavedTick] = useState(false)

  const setContact = (k) => (v) => setState((s) => ({ ...s, contact: { ...s.contact, [k]: v } }))
  const setLog = (updater) =>
    setState((s) => ({ ...s, log: typeof updater === 'function' ? updater(s.log) : updater }))

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state))
      setSavedTick(true)
      const t = setTimeout(() => setSavedTick(false), 900)
      return () => clearTimeout(t)
    } catch {
      /* ignore */
    }
  }, [state])

  const nameOk = contact.name.trim().length >= 2
  const emailOk = isValidEmail(contact.email)
  const r = compute(log)

  async function handleSubmit() {
    setTouched(true)
    if (!nameOk || !emailOk) {
      setError('Please enter your name and a valid email so we know whose log this is.')
      return
    }
    if (!hasAnyEntries(log)) {
      setError('Add at least one trip or expense before submitting.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await submitMileageLog({
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        notes: contact.notes,
        taxYear: log.taxYear,
        trips: log.trips,
        expenses: log.expenses,
      })
      setDone(res?.id || true)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div>
        <div className="tool-header">
          <h1>Sent to Grott Luker &amp; Co.</h1>
          <p className="tool-sub">
            Thank you, {contact.name.split(' ')[0]}. Your {log.taxYear} mileage and expense log has been received —{' '}
            {number(r.totalMiles)} miles and {money(r.estimatedDeduction, 2)} in estimated deductions.
          </p>
        </div>
        <div className="toolbar no-print">
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            <FileDown size={15} /> Print / Save a copy
          </button>
          <span className="toolbar-spacer" />
          <button className="btn btn-subtle btn-sm" onClick={() => setDone(null)}>
            Keep logging
          </button>
        </div>
        <MileageReport log={log} clientName={contact.name} />
        <Note title="Your log stays on this device">
          You can keep adding trips and submit again later — the latest submission is the one your CPA will use.
        </Note>
      </div>
    )
  }

  return (
    <div>
      <div className="tool-header">
        <h1>Mileage &amp; Expense Log</h1>
        <p className="tool-sub">
          Keep track of business, charity, and medical miles plus meals through the year. Everything is saved on this device as you type; when you’re ready — usually in January — send it to Grott Luker &amp; Co. with one click.
        </p>
      </div>

      <div className="toolbar no-print" style={{ marginTop: 0 }}>
        <span className="timestamp" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {savedTick ? <Check size={13} /> : <Save size={13} />} Saved on this device
        </span>
        <span className="toolbar-spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
          <FileDown size={15} /> Print
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
          {submitting ? 'Sending…' : 'Send to Grott Luker'}
        </button>
      </div>

      <Panel title="Your details" style={{ marginBottom: 18 }}>
        <div className="grid-2">
          <Field label="Name" hint={touched && !nameOk ? 'Please enter your name.' : undefined}>
            <input className="input" value={contact.name} onChange={(e) => setContact('name')(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" hint={touched && !emailOk ? 'Please enter a valid email.' : undefined}>
            <input className="input" type="email" value={contact.email} onChange={(e) => setContact('email')(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Phone (optional)">
            <input className="input" type="tel" value={contact.phone} onChange={(e) => setContact('phone')(e.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Note to your CPA (optional)">
            <input className="input" value={contact.notes} onChange={(e) => setContact('notes')(e.target.value)} placeholder="Anything worth flagging" />
          </Field>
        </div>
      </Panel>

      <MileageEditor log={log} setLog={setLog} className="no-print" />

      {error ? <div className="form-error">{error}</div> : null}

      <div className="toolbar no-print">
        <span className="toolbar-spacer" />
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
          {submitting ? 'Sending…' : 'Send to Grott Luker & Co.'}
        </button>
      </div>

      <MileageReport log={log} clientName={contact.name || undefined} />

      <Note title="About this log">
        Estimates use IRS standard mileage rates by trip date and general meal rules. It is not tax advice — your CPA will review it with your return. Keep receipts for any single expense of $75 or more.
      </Note>
    </div>
  )
}
