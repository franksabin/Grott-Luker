import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, Send } from 'lucide-react'
import { Panel, Field, Note } from '../components/ui.jsx'
import { QUESTIONS, blankAnswers, FEEDBACK_LIMITS } from '../lib/feedback.js'
import { submitFeedback } from '../lib/api.js'

function Choice({ type, checked, disabled, onChange, children }) {
  return (
    <label className={`choice${checked ? ' on' : ''}${disabled ? ' off' : ''}`}>
      <input type={type === 'single' ? 'radio' : 'checkbox'} checked={checked} disabled={disabled} onChange={onChange} />
      <span className="choice-box">{checked ? <Check size={12} strokeWidth={3} /> : null}</span>
      <span>{children}</span>
    </label>
  )
}

export default function Feedback() {
  const [a, setA] = useState(blankAnswers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const set = (k) => (v) => setA((s) => ({ ...s, [k]: v }))

  const toggle = (q, id) => {
    const cur = a[q.id]
    if (cur.includes(id)) return set(q.id)(cur.filter((x) => x !== id))
    if (q.type === 'pick3' && cur.length >= q.max) return
    set(q.id)([...cur, id])
  }

  async function send() {
    setBusy(true)
    setError('')
    try {
      await submitFeedback(a)
      setDone(true)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err?.message || 'Could not send your answers. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div>
        <Link to="/" className="backlink">
          <ArrowLeft size={15} /> Back to toolkit
        </Link>
        <div className="poll-thanks">
          <div className="poll-thanks-mark"><Check size={22} strokeWidth={2.5} /></div>
          <h1>Thank you.</h1>
          <p>
            Your answers are in. They go straight to Frank and Jenn and decide what
            gets finished, fixed, or built next. If something comes to mind later,
            email or text — the note at the bottom of the toolkit has both.
          </p>
          <Link to="/" className="btn btn-primary">Back to the toolkit</Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link to="/" className="backlink">
        <ArrowLeft size={15} /> Back to toolkit
      </Link>

      <div className="tool-header">
        <div className="eyebrow-e">CPA roadmap poll</div>
        <h1>What should we focus on next?</h1>
        <p className="tool-sub">
          Two minutes, six questions, nothing required. This is the beta, and what
          you answer here sets the order we finish, fix, and build. Name and email
          are optional — leave them if you'd like us to follow up.
        </p>
      </div>

      <div className="poll">
        {QUESTIONS.map((q, i) => (
          <Panel key={q.id}>
            <div className="poll-q">
              <span className="poll-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="poll-q-text">
                <h3>{q.title}</h3>
                {q.hint ? <p>{q.hint}</p> : null}
              </div>
            </div>

            {q.type === 'text' ? (
              <textarea
                className="input poll-textarea"
                rows={4}
                maxLength={FEEDBACK_LIMITS.text}
                value={a[q.id]}
                onChange={(e) => set(q.id)(e.target.value)}
                placeholder="Type here…"
              />
            ) : (
              <div className={`choice-grid${q.type === 'single' ? ' cols-2' : ''}`}>
                {q.options.map((o) => {
                  const multi = q.type !== 'single'
                  const checked = multi ? a[q.id].includes(o.id) : a[q.id] === o.id
                  const full = q.type === 'pick3' && !checked && a[q.id].length >= q.max
                  return (
                    <Choice
                      key={o.id}
                      type={q.type}
                      checked={checked}
                      disabled={full}
                      onChange={() => (multi ? toggle(q, o.id) : set(q.id)(o.id))}
                    >
                      {o.label}
                    </Choice>
                  )
                })}
              </div>
            )}

            {q.type === 'pick3' ? (
              <div className="poll-counter">{a[q.id].length} of {q.max} chosen</div>
            ) : null}

            {q.other ? (
              <input
                className="input poll-other"
                type="text"
                maxLength={FEEDBACK_LIMITS.otherIdea}
                value={a[q.other.id]}
                onChange={(e) => set(q.other.id)(e.target.value)}
                placeholder={q.other.placeholder}
              />
            ) : null}
          </Panel>
        ))}

        <Panel title="Optional — who's answering">
          <div className="field-row">
            <Field label="Name">
              <input className="input" type="text" maxLength={FEEDBACK_LIMITS.name} value={a.name} onChange={(e) => set('name')(e.target.value)} />
            </Field>
            <Field label="Email" hint="Only if you'd like a reply.">
              <input className="input" type="email" maxLength={FEEDBACK_LIMITS.email} value={a.email} onChange={(e) => set('email')(e.target.value)} />
            </Field>
          </div>
          <Field label="Firm / office">
            <input className="input" type="text" maxLength={FEEDBACK_LIMITS.firm} value={a.firm} onChange={(e) => set('firm')(e.target.value)} />
          </Field>
        </Panel>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="poll-actions">
          <button className="btn btn-primary" onClick={send} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Send answers
          </button>
          <span className="poll-actions-note">Answers are stored with the other beta submissions and read by BlueLine.</span>
        </div>

        <Note title="Why we're asking">
          There are twenty tools here and eleven are still baseline models. Rather
          than guess, we'd like to finish the ones you'll use and stop polishing
          the ones you won't.
        </Note>
      </div>
    </div>
  )
}
