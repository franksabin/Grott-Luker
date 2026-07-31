import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { GROUPS, toolsByGroup } from '../lib/tools.js'

function ToolCard({ tool }) {
  const Icon = tool.icon
  return (
    <div className="tool-card">
      <div className="card-index">{tool.index}</div>
      <div className="card-icon">
        <Icon size={24} strokeWidth={1.75} />
      </div>
      <h3>{tool.title}</h3>
      <p className="card-desc">{tool.description}</p>
      <Link to={tool.path} className="btn btn-primary btn-block">
        Launch Tool <ArrowRight size={16} />
      </Link>
    </div>
  )
}

function ToolSection({ group }) {
  const tools = toolsByGroup(group.id)
  return (
    <section className="tool-section">
      <div className="section-head">
        <div className="section-eyebrow">{group.eyebrow}</div>
        <h2 className="section-title">{group.title}</h2>
        <p className="section-desc">{group.description}</p>
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
          A professional planning platform for Grott Luker &amp; Co. — internal
          decision-support tools for CPAs, alongside specialized client planning
          resources from BlueLine Advisors.
        </p>
        <p className="disclaimer">
          These planning tools provide estimates based on information entered by
          the user. They are intended to support conversations with Grott Luker
          &amp; Co. and should not be interpreted as tax, legal, accounting, or
          investment advice.
        </p>
      </section>

      <ToolSection group={GROUPS.cpa} />
      <div className="section-divider" />
      <ToolSection group={GROUPS.blueline} />
    </div>
  )
}
