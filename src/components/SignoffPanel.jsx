import { useState } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { CPAS, isReady } from '../lib/signoffs.js'
import { useSignoffs } from '../lib/useSignoffs.js'

const when = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// Shown under the toolbar on every tool: who has tested it, and buttons for
// each CPA to sign off (or withdraw). Open during the beta — no login.
export default function SignoffPanel({ tool }) {
  const { signoffs, loaded, signOff, withdraw } = useSignoffs()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const mine = signoffs[tool.id] || []
  const ready = isReady(tool, signoffs)

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
    <div className={`signoff no-print${ready ? ' is-ready' : ''}`}>
      <div className="signoff-status">
        {ready ? (
          <>
            <CheckCircle2 size={16} />
            <span>
              <strong>Ready for clients.</strong>{' '}
              {mine.length ? `Tested and signed off by ${mine.map((s) => s.cpa).join(', ')}.` : 'Reviewed with Grott Luker & Co.'}
            </span>
          </>
        ) : (
          <>
            <Circle size={16} />
            <span>
              <strong>Not yet reviewed.</strong> {loaded ? 'No Grott Luker CPA has signed off on this tool yet — not client ready.' : 'Checking…'}
            </span>
          </>
        )}
      </div>
      <div className="signoff-actions">
        <span className="signoff-label">Tested it and believe it is ready? Sign off as</span>
        {CPAS.map((cpa) => {
          const s = mine.find((x) => x.cpa === cpa)
          return (
            <button
              key={cpa}
              type="button"
              className={`signoff-btn${s ? ' on' : ''}`}
              onClick={() => toggle(cpa)}
              disabled={busy !== ''}
              title={s ? `Signed off ${when(s.created_at)} — click to withdraw` : `Sign off as ${cpa}`}
            >
              {busy === cpa ? <Loader2 size={13} className="spin" /> : s ? <CheckCircle2 size={13} /> : <Circle size={13} />}
              {cpa}
              {s ? <small>{when(s.created_at)}</small> : null}
            </button>
          )
        })}
      </div>
      {error ? <div className="form-error" style={{ marginTop: 8 }}>{error}</div> : null}
    </div>
  )
}
