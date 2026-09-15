import { useEffect, useState } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { DonationEditor, DonationReport } from '../components/DonationEditor.jsx'
import { blankLog, sampleLog } from '../lib/donations.js'

const STORE_KEY = 'gl-donation-log-cpa'

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.gifts) return parsed
    }
  } catch {
    /* ignore */
  }
  return blankLog()
}

// CPA version. Clients keep their own log at /client/charitable-donation-log.
export default function DonationLog() {
  const [log, setLog] = useState(load)
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(log))
    } catch {
      /* ignore */
    }
  }, [log])

  return (
    <ToolShell
      title="Charitable Donation Log"
      subtitle="Cash, non-cash, and appreciated-securities gifts through the year, with the receipt, Form 8283, and appraisal thresholds flagged as entries are made. Clients keep the log and send it in January."
      onReset={() => setLog(blankLog(log.taxYear))}
      onSample={() => setLog(sampleLog(2026))}
      disclosure="This log organizes gifts and flags documentation rules; it does not determine deductibility, which depends on the donee's status, AGI limits, and the taxpayer's facts. Review with Grott Luker & Co. before filing."
    >
      <DonationEditor log={log} setLog={setLog} className="no-print" />
      <DonationReport log={log} />
    </ToolShell>
  )
}
