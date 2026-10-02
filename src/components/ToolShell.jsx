import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Database, FileDown, Mail, Link2, Check, Eye, FileSpreadsheet, Download } from 'lucide-react'
import { timestampNow } from '../lib/format.js'
import { TOOLS } from '../lib/tools.js'
import { EMAIL_REQUESTS } from '../lib/emailRequests.js'
import RequestInfoModal from './RequestInfoModal.jsx'
import SignoffPanel from './SignoffPanel.jsx'
import { useUsage } from '../lib/useUsage.js'
import MathTrace from './MathTrace.jsx'

const STANDARD_DISCLOSURE =
  'This calculator is intended solely for educational and planning purposes. Results are estimates based on user-entered assumptions and simplified tax calculations. Actual tax consequences depend on many additional factors and should be reviewed with Grott Luker & Co. before making financial decisions.'

export default function ToolShell({
  title,
  subtitle,
  onReset,
  onSample,
  children,
  disclosure = STANDARD_DISCLOSURE,
  steps,
  planned = false, // a roadmap entry with no calculator yet: no "baseline model" banner
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { pathname, search } = useLocation()

  // ?sample=1 opens the tool with its sample data loaded (used for the poll
  // screenshots and handy for sharing a filled-in example).
  useEffect(() => {
    if (onSample && new URLSearchParams(search).get('sample') === '1') onSample()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const tool = TOOLS.find((t) => t.path === pathname)
  const emailSpec = tool ? EMAIL_REQUESTS[tool.id] : null
  const clientLink = tool?.clientPath ? `${window.location.origin}${tool.clientPath}` : null
  const templateLink = tool?.template ? `${window.location.origin}${tool.template}` : null
  const [emailMode, setEmailMode] = useState('form')

  function copyClientLink() {
    if (!clientLink) return
    navigator.clipboard?.writeText(clientLink).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => window.prompt('Copy this link and send it to your client:', clientLink),
    )
  }

  const handlePrint = () => window.print()
  const generatedAt = timestampNow()
  const usage = useUsage()
  const u = tool ? usage[tool.id] : null

  return (
    <div>
      <Link to="/" className="backlink no-print">
        <ArrowLeft size={15} /> Back to toolkit
      </Link>

      <div className="tool-header">
        <h1>{title}</h1>
        {subtitle ? <p className="tool-sub">{subtitle}</p> : null}
        <div className="tool-tech-attrib">
          {tool?.group === 'cpa'
            ? 'A GrottLuker CPA Tool · Platform by BlueLine Advisors'
            : 'A BlueLine Advisors tool for Grott Luker & Co. clients'}
        </div>
      </div>

      <div className="toolbar no-print">
        {emailSpec ? (
          <button className="btn btn-primary btn-sm" onClick={() => { setEmailMode('form'); setModalOpen(true) }}>
            <Mail size={15} /> {clientLink ? 'Email client the form' : 'Request client information'}
          </button>
        ) : null}
        {clientLink ? (
          <>
            <button className="btn btn-ghost btn-sm" onClick={copyClientLink}>
              {copied ? <Check size={15} /> : <Link2 size={15} />}
              {copied ? 'Link copied' : 'Copy client link'}
            </button>
            <a className="btn btn-ghost btn-sm" href={tool.clientPath} target="_blank" rel="noopener noreferrer">
              <Eye size={15} /> Preview client form
            </a>
            {tool?.template ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEmailMode('template'); setModalOpen(true) }}>
                  <FileSpreadsheet size={15} /> Email the Excel template
                </button>
                <a className="btn btn-ghost btn-sm" href={tool.template} download title="Download the workbook to this computer">
                  <Download size={15} /> Download
                </a>
              </>
            ) : null}
          </>
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
        {u ? <span className="usage-note"> · opened {u.total} {u.total === 1 ? 'time' : 'times'}{u.last30 !== u.total ? `, ${u.last30} in the last 30 days` : ''}</span> : null}
      </div>

      {tool ? <SignoffPanel tool={tool} /> : null}

      {clientLink ? (
        <div className="share-how no-print">
          <div className="share-how-title">How this Client Shareable works</div>
          <ol>
            <li><strong>Send the link.</strong> Use “Email client the form” (a ready-made email with the link) or “Copy client link” and paste it into your own message or text. For clients who prefer Excel, “Email the Excel template” drafts a note with the download link and simple instructions.</li>
            <li><strong>The client fills it in.</strong> The form opens in any browser — no login, no account. It saves on their device as they go. Clients who prefer a spreadsheet can download the Excel template instead and send you the file.</li>
            <li><strong>It lands in Client results.</strong> When they click Send, the submission appears under Client results (staff passcode) with their name and email, ready to print or review before the meeting.</li>
          </ol>
          <div className="share-how-note">The link is the same for every client; you tell submissions apart by the name and email the client enters. You can also fill this page in yourself during a meeting — that stays on this device only.</div>
        </div>
      ) : null}

      {children}

      <MathTrace steps={steps} />

      <p className="disclosure">{disclosure}</p>

      <RequestInfoModal open={modalOpen} onClose={() => setModalOpen(false)} spec={emailSpec} link={clientLink} templateLink={templateLink} toolTitle={title} mode={emailMode} />
    </div>
  )
}
