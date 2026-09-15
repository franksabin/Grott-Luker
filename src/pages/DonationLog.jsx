import { useEffect, useState } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { DonationEditor, DonationReport } from '../components/DonationEditor.jsx'
import { blankLog, sampleLog, compute, GIFT_TYPES, THRESHOLDS } from '../lib/donations.js'
import { money } from '../lib/format.js'

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
  const r = compute(log)
  const steps = [
    ...GIFT_TYPES.filter((t) => r.byType[t.id].count > 0).map((t) => ({ label: `${t.label} — deductible`, formula: t.id === 'securities' ? 'fair market value if held > 1 year, else cost basis' : 'amount / fair market value', result: money(r.byType[t.id].deductible, 2) })),
    { label: 'Estimated deductible contributions', formula: 'sum of the above', result: money(r.deductible, 2) },
    ...(r.avoidedGain > 0 ? [{ label: 'Capital gain avoided', formula: 'Σ (FMV − basis) on long-term securities gifted', result: money(r.avoidedGain, 2) }] : []),
    { label: 'Form 8283', formula: `non-cash total ${money(r.nonCashTotal, 2)} vs. ${money(THRESHOLDS.form8283)} threshold`, result: r.needs8283 ? 'required' : 'not required' },
    { label: 'Appraisals', formula: `non-cash items over ${money(THRESHOLDS.appraisal)}`, result: `${r.appraisalCount}` },
    { label: 'Acknowledgments needed', formula: `gifts ≥ ${money(THRESHOLDS.acknowledgment)} without a receipt letter`, result: `${r.missingAck}` },
  ]
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
      steps={steps}
      disclosure="This log organizes gifts and flags documentation rules; it does not determine deductibility, which depends on the donee's status, AGI limits, and the taxpayer's facts. Review with Grott Luker & Co. before filing."
    >
      <DonationEditor log={log} setLog={setLog} className="no-print" />
      <DonationReport log={log} />
    </ToolShell>
  )
}
