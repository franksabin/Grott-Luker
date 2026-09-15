import { useLocation } from 'react-router-dom'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, Note } from '../components/ui.jsx'
import { TOOLS } from '../lib/tools.js'

// Placeholder page for a tool that is on the roadmap but not built yet.
// It shows on the dashboard as "In development" so CPAs can see what is
// coming; the description and planned inputs come from the registry entry.
export default function PlannedTool() {
  const { pathname } = useLocation()
  const tool = TOOLS.find((t) => t.path === pathname)
  if (!tool) return null
  return (
    <ToolShell
      title={tool.title}
      subtitle={tool.description}
      disclosure="This tool is planned and not yet available. Nothing entered here is saved or calculated."
    >
      <Panel title="Planned">
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          {tool.plan ||
            'This calculator is on the roadmap. Tell us what would make it useful in your meetings and it moves up the list.'}
        </p>
        {tool.planInputs ? (
          <>
            <div className="hint" style={{ marginTop: 14, fontWeight: 600 }}>Inputs it will take</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--ink-soft)', fontSize: 14 }}>
              {tool.planInputs.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Panel>
      <Note title="Have a client case for this?">
        Send it to Frank or Jenn — real examples shape what gets built first.
      </Note>
    </ToolShell>
  )
}
