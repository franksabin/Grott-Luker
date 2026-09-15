import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Mail, Phone } from 'lucide-react'
import { GROUPS, GROUP_ORDER, OWNERS, TOOLS } from '../lib/tools.js'

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
      className={`tcard owner-${tool.owner}${testing ? ' is-testing' : ''}`}
    >
      <div className="tcard-top">
        <span className="tcard-icon">
          <Icon size={18} strokeWidth={1.75} />
        </span>
        {testing ? <span className="status-chip">In development</span> : null}
      </div>
      <h3>{tool.title}</h3>
      <p>{tool.description}</p>
      <div className="tcard-foot">
        <span className="owner-chip">{OWNERS[tool.owner].label}</span>
        <span className="tcard-open">
          Open <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  )
}

function GroupSection({ group, tools }) {
  const testingCount = tools.filter((t) => t.status === 'testing').length
  return (
    <section className="tgroup" data-group={group.id}>
      <div className="ribbon">
        <h2>{group.title}</h2>
        <span className="ribbon-desc">{group.description}</span>
        <span className="ribbon-count">
          {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
          {testingCount ? (
            <em> · {testingCount} in development</em>
          ) : null}
        </span>
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
  const [owner, setOwner] = useState('all')
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
  const filtered = useMemo(
    () => visible.filter((t) => owner === 'all' || t.owner === owner),
    [visible, owner],
  )
  const countFor = (o) =>
    visible.filter((t) => o === 'all' || t.owner === o).length

  return (
    <div className="dash">
      <section className="hero">
        <h1>Client Decision Support Toolkit</h1>
        <p className="subhead">
          Planning tools for Grott Luker CPAs and their clients — built by
          Grott Luker &amp; Co. and BlueLine Advisors. Assumptions on one side,
          a clean client-ready report on the other.
        </p>
        <p className="hero-note">
          A starting point, not a final answer — every report here is meant to
          open a conversation with a client, not close one.
        </p>
      </section>

      <div className="dash-bar">
        <div className="seg" role="tablist" aria-label="Filter by builder">
          {[
            ['all', 'All tools'],
            ['grott', OWNERS.grott.label],
            ['blueline', OWNERS.blueline.label],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={owner === id}
              className={`seg-btn owner-${id}${owner === id ? ' on' : ''}`}
              onClick={() => setOwner(id)}
            >
              {id !== 'all' ? <i className="seg-dot" /> : null}
              {label} <small>{countFor(id)}</small>
            </button>
          ))}
        </div>
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
              'Business owners',
              'Retirement plan sponsors',
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
