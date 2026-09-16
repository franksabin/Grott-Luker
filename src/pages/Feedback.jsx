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

function CpaToolReview({ tool, index, notes, asIs, refine, onNotes, onAsIs, onRefine }) {
  return (
    <Panel>
      <div className="poll-q">
        <span className="poll-num">{String(index + 1).padStart(2, '0')}</span>
        <div className="poll-q-text">
          <h3>
            {tool.label}
            {tool.planned ? <span className="rating-dev">Planned</span> : tool.status === 'testing' ? <span className="rating-dev">Baseline model</span> : <span className="spec-live">Live</span>}
          </h3>
          <p>{tool.model}</p>
        </div>
      </div>
      <div className="spec-grid">
        <div>
          <div className="spec-head">Inputs</div>
          <ul className="spec-list">{tool.inputs.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <div className="spec-head">Outputs</div>
          <ul className="spec-list">{tool.outputs.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
      <div className="spec-ask">
        <label className="field-label" htmlFor={`notes-${tool.id}`}>
          {tool.planned ? 'What should this tool cover when we build it? Anything to add or leave out?' : 'What should be added, changed, or included?'}
        </label>
        <textarea
          id={`notes-${tool.id}`}
          className="input poll-textarea"
          rows={3}
          maxLength={FEEDBACK_LIMITS.text}
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder={tool.planned ? 'Situations you see, inputs we would need, what the client should walk away with…' : 'Missing inputs, outputs you would want on the page, situations it does not handle, wording…'}
        />
        <div className="spec-checks">
          {!tool.planned ? <Choice checked={asIs} onChange={onAsIs}>Works as is</Choice> : null}
          <Choice checked={refine} onChange={onRefine}>I’d help refine this one</Choice>
          <Link to={tool.path} target="_blank" rel="noopener noreferrer" className="spec-open">
            Open the tool <ExternalLink size={12} />
          </Link>
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
  const set = (k) => (v) => setA((s) => ({ ...s, [k]: v }))
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

  const answeredTools = CPA_TOOLS.filter((t) => a.toolNotes[t.id] || a.toolAsIs.includes(t.id) || a.toolRefine.includes(t.id)).length

  return (
    <div>
      <Link to="/" className="backlink">
        <ArrowLeft size={15} /> Back to toolkit
      </Link>

      <div className="tool-header">
        <div className="eyebrow-e">CPA review</div>
        <h1>Start with the CPA tools.</h1>
        <p className="tool-sub">
          These {CPA_COUNT} tools are yours, so they get the close look. For each one we describe
          what it models, what it takes in, and what it gives back. Tell us what to add,
          change, or include. Every tool matters, so there is nothing to grade. Then one
          quick question for each of the other sections. Ten minutes, give or take.
        </p>
      </div>

      <div className="poll">
        <div className="poll-stage">
          <span className="poll-stage-num">Stage 1</span>
          <div>
            <h2>The CPA tools, one at a time</h2>
            <p>Open any tool in a new tab while you read. Skip anything you have not looked at.</p>
          </div>
        </div>

        {CPA_TOOLS.map((t, i) => (
          <CpaToolReview
            key={t.id}
            tool={t}
            index={i}
            notes={a.toolNotes[t.id] || ''}
            asIs={a.toolAsIs.includes(t.id)}
            refine={a.toolRefine.includes(t.id)}
            onNotes={setNote('toolNotes', t.id)}
            onAsIs={toggleId('toolAsIs', t.id)}
            onRefine={toggleId('toolRefine', t.id)}
          />
        ))}
        <div className="poll-counter">{answeredTools} of {CPA_COUNT} CPA tools reviewed</div>

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
                <span key={t.id} className={`tool-chip${t.status === 'testing' ? ' dev' : ''}`}>{t.label}</span>
              ))}
            </div>
            <label className="field-label" htmlFor={`sec-${s.id}`}>Anything to add or remove? Other thoughts?</label>
            <textarea
              id={`sec-${s.id}`}
              className="input poll-textarea"
              rows={3}
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
            rows={4}
            maxLength={FEEDBACK_LIMITS.text}
            value={a.anythingElse}
            onChange={(e) => set('anythingElse')(e.target.value)}
            placeholder="Type here…"
          />
        </Panel>

        <Panel title="Who's answering">
          <p className="poll-who-note">Your name lets us pair you with the tools you offered to refine. Email is only for follow-up.</p>
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

        <Note title="Why we're asking this way">
          The CPA tools are the ones you will use in front of clients, so they come first
          and in detail. The rest of the toolkit only needs a yes, a no, or an idea. Your
          notes decide what gets added to each tool and what gets built next.
        </Note>
      </div>
    </div>
  )
}
