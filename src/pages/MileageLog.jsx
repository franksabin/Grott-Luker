import { useEffect, useState } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { MileageEditor, MileageReport } from '../components/MileageEditor.jsx'
import { blankLog, sampleLog, compute, PURPOSES } from '../lib/mileage.js'
import { money, number } from '../lib/format.js'

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
  const r = compute(log)
  const steps = [
    ...PURPOSES.filter((p) => r.byPurpose[p.id].miles > 0).map((p) => ({ label: `${p.label} miles × rate by trip date`, formula: `${number(r.byPurpose[p.id].miles)} miles; each trip × the IRS rate in effect on its date`, result: money(r.byPurpose[p.id].amount, 2) })),
    { label: 'Mileage deduction', formula: 'sum of purposes above', result: money(r.totalMileage, 2) },
    ...(r.byTreatment.ok.count ? [{ label: 'Expenses counted in full', formula: `${r.byTreatment.ok.count} ${r.byTreatment.ok.count === 1 ? 'entry' : 'entries'} · supplies, dues, software, and the like`, result: money(r.byTreatment.ok.deductible, 2) }] : []),
    ...(r.byTreatment.limited.count ? [{ label: 'Partly deductible expenses', formula: `meals at 50% of ${money(r.mealsTotal, 2)}; gifts capped at $25 per recipient`, result: money(r.byTreatment.limited.deductible, 2) }] : []),
    ...(r.byTreatment.ask.count ? [{ label: 'Recorded for CPA review, not counted', formula: `${r.byTreatment.ask.count} ${r.byTreatment.ask.count === 1 ? 'entry' : 'entries'} · equipment, phone, home office, inventory`, result: money(r.reviewTotal, 2), note: 'Depends on business-use share, cost per item, or exclusive use.' }] : []),
    ...(r.byTreatment.not.count ? [{ label: 'Not deductible', formula: `${r.byTreatment.not.count} ${r.byTreatment.not.count === 1 ? 'entry' : 'entries'} · entertainment, clothing, commuting, vehicle costs on the mileage method`, result: money(0, 2) }] : []),
    { label: 'Estimated deduction', formula: `${money(r.totalMileage, 2)} mileage + ${money(r.expenseDeductible, 2)} expenses`, result: money(r.estimatedDeduction, 2) },
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
      title="Mileage & Expense Log"
      subtitle="Log business, charity, and medical mileage plus meals and other expenses through the year. Pick the client’s line of work and each expense is flagged as deductible, limited, for the CPA, or not deductible; the IRS standard rate applies by trip date, and the year-end summary prints as a clean log."
      onReset={() => setLog(blankLog(log.taxYear))}
      onSample={() => setLog(sampleLog(2026))}
      steps={steps}
      disclosure="This log estimates deductions using IRS standard mileage rates and general expense rules by line of work. It is not tax advice; deductibility depends on the taxpayer's facts and current law. Review with Grott Luker & Co. before filing."
    >
      <MileageEditor log={log} setLog={setLog} className="no-print" />
      <MileageReport log={log} />
    </ToolShell>
  )
}
