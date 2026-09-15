import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import KynInputs from '../components/KynInputs.jsx'
import KynSnapshot from '../components/KynSnapshot.jsx'
import { BLANK, SAMPLE, compute } from '../lib/knowYourNumbers.js'
import { money, percent } from '../lib/format.js'

// Internal CPA version: the CPA enters figures collected from the client.
// Clients fill out /client/know-your-numbers instead, and submissions land in
// the CPA results viewer at /client-results.
export default function KnowYourNumbers() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const steps = useMemo(() => {
    const r = compute(form)
    return [
      { label: 'Total assets', formula: 'sum of asset categories', result: money(r.totalAssets, 2) },
      { label: 'Total liabilities', formula: 'sum of liability categories', result: money(r.totalLiabilities, 2) },
      { label: 'Net worth', formula: `${money(r.totalAssets, 2)} − ${money(r.totalLiabilities, 2)}`, result: money(r.netWorth, 2) },
      { label: 'Total income', formula: 'sum of income categories', result: money(r.totalIncome, 2) },
      { label: 'Total expenses', formula: 'sum of expense categories', result: money(r.totalExpenses, 2) },
      { label: 'Annual cash flow', formula: `${money(r.totalIncome, 2)} − ${money(r.totalExpenses, 2)}`, result: money(r.annualCashFlow, 2) },
      { label: 'Savings rate', formula: `${money(r.annualSavings, 2)} ÷ ${money(r.totalIncome, 2)}`, result: percent(r.savingsRate, 1) },
      { label: 'Debt-to-income', formula: `${money(r.debtPayments, 2)} ÷ ${money(r.totalIncome, 2)}`, result: percent(r.dti, 1) },
    ]
  }, [form])

  return (
    <ToolShell
      title="Know Your Numbers"
      subtitle="A clean, one-page financial snapshot — a conversation starter you can share and bring to your next meeting."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      {/* Inputs are hidden when printing so the snapshot prints on its own. */}
      <KynInputs form={form} set={set} className="no-print" />
      <KynSnapshot form={form} />
    </ToolShell>
  )
}
