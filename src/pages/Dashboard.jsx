import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Mail, Phone, Inbox, Link2, Check } from 'lucide-react'
import { GROUPS, GROUP_ORDER, TOOLS } from '../lib/tools.js'
import { isReady, CPAS, REVIEWER_GROUPS } from '../lib/signoffs.js'

// Dashboard review filter: 'all' | one of CPAS | 'none' (no sign-off yet). Remembered per browser.
const FILTER_KEY = 'gl-review-filter'
const VALID_FILTER = (v) => v && (v === 'all' || v === 'none' || CPAS.includes(v))
// ?reviewer=Deb in the URL wins (a CPA can bookmark their own view); otherwise the last choice on this browser.
function readFilter() {
  try {
    const q = new URLSearchParams(window.location.search).get('reviewer')
    if (VALID_FILTER(q)) {
      localStorage.setItem(FILTER_KEY, q)
      return q
    }
    const v = localStorage.getItem(FILTER_KEY)
    return VALID_FILTER(v) ? v : 'all'
  } catch {
    return 'all'
  }
}
function reviewedBy(tool, signoffs, cpa) {
  return (signoffs[tool.id] || []).some((s) => s.cpa === cpa)
}
function matchesFilter(tool, signoffs, filter) {
  if (filter === 'all') return true
  if (filter === 'none') return !(signoffs[tool.id] || []).length
  return reviewedBy(tool, signoffs, filter)
}

// Who has signed off — shown under the card, outside it, so it reads at a glance.
function ReviewStrip({ tool, signoffs }) {
  const rows = signoffs[tool.id] || []
  const done = new Set(rows.map((s) => s.cpa))
  const when = (cpa) => {
    const r = rows.find((s) => s.cpa === cpa)
    return r?.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  }
  return (
    <div className="reviewers" aria-label={done.size ? `Reviewed by ${[...done].join(', ')}` : 'Not yet reviewed'}>
      {REVIEWER_GROUPS.map((g) => (
        <div key={g.id} className="rev-row">
          <span className="rev-grp">{g.label}</span>
          <span className="rev-names">
            {g.names.map((cpa) => (
              <span key={cpa} className={`rev-name${done.has(cpa) ? ' is-done' : ''}`} title={done.has(cpa) ? `${cpa} tested this tool and signed off on ${when(cpa)}` : `${cpa} has not signed off yet`}>
                {done.has(cpa) ? <Check size={11} strokeWidth={3} /> : null}
                {cpa}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
import { useSignoffs } from '../lib/useSignoffs.js'
import { useUsage } from '../lib/useUsage.js'

// Every tool is "In development" as of 2026-09-16 (full rebuild, not yet
// re-reviewed), so the old show/hide toggle for in-development tools is gone:
// hiding them would hide the whole toolkit.

function ToolCard({ tool, signoffs, usage }) {
  const u = usage?.[tool.id]
  const Icon = tool.icon
  const ready = isReady(tool, signoffs)
  const who = (signoffs[tool.id] || []).map((s) => s.cpa)
  const testing = !ready
  const cpa = false
  return (
    <div className="tcell">
    <Link
      to={tool.path}
      className={`tcard${testing ? ' is-testing' : ''}${cpa ? ' is-cpa' : ''}`}
    >
      <div className="tcard-top">
        <span className="tcard-icon">
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <span className="tcard-flags">
          {tool.shareable ? (
            <span className="share-chip" title="Has a client-facing version; submissions arrive in Client results">
              <Link2 size={11} /> Client Shareable
            </span>
          ) : null}
        </span>
      </div>
      <h3>{tool.title}</h3>
      <p>{tool.description}</p>
      <div className="tcard-foot">
        <span className="tcard-uses" title={u?.last_used ? `Last opened ${new Date(u.last_used).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Not opened yet'}>
          {u ? `${u.total} ${u.total === 1 ? 'use' : 'uses'}${u.last30 && u.last30 !== u.total ? ` · ${u.last30} this month` : ''}` : 'No uses yet'}
        </span>
        <span className="tcard-open">
          Open <ArrowRight size={14} />
        </span>
      </div>
    </Link>
    <ReviewStrip tool={tool} signoffs={signoffs} />
    </div>
  )
}

function GroupSection({ group, tools, total, signoffs, usage }) {
  return (
    <section className="tgroup" data-group={group.id}>
      <div className="ribbon">
        <h2>{group.title}</h2>
        <span className="ribbon-desc">{group.description}</span>
        <span className="ribbon-count">
          {total && total !== tools.length ? `${tools.length} of ${total} ${total === 1 ? 'tool' : 'tools'}` : `${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`}
        </span>
        {group.id === 'client-intake' ? (
          <Link to="/client-results" className="ribbon-action">
            <Inbox size={14} /> Client results
          </Link>
        ) : null}
      </div>
      <div className="tcard-grid">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} signoffs={signoffs} usage={usage} />
        ))}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { signoffs } = useSignoffs()
  const usage = useUsage()
  const [filter, setFilterState] = useState(readFilter)
  const setFilter = (v) => {
    setFilterState(v)
    try {
      localStorage.setItem(FILTER_KEY, v)
    } catch {
      /* ignore */
    }
  }
  const filtered = TOOLS.filter((t) => matchesFilter(t, signoffs, filter))
  const filterLabel = filter === 'all' ? '' : filter === 'none' ? 'not yet reviewed by anyone' : `reviewed by ${filter}`

  return (
    <div className="dash">
      <section className="bleed hero-e">
        <div className="container hero-e-inner">
          <div className="hero-e-text">
            <div className="eyebrow-e">Client Decision Support Toolkit</div>
            <h1>
              Run the numbers.
              <br />
              Show the <em>math</em>.
              <br />
              Start the conversation.
            </h1>
            <p>
              Built for Grott Luker CPAs and their clients. Enter the assumptions
              on one side and hand over a clean, client-ready report on the other —
              with every calculation shown underneath, so you can stand behind the
              number and explain it in plain English.
            </p>
          </div>
          <div className="hero-e-visual" aria-hidden="true">
            <svg width="360" height="330" viewBox="0 0 360 330" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* back card */}
              <rect x="56" y="14" width="272" height="262" rx="12" fill="#FFFFFF" stroke="#DDD7C8" strokeWidth="1.5" opacity="0.9" />
              <rect x="56" y="14" width="272" height="30" rx="12" fill="#5a93cf" />
              <rect x="56" y="34" width="272" height="10" fill="#5a93cf" />
              {/* front card */}
              <rect x="20" y="52" width="272" height="262" rx="12" fill="#FFFFFF" stroke="#DDD7C8" strokeWidth="1.5" />
              <rect x="20" y="52" width="272" height="34" rx="12" fill="#0f2440" />
              <rect x="20" y="74" width="272" height="12" fill="#0f2440" />
              <text x="40" y="75" fontFamily="Georgia, serif" fontSize="12" fill="#FFFFFF" letterSpacing="1">G|L</text>
              <circle cx="272" cy="69" r="4" fill="#C4A054" />
              {/* feature figure */}
              <text x="40" y="116" fontFamily="'IBM Plex Mono', monospace" fontSize="9" letterSpacing="1.5" fill="#726d63">PROJECTED FEDERAL TAX</text>
              <text x="40" y="150" fontFamily="Georgia, serif" fontSize="30" fontWeight="600" fill="#0f2440">$44,668</text>
              <rect x="40" y="160" width="60" height="3" rx="1.5" fill="#C4A054" />
              {/* bars */}
              <rect x="40" y="186" width="160" height="10" rx="3" fill="#0f2440" />
              <rect x="40" y="202" width="118" height="10" rx="3" fill="#3868A5" />
              <rect x="40" y="218" width="76" height="10" rx="3" fill="#C4A054" />
              <text x="208" y="195" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fill="#454650">40,201</text>
              <text x="166" y="211" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fill="#454650">32,000</text>
              <text x="124" y="227" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fill="#454650">8,201</text>
              {/* show the math rows */}
              <line x1="40" y1="244" x2="272" y2="244" stroke="#E4DFD1" strokeWidth="1" />
              <text x="40" y="262" fontFamily="'IBM Plex Mono', monospace" fontSize="9" letterSpacing="1.2" fill="#35608f">▸ SHOW THE MATH</text>
              <line x1="40" y1="276" x2="200" y2="276" stroke="#E4DFD1" strokeWidth="2" />
              <line x1="40" y1="290" x2="236" y2="290" stroke="#E4DFD1" strokeWidth="2" />
              <line x1="40" y1="304" x2="170" y2="304" stroke="#E4DFD1" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </section>

      <section className="bleed band-navy-e">
        <div className="container sp-inner-e">
          <div className="sp-mark-e">✳</div>
          <div>
            <h3>A starting point, not a final answer</h3>
            <p>
              Every figure here is meant to open a planning conversation with a
              client — not close one. Treat each report as a first draft built on
              the assumptions entered: not tax advice, not a filing position, and
              not a substitute for your professional judgment. It gets you and the
              client looking at the same rough numbers early, so the real planning
              starts from a shared starting line.
            </p>
          </div>
        </div>
      </section>

      <div className="dash-bar">
        <div className="rfilter" role="group" aria-label="Filter tools by reviewer">
          <span className="rfilter-lead">Show tools reviewed by</span>
          <button type="button" className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>All tools</button>
          {REVIEWER_GROUPS.map((g) => (
            <span key={g.id} className="rfilter-grp">
              <span className="rfilter-grp-label">{g.label}</span>
              {g.names.map((cpa) => (
                <button key={cpa} type="button" className={filter === cpa ? 'is-on' : ''} onClick={() => setFilter(cpa)}>
                  {cpa}
                </button>
              ))}
            </span>
          ))}
          <span className="rfilter-grp">
            <button type="button" className={filter === 'none' ? 'is-on' : ''} onClick={() => setFilter('none')}>No one yet</button>
          </span>
        </div>
        <div className="dash-bar-right">
          <span className="dev-note">
            The names under each card show who has tested it and signed off. A dashed card has no sign-off yet and is not client ready.
            {(() => { try { return localStorage.getItem('gl-staff') === '1' } catch { return false } })() ? <span className="staff-note"> · This browser is staff: your opens are not counted.</span> : null}
          </span>
        </div>
      </div>
      {filter !== 'all' ? (
        <div className="rfilter-status">
          {filtered.length
            ? `Showing ${filtered.length} ${filtered.length === 1 ? 'tool' : 'tools'} ${filterLabel}.`
            : filter === 'none'
              ? 'Every tool has at least one sign-off.'
              : `${filter} has not signed off on any tool yet. Open a tool and use the sign-off panel at the bottom of the page.`}{' '}
          <button type="button" className="linkish" onClick={() => setFilter('all')}>Show all tools</button>
        </div>
      ) : null}

      {GROUP_ORDER.map((gid) => {
        const tools = filtered.filter((t) => t.group === gid)
        if (!tools.length) return null
        const total = TOOLS.filter((t) => t.group === gid).length
        return <GroupSection key={gid} group={GROUPS[gid]} tools={tools} total={total} signoffs={signoffs} usage={usage} />
      })}

      <div className="sbs-wrap">
          <div className="sbs">
            <div className="sbs-note">
              <div className="eyebrow-e">A note to Grott Luker CPAs</div>
              <h3>Happy to help with any question.</h3>
              <p>
                Email, call, or text. We want this toolkit to be as good as it can
                be, so if a number looks off, a tool is missing something, or a
                client situation deserves a second look — send it over.
              </p>
              <p>
                Introductions are welcome too, but never required. It's simply good
                for us to be front of mind; the right opportunities tend to find
                their way.
              </p>
              <div className="contacts">
                <div className="contact">
                  <div className="contact-who">
                    <img src="/brand/frank-sabin.png" alt="Frank Sabin" />
                    <div><b>Frank Sabin, CFA</b><span>Chief Investment Officer</span></div>
                  </div>
                  <a href="mailto:fsabin@blueline-advisors.com"><Mail size={13} /> fsabin@blueline-advisors.com</a>
                  <a href="tel:+16036860364"><Phone size={13} /> 603-686-0364 · call or text</a>
                </div>
                <div className="contact">
                  <div className="contact-who">
                    <img src="/brand/jenn-young.png" alt="Jennifer Young" />
                    <div><b>Jennifer Young</b><span>Operations Manager</span></div>
                  </div>
                  <a href="mailto:jyoung@blueline-advisors.com"><Mail size={13} /> jyoung@blueline-advisors.com</a>
                  <a href="tel:+16037707887"><Phone size={13} /> 603-770-7887 · call or text</a>
                </div>
              </div>
            </div>
            <div className="sbs-about">
              <div className="eyebrow-e">About BlueLine</div>
              <h3>Collaborative. Analytical. Custom.</h3>
              <p>
                That's how these tools were built, and it's how we work with the
                CPAs and clients who use them. Independent, SEC-registered, and
                planning-first — based in Exeter, NH.
              </p>
              <div className="who-label">Who we serve</div>
              <div className="who-chips">
                {['Retirement Plans – Cash Balance & 401(k)', 'Business owners', 'Individuals & families', 'Divorce & major transitions', 'Pre-retirees & retirees', 'Executives & professionals'].map((w) => (
                  <span key={w} className="who-chip">{w}</span>
                ))}
              </div>
              <a className="about-link" href="https://www.blueline-advisors.com" target="_blank" rel="noopener noreferrer">blueline-advisors.com ↗</a>
            </div>
          </div>
        </div>
      <div className="disclosure-box">
        <strong>How this works:</strong> BlueLine builds, maintains, and brands
        the BlueLine planning tools — reports carry BlueLine's name alongside
        Grott Luker &amp; Co.'s. BlueLine Advisors, LLC is a registered
        investment adviser with the SEC — registration doesn't imply any
        particular level of skill. This toolkit is provided for informational
        purposes only, does not constitute legal, tax, or investment advice, and
        using it does not create an advisory relationship with BlueLine. Figures
        are illustrative and should be independently verified before use in any
        filing, return, or client decision.
      </div>
    </div>
  )
}
