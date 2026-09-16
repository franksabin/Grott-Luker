import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, Send } from 'lucide-react'
import { Panel, Field, Note } from '../components/ui.jsx'
import { QUESTIONS, RATINGS, TOOL_COUNT, DEV_COUNT, blankAnswers, FEEDBACK_LIMITS } from '../lib/feedback.js'
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

function RatingGrid({ q, value, onRate }) {
  const rated = Object.keys(value).length
  let lastGroup = null
  return (
    <div className="rating">
      <div className="rating-legend">
        <span />
        {RATINGS.map((r) => <span key={r.id}>{r.label}</span>)}
      </div>
      {q.options.map((t) => {
        const head = t.group !== lastGroup ? <div className="rating-group" key={`g-${t.group}`}>{t.groupTitle}</div> : null
        lastGroup = t.group
        return (
          <div key={t.id} style={{ display: 'contents' }}>
            {head}
            <div className={`rating-row${value[t.id] !== undefined ? ' rated' : ''}`}>
              <div className="rating-tool">
                <span className="rating-title">{t.label}</span>
                {t.status === 'testing' ? <span className="rating-dev">In development</span> : null}
              </div>
              <div className="rating-opts" role="radiogroup" aria-label={t.label}>
                {RATINGS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={value[t.id] === r.id}
                    className={`rating-btn r${r.id}${value[t.id] === r.id ? ' on' : ''}`}
                    onClick={() => onRate(t.id, value[t.id] === r.id ? undefined : r.id)}
                    title={r.label}
                  >
                    <span className="rating-btn-long">{r.label}</span>
                    <span className="rating-btn-short">{r.short}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })}
      <div className="poll-counter">{rated} of {q.options.length} tools rated</div>
    </div>
  )
}

export default function Feedback() {
  const [a, setA] = useState(blankAnswers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const set = (k) => (v) => setA((s) => ({ ...s, [k]: v }))

  const rate = (toolId, v) =>
    setA((s) => {
      const next = { ...s.toolInterest }
      if (v === undefined) delete next[toolId]
      else next[toolId] = v
      return { ...s, toolInterest: next }
    })

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
          This is a brand-new experiment, and we want to know which of these{' '}
          {TOOL_COUNT} tools would actually earn a place in your practice. Rate the ones
          you have an opinion on, skip the rest, and tell us what's missing.
          Then we'd like to pair each of you with a handful of the tools you rated
          highest and refine them together, one on one — so please include your name.
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

            {q.type === 'rating' ? (
              <RatingGrid q={q} value={a[q.id]} onRate={rate} />
            ) : q.type === 'text' ? (
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

        <Panel title="Who's answering">
          <p className="poll-who-note">Your name lets us pair you with the tools you rated highest. Email is only for follow-up.</p>
          <div className="field-row">
            <Field label="Name" hint="Needed for pairing.">
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
          There are {TOOL_COUNT} tools here and {DEV_COUNT} are still baseline models. Your
          ratings decide which get finished and reviewed first, which get
          reworked, and which get retired — and your ideas set what gets built
          next.
        </Note>
      </div>
    </div>
  )
}
