import { useState, useMemo } from 'react'
import { ArrowRight, ArrowLeft, Check, Send, FileDown, Loader2 } from 'lucide-react'
import { Panel, Field, Note, FeatureBlock } from '../components/ui.jsx'
import KynInputs from '../components/KynInputs.jsx'
import KynSnapshot from '../components/KynSnapshot.jsx'
import { BLANK, compute, hasAnyFigures, isValidEmail } from '../lib/knowYourNumbers.js'
import { submitSnapshot } from '../lib/api.js'
import { money } from '../lib/format.js'

const STEPS = ['Your details', 'Your numbers', 'Done']

function Stepper({ current }) {
  return (
    <ol className="stepper no-print">
      {STEPS.map((label, i) => {
        const state = i < current ? 'is-done' : i === current ? 'is-current' : ''
        return (
          <li key={label} className={`step ${state}`.trim()}>
            <span className="step-dot">{i < current ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
            <span className="step-label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

export default function ClientKnowYourNumbers() {
  const [step, setStep] = useState(0)
  const [contact, setContact] = useState({ name: '', email: '', phone: '', notes: '' })
  const [form, setForm] = useState(BLANK)
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const setC = (k) => (v) => setContact((c) => ({ ...c, [k]: v }))
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  const nameOk = contact.name.trim().length >= 2
  const emailOk = isValidEmail(contact.email)
  const contactOk = nameOk && emailOk

  function goToNumbers() {
    setTouched(true)
    if (!contactOk) return
    setError('')
    setStep(1)
    window.scrollTo(0, 0)
  }

  async function handleSubmit() {
    if (submitting) return
    if (!hasAnyFigures(form)) {
      setError('Please enter at least one figure before submitting.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await submitSnapshot({
        name: contact.name.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        notes: contact.notes.trim(),
        figures: form,
      })
      setStep(2)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(
        err?.message ||
          'Something went wrong sending your information. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------------- Step 3: submitted ---------------- */
  if (step === 2) {
    return (
      <div>
        <div className="client-hero no-print">
          <div className="client-hero-badge">
            <Check size={16} strokeWidth={3} />
          </div>
          <h1>Thank you, {contact.name.trim().split(' ')[0]}.</h1>
          <p className="subhead">
            Your financial snapshot has been sent to Grott Luker &amp; Co. Someone
            from the team will follow up with you. Your copy is below — you can
            print it or save it as a PDF for your records.
          </p>
          <div className="toolbar" style={{ justifyContent: 'center', marginTop: 6 }}>
            <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
              <FileDown size={15} /> Print / Save as PDF
            </button>
          </div>
        </div>

        <KynSnapshot form={form} clientName={contact.name.trim()} />
      </div>
    )
  }

  /* ---------------- Steps 1 & 2 ---------------- */
  return (
    <div>
      <div className="client-hero no-print">
        <h1>Know Your Numbers</h1>
        <p className="subhead">
          A short, private questionnaire that builds a clear one-page picture of
          where your finances stand today. It takes about five minutes, and
          approximate figures are perfectly fine.
        </p>
      </div>

      <Stepper current={step} />

      {step === 0 ? (
        <div className="client-form-wrap">
          <Panel title="Your details">
            <Field label="Full name">
              <input
                className="input"
                type="text"
                autoComplete="name"
                value={contact.name}
                onChange={(e) => setC('name')(e.target.value)}
                placeholder="Jane Smith"
              />
              {touched && !nameOk ? (
                <div className="field-error">Please enter your name.</div>
              ) : null}
            </Field>
            <Field label="Email address">
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={contact.email}
                onChange={(e) => setC('email')(e.target.value)}
                placeholder="jane@example.com"
              />
              {touched && !emailOk ? (
                <div className="field-error">Please enter a valid email address.</div>
              ) : null}
            </Field>
            <Field label="Phone (optional)">
              <input
                className="input"
                type="tel"
                autoComplete="tel"
                value={contact.phone}
                onChange={(e) => setC('phone')(e.target.value)}
                placeholder="(603) 555-0123"
              />
            </Field>
            <Field
              label="Anything you'd like us to know? (optional)"
              hint="A question, a goal, or context you want covered in the meeting."
            >
              <textarea
                className="input textarea"
                rows={3}
                value={contact.notes}
                onChange={(e) => setC('notes')(e.target.value)}
              />
            </Field>

            <button className="btn btn-primary btn-block" onClick={goToNumbers}>
              Continue to your numbers <ArrowRight size={16} />
            </button>
          </Panel>

          <Note title="How your information is handled">
            Your responses are sent securely to Grott Luker &amp; Co. and used only
            to prepare for your planning conversation. Please enter approximate,
            rounded figures — and never include Social Security numbers, account
            numbers, or passwords.
          </Note>
        </div>
      ) : (
        <div>
          <div className="client-running-total no-print">
            <FeatureBlock
              label="Net worth so far"
              value={money(r.netWorth)}
              note={`${money(r.totalAssets)} in assets · ${money(r.totalLiabilities)} in liabilities · updates as you type`}
            />
          </div>

          <KynInputs form={form} set={set} />

          {error ? <div className="form-error no-print">{error}</div> : null}

          <div className="client-submit-bar no-print">
            <button
              className="btn btn-subtle btn-sm"
              onClick={() => {
                setStep(0)
                window.scrollTo(0, 0)
              }}
              disabled={submitting}
            >
              <ArrowLeft size={15} /> Back
            </button>
            <span className="toolbar-spacer" />
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={16} className="spin" /> Sending…
                </>
              ) : (
                <>
                  <Send size={16} /> Send to Grott Luker &amp; Co.
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
