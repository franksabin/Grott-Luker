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
import { MileageReport } from '../components/MileageEditor.jsx'
import { DonationReport } from '../components/DonationEditor.jsx'
import {
  listSnapshots,
  getSnapshot,
  listMileageLogs,
  getMileageLog,
  listDonationLogs,
  getDonationLog,
  listFeedback,
  getPasscode,
  setPasscode as persistPasscode,
  clearPasscode,
} from '../lib/api.js'
import { money, number } from '../lib/format.js'
import { compute } from '../lib/knowYourNumbers.js'
import { CPA_TOOLS, tally, pairing } from '../lib/feedback.js'

const TABS = {
  kyn: { label: 'Know Your Numbers', clientPath: '/client/know-your-numbers' },
  mileage: { label: 'Mileage & Expense Logs', clientPath: '/client/mileage-log' },
  donations: { label: 'Donation Logs', clientPath: '/client/charitable-donation-log' },
  poll: { label: 'CPA Poll', clientPath: '/feedback' },
}

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

/* CPA roadmap poll tallies. */
function PairingPlan({ rows }) {
  const [perCpa, setPerCpa] = useState('')
  const [copied, setCopied] = useState(false)
  const named = new Set(rows.map((r) => (r.name || '').trim().toLowerCase()).filter(Boolean)).size
  const defaultCap = named ? Math.ceil(CPA_TOOLS.length / named) : 0
  const plan = pairing(rows, Number(perCpa) || defaultCap)

  const copyPlan = async () => {
    const text = plan.cpas
      .map((c) => `${c.name}${c.firm ? ` (${c.firm})` : ''}\n${c.tools.map((t) => `  - ${t.label}${t.reason === 'volunteered' ? ' — volunteered' : ' — assigned to balance'}`).join('\n')}`)
      .join('\n\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  return (
    <Panel title="Suggested pairing — who refines which CPA tool">
      <p className="tally-intro">
        Each named CPA takes the CPA tools they offered to refine, spread evenly so everyone gets about the same number.
        Tools nobody volunteered for are dealt out to balance the load. Only the latest response per name counts.
        {plan.anonymous ? ` ${plan.anonymous} anonymous ${plan.anonymous === 1 ? 'response is' : 'responses are'} left out — ask those CPAs to resubmit with a name.` : ''}
      </p>
      {plan.cpas.length === 0 ? (
        <p className="tally-empty">No named responses yet. Pairing needs a name on the poll.</p>
      ) : (
        <>
          <div className="pair-controls">
            <label className="pair-cap">
              Tools per CPA
              <input className="input" type="number" min="1" max={CPA_TOOLS.length} value={perCpa} placeholder={String(defaultCap)} onChange={(e) => setPerCpa(e.target.value)} />
            </label>
            <span className="pair-note">{plan.cpas.length} CPAs · {CPA_TOOLS.length} CPA tools · cap {plan.cap} each{plan.unassigned.length ? ` · ${plan.unassigned.length} left over` : ''}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyPlan}>{copied ? <Check size={14} /> : <Link2 size={14} />} {copied ? 'Copied' : 'Copy plan'}</button>
          </div>
          <div className="pair-grid">
            {plan.cpas.map((c) => (
              <div key={c.id} className="pair-col">
                <div className="pair-head">
                  <div className="pair-name">{c.name}</div>
                  {c.firm ? <div className="pair-firm">{c.firm}</div> : null}
                  <div className="pair-count">{c.tools.length} {c.tools.length === 1 ? 'tool' : 'tools'}</div>
                </div>
                {c.tools.map((t) => (
                  <div key={t.id} className={`pair-tool${t.reason === 'assigned' ? ' unrated' : ''}`}>
                    <span className="pair-tool-title">{t.label}</span>
                    <span className={`dist ${t.reason === 'volunteered' ? 'r4' : 'r0 none'}`}>{t.reason === 'volunteered' ? 'Yes' : '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {plan.unassigned.length ? (
            <p className="tally-empty" style={{ marginTop: 12 }}>Not assigned (raise the cap to include): {plan.unassigned.map((id) => CPA_TOOLS.find((t) => t.id === id)?.label).join(' · ')}</p>
          ) : null}
        </>
      )}
    </Panel>
  )
}

function NoteList({ notes, empty }) {
  if (!notes.length) return <p className="tally-empty">{empty}</p>
  return (
    <div className="quotes">
      {notes.map((r) => (
        <div key={`${r.id}-${r.text.slice(0, 12)}`} className="quote">
          <p>{r.text}</p>
          <div className="quote-meta">{r.name || 'Anonymous'}{r.firm ? ` · ${r.firm}` : ''} · {formatWhen(r.created_at)}</div>
        </div>
      ))}
    </div>
  )
}

function PollResults({ rows, loading }) {
  if (loading && rows.length === 0) {
    return <Panel><div className="empty-state"><Loader2 size={22} className="spin" /><p>Loading answers…</p></div></Panel>
  }
  if (rows.length === 0) {
    return <Panel><div className="empty-state"><Inbox size={26} strokeWidth={1.5} /><p>No poll answers yet. Send CPAs the link with <strong>Copy client link</strong> above.</p></div></Panel>
  }
  const t = tally(rows)
  return (
    <div className="poll-results">
      <div className="poll-results-head">
        {t.n} {t.n === 1 ? 'response' : 'responses'} · latest {formatWhen(rows[0].created_at)}
        {t.nLegacy ? ` · ${t.nLegacy} from the earlier rating poll` : ''}
      </div>
      <PairingPlan rows={rows} />

      <Panel title="CPA tools — what to add, change, or include">
        <p className="tally-intro">One block per tool: how many said it works as is, who offered to refine it, and every note in the CPA’s own words.</p>
        {t.cpaTools.map((tool) => (
          <div key={tool.id} className="review-tool">
            <div className="review-tool-head">
              <h4>{tool.label}</h4>
              <span className="review-meta">
                {tool.planned ? <span>Planned</span> : <span><b>{tool.asIs}</b> works as is</span>}
                <span><b>{tool.notes.length}</b> {tool.notes.length === 1 ? 'note' : 'notes'}</span>
                <span><b>{tool.refine.length}</b> to refine{tool.refine.length ? `: ${tool.refine.map((r) => r.name || 'Anonymous').join(', ')}` : ''}</span>
              </span>
            </div>
            {tool.notes.length ? <div className="review-notes"><NoteList notes={tool.notes} empty="" /></div> : null}
          </div>
        ))}
      </Panel>

      {t.sections.map((s) => (
        <Panel key={s.id} title={`${s.title} — add, remove, thoughts`}>
          <NoteList notes={s.notes} empty="No notes on this section yet." />
        </Panel>
      ))}

      <Panel title="Anything else">
        <NoteList notes={t.anythingElse} empty="Nothing further yet." />
      </Panel>

      {t.legacyTools ? (
        <Panel title="Earlier rating poll (archived)">
          <p className="tally-intro">{t.nLegacy} {t.nLegacy === 1 ? 'response' : 'responses'} came in before the poll changed to the review format. Score is the average on the old five-point scale as a percentage of the maximum.</p>
          <div className="tally">
            {t.legacyTools.map((tool) => (
              <div key={tool.id} className="tally-row">
                <span className="tally-label">{tool.label}</span>
                <span className="tally-bar"><i style={{ width: `${tool.score}%` }} /></span>
                <span className="tally-n">{tool.score}% · {tool.n}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  )
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

  // Deep-linkable tabs: /client-results?tab=poll opens the CPA Poll directly.
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    return t && TABS[t] ? t : 'kyn'
  })
  const [rows, setRows] = useState([])
  const [logRows, setLogRows] = useState([])
  const [donRows, setDonRows] = useState([])
  const [pollRows, setPollRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')

  const [active, setActive] = useState(null)
  const [activeLog, setActiveLog] = useState(null)
  const [activeDon, setActiveDon] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (code) => {
    setLoading(true)
    setListError('')
    try {
      const [data, logs, dons, poll] = await Promise.all([listSnapshots(code), listMileageLogs(code), listDonationLogs(code), listFeedback(code)])
      setRows(data?.snapshots || [])
      setLogRows(logs?.logs || [])
      setDonRows(dons?.logs || [])
      setPollRows(poll?.rows || [])
      return true
    } catch (err) {
      if (err?.status === 401) {
        clearPasscode()
        setUnlocked(false)
        if (code) setGateError('That passcode was not accepted.')
        return false
      }
      setListError(err?.message || 'Could not load submissions.')
      return true
    } finally {
      setLoading(false)
    }
  }, [])

  // On first render, try to load straight away. If the deployment has no
  // passcode configured (beta mode) this succeeds with no code and the gate is
  // never shown; otherwise a 401 shows the gate.
  useEffect(() => {
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
      try {
        const logs = await listMileageLogs(code)
        setLogRows(logs?.logs || [])
        const dons = await listDonationLogs(code)
        setDonRows(dons?.logs || [])
        const poll = await listFeedback(code)
        setPollRows(poll?.rows || [])
      } catch {
        /* mileage table may not exist yet on an un-migrated deployment */
      }
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

  async function openLog(id) {
    setDetailLoading(true)
    try {
      const data = await getMileageLog(id, passcode)
      setActiveLog(data?.log || null)
      window.scrollTo(0, 0)
    } catch (err) {
      setListError(err?.message || 'Could not open that log.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function openDon(id) {
    setDetailLoading(true)
    try {
      const data = await getDonationLog(id, passcode)
      setActiveDon(data?.log || null)
      window.scrollTo(0, 0)
    } catch (err) {
      setListError(err?.message || 'Could not open that log.')
    } finally {
      setDetailLoading(false)
    }
  }

  const CLIENT_PATH = TABS[tab].clientPath

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

  /* ---------------- Detail view: donation log ---------------- */
  if (activeDon) {
    return (
      <div>
        <button className="backlink no-print" onClick={() => setActiveDon(null)}>
          <ArrowLeft size={15} /> Back to all submissions
        </button>
        <div className="tool-header">
          <h1>{activeDon.name}</h1>
          <p className="tool-sub">
            Charitable Donation Log · Tax year {activeDon.tax_year} · Submitted {formatWhen(activeDon.created_at)} · {activeDon.email}
            {activeDon.phone ? ` · ${activeDon.phone}` : ''}
          </p>
        </div>
        <div className="toolbar no-print">
          <span className="toolbar-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><FileDown size={15} /> Print / Save as PDF</button>
        </div>
        {activeDon.notes ? <Note title="Client note">{activeDon.notes}</Note> : null}
        {activeDon.log ? (
          <DonationReport log={activeDon.log} clientName={activeDon.name} dateLabel={new Date(activeDon.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
        ) : <div className="form-error">This submission could not be read.</div>}
      </div>
    )
  }

  /* ---------------- Detail view: mileage log ---------------- */
  if (activeLog) {
    return (
      <div>
        <button className="backlink no-print" onClick={() => setActiveLog(null)}>
          <ArrowLeft size={15} /> Back to all submissions
        </button>

        <div className="tool-header">
          <h1>{activeLog.name}</h1>
          <p className="tool-sub">
            Mileage &amp; Expense Log · Tax year {activeLog.tax_year} · Submitted{' '}
            {formatWhen(activeLog.created_at)} · {activeLog.email}
            {activeLog.phone ? ` · ${activeLog.phone}` : ''}
          </p>
        </div>

        <div className="toolbar no-print">
          <span className="toolbar-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            <FileDown size={15} /> Print / Save as PDF
          </button>
        </div>

        {activeLog.notes ? <Note title="Client note">{activeLog.notes}</Note> : null}

        {activeLog.log ? (
          <MileageReport
            log={activeLog.log}
            clientName={activeLog.name}
            dateLabel={new Date(activeLog.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />
        ) : (
          <div className="form-error">This submission could not be read.</div>
        )}
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
          What clients have sent in. Send a client the link for a tool and their
          submission appears here.
        </p>
      </div>

      <div className="seg no-print" role="tablist" aria-label="Submission type" style={{ marginTop: 6 }}>
        {Object.entries(TABS).map(([id, t]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`seg-btn${tab === id ? ' on' : ''}`}
            onClick={() => setTab(id)}
          >
            {t.label} <small>{id === 'kyn' ? rows.length : id === 'mileage' ? logRows.length : id === 'donations' ? donRows.length : pollRows.length}</small>
          </button>
        ))}
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

      {tab === 'poll' ? (
        <PollResults rows={pollRows} loading={loading} />
      ) : tab === 'donations' ? (
        <Panel>
          {loading && donRows.length === 0 ? (
            <div className="empty-state"><Loader2 size={22} className="spin" /><p>Loading submissions…</p></div>
          ) : donRows.length === 0 ? (
            <div className="empty-state"><Inbox size={26} strokeWidth={1.5} /><p>No donation logs yet. Use <strong>Copy client link</strong> above to send the log to a client.</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Client</th><th>Email</th><th>Tax year</th><th>Submitted</th><th className="num">Gifts</th><th className="num">Est. deductible</th><th /></tr></thead>
                <tbody>
                  {donRows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.name}</strong></td><td>{row.email}</td><td>{row.tax_year}</td><td>{formatWhen(row.created_at)}</td>
                      <td className="num">{money(row.total_gifts || 0, 2)}</td><td className="num">{money(row.estimated_deduction || 0, 2)}</td>
                      <td className="num"><button className="btn btn-ghost btn-sm" onClick={() => openDon(row.id)} disabled={detailLoading}><Eye size={14} /> View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : tab === 'mileage' ? (
        <Panel>
          {loading && logRows.length === 0 ? (
            <div className="empty-state">
              <Loader2 size={22} className="spin" />
              <p>Loading submissions…</p>
            </div>
          ) : logRows.length === 0 ? (
            <div className="empty-state">
              <Inbox size={26} strokeWidth={1.5} />
              <p>
                No mileage logs yet. Use <strong>Copy client link</strong> above to
                send the log to a client; they submit it in January.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Email</th>
                    <th>Tax year</th>
                    <th>Submitted</th>
                    <th className="num">Miles</th>
                    <th className="num">Est. deduction</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {logRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      <td>{row.email}</td>
                      <td>{row.tax_year}</td>
                      <td>{formatWhen(row.created_at)}</td>
                      <td className="num">{number(row.total_miles || 0)}</td>
                      <td className="num">{money(row.estimated_deduction || 0, 2)}</td>
                      <td className="num">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openLog(row.id)}
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
      ) : (
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
      )}

      <Note title="Handling client information">
        These submissions contain personal financial details. During the beta this
        page is open to anyone with its address, so do not forward the link outside
        the firm, and avoid leaving it open on a shared screen.
      </Note>
    </div>
  )
}
