import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Mail, Phone, Inbox, Link2 } from 'lucide-react'
import { GROUPS, GROUP_ORDER, TOOLS } from '../lib/tools.js'

const DEV_KEY = 'gl-show-dev-tools'

// In-development tools are shown by default; a CPA can hide them and the
// choice sticks on that device.
function readDevFlag() {
  try {
    return localStorage.getItem(DEV_KEY) !== '0'
  } catch {
    return true
  }
}

function ToolCard({ tool }) {
  const Icon = tool.icon
  const testing = tool.status === 'testing'
  return (
    <Link
      to={tool.path}
      className={`tcard${testing ? ' is-testing' : ''}`}
    >
      <div className="tcard-top">
        <span className="tcard-icon">
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <span className="tcard-flags">
          {tool.shareable ? (
            <span className="share-chip" title="Has a client-facing version; submissions arrive in Client results">
              <Link2 size={11} /> Shareable
            </span>
          ) : null}
          {testing ? <span className="status-chip">In development</span> : <span className="live-chip">Live</span>}
        </span>
      </div>
      <h3>{tool.title}</h3>
      <p>{tool.description}</p>
      <div className="tcard-foot">
        <span />
        <span className="tcard-open">
          Open <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  )
}

function GroupSection({ group, tools }) {
  return (
    <section className="tgroup" data-group={group.id}>
      <div className="ribbon">
        <h2>{group.title}</h2>
        <span className="ribbon-desc">{group.description}</span>
        <span className="ribbon-count">
          {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
        </span>
        {group.id === 'client-intake' ? (
          <Link to="/client-results" className="ribbon-action">
            <Inbox size={14} /> Client results
          </Link>
        ) : null}
      </div>
      <div className="tcard-grid">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const [showDev, setShowDev] = useState(readDevFlag)

  useEffect(() => {
    try {
      localStorage.setItem(DEV_KEY, showDev ? '1' : '0')
    } catch {
      /* private mode etc. — toggle still works for the session */
    }
  }, [showDev])

  const visible = useMemo(
    () => TOOLS.filter((t) => showDev || t.status === 'live'),
    [showDev],
  )
  const filtered = visible

  return (
    <div className="dash">
      <section className="bleed hero-e">
        <div className="container hero-e-inner">
          <div className="hero-e-text">
            <div className="eyebrow-e">Client Decision Support Toolkit</div>
            <h1>
              Planning tools.
              <br />
              One <em>defensible</em>
              <br />
              number, every time.
            </h1>
            <p>
              Built for Grott Luker CPAs and their clients by Grott Luker &amp; Co.
              and BlueLine Advisors. Every tool keeps the assumptions on one side
              and produces a clean, client-ready report on the other — with the
              math shown underneath.
            </p>
          </div>
          <div className="hero-e-visual" aria-hidden="true">
            <svg width="300" height="340" viewBox="0 0 300 340" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="10" width="260" height="320" rx="10" fill="#FFFFFF" stroke="#DDD7C8" strokeWidth="1.5" />
              <rect x="20" y="10" width="260" height="34" rx="10" fill="#0f2440" />
              <rect x="20" y="34" width="260" height="10" fill="#0f2440" />
              <circle cx="40" cy="27" r="4" fill="#C4A054" />
              {[80, 106, 132, 158, 184, 210, 236, 262, 288].map((y, i) => (
                <line key={y} x1="44" y1={y} x2={[150, 220, 130, 240, 170, 210, 140, 230, 160][i]} y2={y} stroke="#E4DFD1" strokeWidth="2" />
              ))}
              <line x1="34" y1="66" x2="252" y2="304" stroke="#3868A5" strokeWidth="4" strokeLinecap="round" />
              <circle cx="220" cy="106" r="7" fill="#C4A054" stroke="#FFFFFF" strokeWidth="2" />
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
              Every number this toolkit produces is meant to open a conversation
              with a client — not close one. Treat each report as a first draft
              built on the assumptions entered, not a recommendation or a
              substitute for the CPA&apos;s judgment. It gets everyone looking at the
              same rough numbers early, so the real planning starts from a shared
              starting line.
            </p>
          </div>
        </div>
      </section>

      <div className="dash-bar">
        <div className="dash-bar-note">
          {filtered.length} tools · GrottLuker CPA Tools are Grott Luker &amp; Co.&apos;s; the other sections are BlueLine Advisors&apos;.
        </div>
        <div className="dash-bar-right">
          <label className="dev-toggle">
          <span>Show in-development tools</span>
          <input
            type="checkbox"
            checked={showDev}
            onChange={(e) => setShowDev(e.target.checked)}
          />
          <i />
          </label>
        </div>
      </div>

      {GROUP_ORDER.map((gid) => {
        const tools = filtered.filter((t) => t.group === gid)
        if (!tools.length) return null
        return <GroupSection key={gid} group={GROUPS[gid]} tools={tools} />
      })}

      <div className="dash-bottom">
        <div className="dash-note">
          <div className="section-eyebrow">A note to Grott Luker CPAs</div>
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
                <div>
                  <b>Frank Sabin, CFA</b>
                  <span>Chief Investment Officer</span>
                </div>
              </div>
              <a href="mailto:fsabin@blueline-advisors.com">
                <Mail size={13} /> fsabin@blueline-advisors.com
              </a>
              <a href="tel:+16036860364">
                <Phone size={13} /> 603-686-0364 · call or text
              </a>
            </div>
            <div className="contact">
              <div className="contact-who">
                <img src="/brand/jenn-young.png" alt="Jennifer Young" />
                <div>
                  <b>Jennifer Young</b>
                  <span>Operations Manager</span>
                </div>
              </div>
              <a href="mailto:jyoung@blueline-advisors.com">
                <Mail size={13} /> jyoung@blueline-advisors.com
              </a>
              <a href="tel:+16037707887">
                <Phone size={13} /> 603-770-7887 · call or text
              </a>
            </div>
          </div>
        </div>

        <div className="dash-about">
          <div className="section-eyebrow">About BlueLine</div>
          <h3>Collaborative. Analytical. Custom.</h3>
          <p>
            That's how these tools were built, and it's how we work with the
            CPAs and clients who use them. Independent, SEC-registered, and
            planning-first — based in Exeter, NH.
          </p>
          <div className="who-label">Who we serve</div>
          <div className="who-chips">
            {[
              'Retirement Plans – Cash Balance & 401(k)',
              'Business owners',
              'Individuals & families',
              'Divorce & major transitions',
              'Pre-retirees & retirees',
              'Executives & professionals',
            ].map((w) => (
              <span key={w} className="who-chip">
                {w}
              </span>
            ))}
          </div>
          <a
            className="about-link"
            href="https://www.blueline-advisors.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            blueline-advisors.com ↗
          </a>
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
