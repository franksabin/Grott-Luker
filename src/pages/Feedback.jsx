import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, Send, ExternalLink } from 'lucide-react'
import { Panel, Field, Note } from '../components/ui.jsx'
import { CPA_TOOLS, SECTIONS, CPA_COUNT, blankAnswers, FEEDBACK_LIMITS } from '../lib/feedback.js'
import { submitFeedback } from '../lib/api.js'

function Choice({ checked, onChange, children }) {
  return (
    <label className={`choice${checked ? ' on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="choice-box">{checked ? <Check size={12} strokeWidth={3} /> : null}</span>
      <span>{children}</span>
    </label>
  )
}

function CpaToolReview({ tool, index, notes, asIs, onNotes, onAsIs }) {
  const openHref = tool.planned ? tool.path : `${tool.path}?sample=1`
  return (
    <Panel>
      <div className="poll-q">
        <span className="poll-num">{String(index + 1).padStart(2, '0')}</span>
        <div className="poll-q-text">
          <h3>
            {tool.label}
            {tool.planned ? <span className="rating-dev">Planned</span> : <span className="rating-dev">Baseline model</span>}
          </h3>
          <p>{tool.quick}</p>
        </div>
      </div>
      {tool.shot ? (
        <a className="shot" href={openHref} target="_blank" rel="noopener noreferrer" title="Open the tool with this sample loaded">
          <img src={tool.shot} alt={`${tool.label} report with sample data`} loading="lazy" />
          <span className="shot-cap">Report with sample data · open the tool <ExternalLink size={12} /></span>
        </a>
      ) : (
        <p className="hint" style={{ margin: '6px 0 12px' }}>
          Not built yet. <Link to={tool.path} target="_blank" rel="noopener noreferrer">Read the plan <ExternalLink size={11} /></Link>
        </p>
      )}
      <div className="spec-ask">
        <label className="field-label" htmlFor={`notes-${tool.id}`}>
          {tool.planned ? 'Quick take: what should it cover, or leave out?' : 'Quick assessment: what would you add or change?'}
        </label>
        <textarea
          id={`notes-${tool.id}`}
          className="input poll-textarea"
          rows={2}
          maxLength={FEEDBACK_LIMITS.text}
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder={tool.planned ? 'Situations you see, what the client should walk away with…' : 'A missing input, a number you would want on the page, a case it does not handle…'}
        />
        <div className="spec-checks">
          {!tool.planned ? <Choice checked={asIs} onChange={onAsIs}>Works as is</Choice> : null}
        </div>
      </div>
    </Panel>
  )
}

export default function Feedback() {
  const [a, setA] = useState(blankAnswers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const set = (k) => (v) => setA((s) => ({ ...s, [k]: typeof v === 'function' ? v(s[k]) : v }))
  const setNote = (bag, id) => (v) => setA((s) => ({ ...s, [bag]: { ...s[bag], [id]: v } }))
  const toggleId = (bag, id) => () =>
    setA((s) => ({ ...s, [bag]: s[bag].includes(id) ? s[bag].filter((x) => x !== id) : [...s[bag], id] }))

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
            Your notes go straight to Frank and Jenn and set what gets added,
            changed, and built next. If something comes to mind later, email or
            text — the note at the bottom of the toolkit has both.
          </p>
          <Link to="/" className="btn btn-primary">Back to the toolkit</Link>
        </div>
      </div>
    )
  }

  const answeredTools = CPA_TOOLS.filter((t) => a.toolNotes[t.id] || a.toolAsIs.includes(t.id)).length

  return (
    <div>
      <Link to="/" className="backlink">
        <ArrowLeft size={15} /> Back to toolkit
      </Link>

      <div className="tool-header">
        <div className="eyebrow-e">CPA review</div>
        <h1>Start with the CPA tools.</h1>
        <p className="tool-sub">
          Before your working session, spend ten minutes here on the tools you have been
          paired with, and any others you have a view on. Each of the {CPA_COUNT} CPA tools
          below is a sentence and a picture of its report with sample data loaded. Give us a
          quick assessment, or check “works as is.” Then one question for each of the other
          sections.
        </p>
      </div>

      <div className="poll">
        <div className="poll-stage">
          <span className="poll-stage-num">Stage 1</span>
          <div>
            <h2>The CPA tools</h2>
            <p>Click any picture to open the tool with the same sample loaded. Skip anything you have not looked at.</p>
          </div>
        </div>

        {CPA_TOOLS.map((t, i) => (
          <CpaToolReview
            key={t.id}
            tool={t}
            index={i}
            notes={a.toolNotes[t.id] || ''}
            asIs={a.toolAsIs.includes(t.id)}
            onNotes={setNote('toolNotes', t.id)}
            onAsIs={toggleId('toolAsIs', t.id)}
          />
        ))}
        <div className="poll-counter">{answeredTools} of {CPA_COUNT} CPA tools assessed</div>

        <div className="poll-stage">
          <span className="poll-stage-num">Stage 2</span>
          <div>
            <h2>The other sections, quickly</h2>
            <p>These are BlueLine’s tools for your clients. No need to rate them. Just tell us what to add or drop.</p>
          </div>
        </div>

        {SECTIONS.map((s) => (
          <Panel key={s.id}>
            <div className="poll-q">
              <div className="poll-q-text">
                <h3>{s.title}</h3>
                <p>{s.description.replace(/^BlueLine Advisors · /, '')}</p>
              </div>
            </div>
            <div className="tool-chips">
              {s.tools.map((t) => (
                <span key={t.id} className="tool-chip">{t.label}</span>
              ))}
            </div>
            <label className="field-label" htmlFor={`sec-${s.id}`}>Anything to add or remove? Other thoughts?</label>
            <textarea
              id={`sec-${s.id}`}
              className="input poll-textarea"
              rows={2}
              maxLength={FEEDBACK_LIMITS.text}
              value={a.sectionNotes[s.id] || ''}
              onChange={(e) => setNote('sectionNotes', s.id)(e.target.value)}
              placeholder="A tool your clients ask for, one that does not belong here, a question you keep getting…"
            />
          </Panel>
        ))}

        <Panel>
          <div className="poll-q">
            <div className="poll-q-text">
              <h3>Anything else?</h3>
              <p>Something we have not asked about. A tool, a situation, a way you would use this with a client.</p>
            </div>
          </div>
          <textarea
            className="input poll-textarea"
            rows={3}
            maxLength={FEEDBACK_LIMITS.text}
            value={a.anythingElse}
            onChange={(e) => set('anythingElse')(e.target.value)}
            placeholder="Type here…"
          />
        </Panel>

        <Panel title="Who's answering">
          <p className="poll-who-note">Your name ties your notes to your session. Email is only for follow-up.</p>
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

        <Note title="Why we're asking this way">
          The CPA tools are the ones you will use in front of clients, so they come first.
          Every one of them was rebuilt this week and none has been reviewed yet, which is
          why each carries the baseline-model mark. Your notes here are what we work from in
          the sessions, so the time is spent fixing, not explaining.
        </Note>
      </div>
    </div>
  )
}
