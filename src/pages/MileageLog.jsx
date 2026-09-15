import { useEffect, useState } from 'react'
import { Link2, Check } from 'lucide-react'
import ToolShell from '../components/ToolShell.jsx'
import { MileageEditor, MileageReport } from '../components/MileageEditor.jsx'
import { Note } from '../components/ui.jsx'
import { blankLog, sampleLog } from '../lib/mileage.js'

const STORE_KEY = 'gl-mileage-log-cpa'
export const CLIENT_PATH = '/client/mileage-log'

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.trips && parsed?.expenses) return parsed
    }
  } catch {
    /* ignore */
  }
  return blankLog()
}

// CPA version: the CPA enters trips collected from the client, or reviews a
// client's own submission in /client-results. Clients keep their own log at
// /client/mileage-log and submit it at year-end.
export default function MileageLog() {
  const [log, setLog] = useState(load)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(log))
    } catch {
      /* ignore */
    }
  }, [log])

  function copyClientLink() {
    const url = `${window.location.origin}${CLIENT_PATH}`
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => window.prompt('Copy this link and send it to your client:', url),
    )
  }

  return (
    <ToolShell
      title="Mileage & Expense Log"
      subtitle="Log business, charity, and medical mileage plus meals through the year. The IRS standard rate applies automatically by trip date, and the year-end summary prints as a clean log."
      onReset={() => setLog(blankLog(log.taxYear))}
      onSample={() => setLog(sampleLog(2026))}
      disclosure="This log estimates deductions using IRS standard mileage rates and general meal rules. It is not tax advice; deductibility depends on the taxpayer's facts and current law. Review with Grott Luker & Co. before filing."
    >
      <div className="toolbar no-print" style={{ marginTop: 0 }}>
        <button className="btn btn-primary btn-sm" onClick={copyClientLink}>
          {copied ? <Check size={15} /> : <Link2 size={15} />}
          {copied ? 'Link copied' : 'Copy client link'}
        </button>
        <a className="btn btn-ghost btn-sm" href={CLIENT_PATH} target="_blank" rel="noopener noreferrer">
          Preview client version
        </a>
        <span className="toolbar-spacer" />
        <span className="timestamp">Saved on this device as you type</span>
      </div>

      <MileageEditor log={log} setLog={setLog} className="no-print" />
      <MileageReport log={log} />

      <Note title="How clients use this">
        Send the client link once. The client keeps the log in their browser through the year and submits it in January; it arrives in <strong>Client results</strong> with the itemized entries and totals.
      </Note>
    </ToolShell>
  )
}
