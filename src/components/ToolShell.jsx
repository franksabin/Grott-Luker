import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Database, FileDown, Mail } from 'lucide-react'
import { timestampNow } from '../lib/format.js'
import { TOOLS } from '../lib/tools.js'
import { EMAIL_REQUESTS } from '../lib/emailRequests.js'
import RequestInfoModal from './RequestInfoModal.jsx'

const STANDARD_DISCLOSURE =
  'This calculator is intended solely for educational and planning purposes. Results are estimates based on user-entered assumptions and simplified tax calculations. Actual tax consequences depend on many additional factors and should be reviewed with Grott Luker & Co. before making financial decisions.'

export default function ToolShell({
  title,
  subtitle,
  onReset,
  onSample,
  children,
  disclosure = STANDARD_DISCLOSURE,
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const { pathname } = useLocation()
  const tool = TOOLS.find((t) => t.path === pathname)
  const emailSpec = tool ? EMAIL_REQUESTS[tool.id] : null

  const handlePrint = () => window.print()
  const generatedAt = timestampNow()

  return (
    <div>
      <Link to="/" className="backlink no-print">
        <ArrowLeft size={15} /> Back to toolkit
      </Link>

      <div className="tool-header">
        <h1>{title}</h1>
        {subtitle ? <p className="tool-sub">{subtitle}</p> : null}
        <div className="tool-tech-attrib">
          {tool?.owner === 'grott'
            ? 'A Grott Luker & Co. tool · Platform by BlueLine Advisors'
            : 'Decision Support Technology by BlueLine Advisors'}
        </div>
      </div>

      <div className="toolbar no-print">
        {emailSpec ? (
          <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
            <Mail size={15} /> Request client information
          </button>
        ) : null}
        {onSample ? (
          <button className="btn btn-ghost btn-sm" onClick={onSample}>
            <Database size={15} /> Load sample data
          </button>
        ) : null}
        {onReset ? (
          <button className="btn btn-subtle btn-sm" onClick={onReset}>
            <RotateCcw size={15} /> Reset
          </button>
        ) : null}
        <span className="toolbar-spacer" />
        <button className="btn btn-ghost btn-sm" onClick={handlePrint}>
          <FileDown size={15} /> Print / Save as PDF
        </button>
      </div>

      <div className="timestamp" style={{ marginBottom: 22 }}>
        Estimate generated {generatedAt}
      </div>

      {children}

      <p className="disclosure">{disclosure}</p>

      <RequestInfoModal open={modalOpen} onClose={() => setModalOpen(false)} spec={emailSpec} />
    </div>
  )
}
