import { useEffect, useState } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { MileageEditor, MileageReport } from '../components/MileageEditor.jsx'
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

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(log))
    } catch {
      /* ignore */
    }
  }, [log])

  return (
    <ToolShell
      title="Mileage & Expense Log"
      subtitle="Log business, charity, and medical mileage plus meals through the year. The IRS standard rate applies automatically by trip date, and the year-end summary prints as a clean log."
      onReset={() => setLog(blankLog(log.taxYear))}
      onSample={() => setLog(sampleLog(2026))}
      disclosure="This log estimates deductions using IRS standard mileage rates and general meal rules. It is not tax advice; deductibility depends on the taxpayer's facts and current law. Review with Grott Luker & Co. before filing."
    >
      <MileageEditor log={log} setLog={setLog} className="no-print" />
      <MileageReport log={log} />
    </ToolShell>
  )
}
