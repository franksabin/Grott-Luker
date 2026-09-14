import { Link } from 'react-router-dom'
import { ArrowRight, Inbox } from 'lucide-react'
import { GROUPS, toolsByGroup } from '../lib/tools.js'

function ToolCard({ tool }) {
  const Icon = tool.icon
  return (
    <div className="tool-card">
      <div className="card-top-row">
        <div className="card-icon">
          <Icon size={22} strokeWidth={1.75} />
        </div>
        <div className="card-badges">
          <span className="card-index">{tool.index}</span>
          {tool.shareable ? <span className="pill">Shareable</span> : null}
        </div>
      </div>
      <h3>{tool.title}</h3>
      <p className="card-desc">{tool.description}</p>
      <Link to={tool.path} className="btn btn-primary btn-block">
        Launch Tool <ArrowRight size={16} />
      </Link>
    </div>
  )
}

function ToolSection({ group, actions }) {
  const tools = toolsByGroup(group.id)
  return (
    <section className="tool-section">
      <div className="section-head">
        <div className="section-eyebrow">{group.eyebrow}</div>
        <h2 className="section-title">{group.title}</h2>
        <p className="section-desc">{group.description}</p>
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>
      <div className="card-grid">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  )
}

export default function Dashboard() {
  return (
    <div>
      <section className="hero">
        <h1>Client Decision Support Toolkit</h1>
        <p className="subhead">
          A planning platform for Grott Luker &amp; Co. — decision-support
          tools for CPAs, alongside specialized client planning resources from
          BlueLine Advisors. Every tool keeps the working assumptions on one
          side and produces a clean, client-ready report on the other, built
          for the moment you hand it across the table.
        </p>
      </section>

      <div className="dash-callout">
        <h3>A starting point, not a final answer</h3>
        <p>
          Every number this toolkit produces is meant to open a conversation
          with a client — not close one. Treat each report as an initial draft
          built on the figures entered, not a filed return, an appraisal, or a
          substitute for your own judgment. It's a way to get everyone looking
          at the same rough numbers early, so planning starts from a shared
          starting line instead of from scratch.
        </p>
      </div>

      <ToolSection
        group={GROUPS.primary}
        actions={
          <Link to="/client-results" className="btn btn-primary btn-sm">
            <Inbox size={15} /> View client results
          </Link>
        }
      />
      <div className="section-divider" />
      <ToolSection group={GROUPS['business-owner']} />
      <div className="section-divider" />
      <ToolSection group={GROUPS['wealth-life']} />

      <div className="section-divider" />

      <div className="dash-about">
        <section className="panel dash-panel">
          <div className="section-eyebrow">The honest answer</div>
          <h2 className="section-title">So, why did BlueLine build this?</h2>
          <p className="dash-kicker">Since you'd ask anyway.</p>
          <p>
            We built this because it's genuinely useful in a client meeting,
            full stop — that part doesn't depend on anything else. But we won't
            pretend there's no reason behind it: we'd like to be part of the
            conversation earlier, alongside Grott Luker &amp; Co., not just
            brought in after the fact.
          </p>
          <p>
            If this toolkit earns its place at the table, our hope is that
            Grott Luker's clients think of BlueLine when the next step needs
            handling — a rollover, a cash balance plan design, or working
            through the numbers in more depth than a quick calculator can. No
            obligation tied to using this, no exclusivity, nothing owed for a
            free tool. We'd just rather earn the referral than ask for one
            outright.
          </p>
        </section>

        <section className="panel dash-panel">
          <div className="section-eyebrow">Who's behind this</div>
          <h2 className="section-title">About BlueLine</h2>
          <p>
            BlueLine Advisors, LLC is an independent, SEC-registered investment
            adviser based in Exeter, NH, working with individuals, families, and
            business owners across New England — from the Seacoast to Boston and
            Portland, and virtually beyond. We take a planning-first approach:
            investment, tax, retirement, and estate decisions are treated as one
            connected picture rather than separate conversations. This toolkit
            extends that same approach to the decision-support work Grott Luker
            &amp; Co. does with its clients every day. Learn more at{' '}
            <a href="https://www.blueline-advisors.com" target="_blank" rel="noopener noreferrer">
              blueline-advisors.com
            </a>
            .
          </p>
          <div className="dash-contact">
            <img src="/brand/frank-sabin.png" alt="Frank Sabin" />
            <div>
              <div className="dash-contact-name">Frank Sabin, CFA</div>
              <div className="dash-contact-title">Chief Investment Officer</div>
              <a href="mailto:fsabin@blueline-advisors.com">fsabin@blueline-advisors.com</a>
              <a href="tel:+16036860364">603-686-0364</a>
            </div>
          </div>
        </section>
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
