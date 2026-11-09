import { useState } from 'react'
import { CheckCircle2, Circle, Loader2, AlertTriangle } from 'lucide-react'
import { REVIEWER_GROUPS, MATH_CHANGES, isReady, needsReReview, currentSignoffs, staleSignoffs } from '../lib/signoffs.js'
import { useSignoffs } from '../lib/useSignoffs.js'

const when = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// Shown under the toolbar on every tool: who has tested it, and buttons for
// each CPA to sign off (or withdraw). Open during the beta — no login.
export default function SignoffPanel({ tool }) {
  const { signoffs, loaded, signOff, withdraw } = useSignoffs()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const mine = currentSignoffs(tool.id, signoffs)
  const old = staleSignoffs(tool.id, signoffs)
  const change = MATH_CHANGES[tool.id]
  const ready = isReady(tool, signoffs)
  const again = needsReReview(tool, signoffs)

  const toggle = async (cpa) => {
    setBusy(cpa)
    setError('')
    try {
      if (mine.some((s) => s.cpa === cpa)) await withdraw(tool.id, cpa)
      else await signOff(tool.id, cpa, '')
    } catch (e) {
      setError(e?.message || 'Could not save. Try again.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className={`signoff no-print${ready ? ' is-ready' : again ? ' needs-review' : ''}`}>
      <div className="signoff-status">
        {ready ? (
          <>
            <CheckCircle2 size={16} />
            <span>
              <strong>Ready for clients.</strong>{' '}
              {mine.length ? `Tested and signed off by ${mine.map((s) => s.cpa).join(', ')}.` : 'Reviewed with Grott Luker & Co.'}
              {old.length ? ` ${old.map((s) => s.cpa).join(', ')} signed off before the ${change.label} update.` : ''}
            </span>
          </>
        ) : again ? (
          <>
            <AlertTriangle size={16} />
            <span>
              <strong>Needs re-review.</strong> The calculation changed on {change.label}. {old.map((s) => `${s.cpa} (${when(s.created_at)})`).join(', ')} signed off on the earlier numbers. Look at the new numbers, then sign off again.
            </span>
          </>
        ) : (
          <>
            <Circle size={16} />
            <span>
              <strong>Not yet reviewed.</strong> {loaded ? 'Nobody has signed off on this tool yet — not client ready.' : 'Checking…'}
            </span>
          </>
        )}
      </div>
      <div className="signoff-actions">
        <span className="signoff-label">Tested it and believe it is ready? Sign off as</span>
        {REVIEWER_GROUPS.map((g) => (
          <span key={g.id} className="signoff-grp">
            <span className="signoff-grp-label">{g.label}</span>
            {g.names.map((cpa) => {
              const s = mine.find((x) => x.cpa === cpa)
              const o = !s ? old.find((x) => x.cpa === cpa) : null
              return (
                <button
                  key={cpa}
                  type="button"
                  className={`signoff-btn${s ? ' on' : o ? ' stale' : ''}`}
                  onClick={() => toggle(cpa)}
                  disabled={busy !== ''}
                  title={s ? `Signed off ${when(s.created_at)} — click to withdraw` : o ? `Signed off ${when(o.created_at)}, before the ${change.label} update — click to sign off again` : `Sign off as ${cpa}`}
                >
                  {busy === cpa ? <Loader2 size={13} className="spin" /> : s ? <CheckCircle2 size={13} /> : o ? <AlertTriangle size={13} /> : <Circle size={13} />}
                  {cpa}
                  {s ? <small>{when(s.created_at)}</small> : o ? <small>{when(o.created_at)} · earlier</small> : null}
                </button>
              )
            })}
          </span>
        ))}
      </div>
      {change ? <div className="signoff-note">Updated {change.label}: {change.what}</div> : null}
      {tool.id === 'multi-year-projection' ? <div className="signoff-note">This sign-off covers both views: Plan to the end and This year only.</div> : null}
      {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
    </div>
  )
}
