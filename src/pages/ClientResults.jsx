import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Lock,
  RefreshCw,
  Eye,
  FileDown,
  Link2,
  Check,
  Loader2,
  Inbox,
} from 'lucide-react'
import { Panel, Field, Note } from '../components/ui.jsx'
import KynSnapshot from '../components/KynSnapshot.jsx'
import {
  listSnapshots,
  getSnapshot,
  getPasscode,
  setPasscode as persistPasscode,
  clearPasscode,
} from '../lib/api.js'
import { money } from '../lib/format.js'
import { compute } from '../lib/knowYourNumbers.js'

const CLIENT_PATH = '/client/know-your-numbers'

function formatWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/* Passcode gate. */
function Gate({ onUnlock, error, busy }) {
  const [code, setCode] = useState('')
  return (
    <div className="gate-wrap">
      <Panel>
        <div className="gate-icon">
          <Lock size={20} strokeWidth={1.8} />
        </div>
        <h2 className="gate-title">Client results</h2>
        <p className="gate-sub">
          Client submissions contain personal financial information. Enter the
          staff passcode to continue.
        </p>
        <Field label="Staff passcode">
          <input
            className="input"
            type="password"
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code) onUnlock(code)
            }}
          />
        </Field>
        {error ? <div className="form-error">{error}</div> : null}
        <button
          className="btn btn-primary btn-block"
          onClick={() => onUnlock(code)}
          disabled={!code || busy}
        >
          {busy ? (
            <>
              <Loader2 size={16} className="spin" /> Checking…
            </>
          ) : (
            'Unlock'
          )}
        </button>
      </Panel>
    </div>
  )
}

export default function ClientResults() {
  const [passcode, setCode] = useState(getPasscode())
  const [unlocked, setUnlocked] = useState(false)
  const [gateError, setGateError] = useState('')
  const [checking, setChecking] = useState(false)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')

  const [active, setActive] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (code) => {
    setLoading(true)
    setListError('')
    try {
      const data = await listSnapshots(code)
      setRows(data?.snapshots || [])
      return true
    } catch (err) {
      if (err?.status === 401) {
        clearPasscode()
        setUnlocked(false)
        setGateError('That passcode was not accepted.')
        return false
      }
      setListError(err?.message || 'Could not load submissions.')
      return true
    } finally {
      setLoading(false)
    }
  }, [])

  // Try a stored passcode from this tab's session on first render.
  useEffect(() => {
    if (!passcode) return
    let cancelled = false
    ;(async () => {
      const ok = await load(passcode)
      if (!cancelled && ok) setUnlocked(true)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUnlock(code) {
    setChecking(true)
    setGateError('')
    try {
      const data = await listSnapshots(code)
      persistPasscode(code)
      setCode(code)
      setRows(data?.snapshots || [])
      setUnlocked(true)
    } catch (err) {
      if (err?.status === 401) setGateError('That passcode was not accepted.')
      else setGateError(err?.message || 'Could not verify the passcode.')
    } finally {
      setChecking(false)
    }
  }

  async function openSnapshot(id) {
    setDetailLoading(true)
    try {
      const data = await getSnapshot(id, passcode)
      setActive(data?.snapshot || null)
      window.scrollTo(0, 0)
    } catch (err) {
      setListError(err?.message || 'Could not open that submission.')
    } finally {
      setDetailLoading(false)
    }
  }

  function copyClientLink() {
    const url = `${window.location.origin}${CLIENT_PATH}`
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => {
        window.prompt('Copy this link and send it to your client:', url)
      },
    )
  }

  if (!unlocked) {
    return (
      <div>
        <Link to="/" className="backlink no-print">
          <ArrowLeft size={15} /> Back to toolkit
        </Link>
        <Gate onUnlock={handleUnlock} error={gateError} busy={checking} />
      </div>
    )
  }

  /* ---------------- Detail view ---------------- */
  if (active) {
    const figures = active.figures || {}
    return (
      <div>
        <button className="backlink no-print" onClick={() => setActive(null)}>
          <ArrowLeft size={15} /> Back to all submissions
        </button>

        <div className="tool-header">
          <h1>{active.name}</h1>
          <p className="tool-sub">
            Submitted {formatWhen(active.created_at)} · {active.email}
            {active.phone ? ` · ${active.phone}` : ''}
          </p>
        </div>

        <div className="toolbar no-print">
          <span className="toolbar-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            <FileDown size={15} /> Print / Save as PDF
          </button>
        </div>

        {active.notes ? (
          <Note title="Client note">{active.notes}</Note>
        ) : null}

        <KynSnapshot
          form={figures}
          clientName={active.name}
          dateLabel={new Date(active.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        />
      </div>
    )
  }

  /* ---------------- List view ---------------- */
  return (
    <div>
      <Link to="/" className="backlink no-print">
        <ArrowLeft size={15} /> Back to toolkit
      </Link>

      <div className="tool-header">
        <h1>Client Results</h1>
        <p className="tool-sub">
          Know Your Numbers snapshots submitted by clients. Send clients the
          questionnaire link and their responses appear here.
        </p>
      </div>

      <div className="toolbar no-print">
        <button className="btn btn-primary btn-sm" onClick={copyClientLink}>
          {copied ? <Check size={15} /> : <Link2 size={15} />}
          {copied ? 'Link copied' : 'Copy client link'}
        </button>
        <a
          className="btn btn-ghost btn-sm"
          href={CLIENT_PATH}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Eye size={15} /> Preview form
        </a>
        <span className="toolbar-spacer" />
        <button
          className="btn btn-subtle btn-sm"
          onClick={() => load(passcode)}
          disabled={loading}
        >
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Refresh
        </button>
      </div>

      {listError ? <div className="form-error no-print">{listError}</div> : null}

      <Panel>
        {loading && rows.length === 0 ? (
          <div className="empty-state">
            <Loader2 size={22} className="spin" />
            <p>Loading submissions…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <Inbox size={26} strokeWidth={1.5} />
            <p>
              No client submissions yet. Use <strong>Copy client link</strong> above
              to send the questionnaire to a client.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Email</th>
                  <th>Submitted</th>
                  <th className="num">Net worth</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.email}</td>
                    <td>{formatWhen(row.created_at)}</td>
                    <td className="num">{money(row.net_worth || 0)}</td>
                    <td className="num">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openSnapshot(row.id)}
                        disabled={detailLoading}
                      >
                        <Eye size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Note title="Handling client information">
        These submissions contain personal financial details. The passcode is held
        only for this browser tab and clears when you close it. Avoid leaving this
        page open on a shared screen.
      </Note>
    </div>
  )
}
