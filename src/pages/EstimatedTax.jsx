import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  SegmentedField,
  SelectField,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { StackedBar, BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ordinaryTax, STANDARD_DEDUCTION, TAX_YEAR } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const BLANK = {
  income: '',
  priorYearTax: '',
  withholding: '',
  paymentsMade: '',
  quartersRemaining: '4',
  filing: 'married',
  state: 'NH',
}

const SAMPLE = {
  income: '280000',
  priorYearTax: '48000',
  withholding: '22000',
  paymentsMade: '10000',
  quartersRemaining: '2',
  filing: 'married',
  state: 'NH',
}

function compute(form) {
  const income = toNumber(form.income)
  const priorYearTax = toNumber(form.priorYearTax)
  const withholding = toNumber(form.withholding)
  const paymentsMade = toNumber(form.paymentsMade)
  const quartersRemaining = Math.max(1, Math.min(4, Math.round(toNumber(form.quartersRemaining) || 4)))
  const st = getState(form.state)
  const filing = form.filing
  const stdDed = STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married']

  const taxable = Math.max(0, income - stdDed)
  const projectedFed = ordinaryTax(taxable, filing)
  const projectedState = income * (st.wage / 100)

  // Safe harbor: lesser of 90% of current-year tax or 100%/110% of prior year.
  const highIncome = income > 150000
  const priorPct = highIncome ? 1.1 : 1.0
  const shCurrent = 0.9 * projectedFed
  const shPrior = priorPct * priorYearTax
  const requiredAnnual = priorYearTax > 0 ? Math.min(shCurrent, shPrior) : shCurrent
  const safeHarborBasis = priorYearTax > 0 && shPrior < shCurrent ? 'prior-year' : 'current-year'

  const alreadyCovered = withholding + paymentsMade
  const remainingRequired = Math.max(0, requiredAnnual - alreadyCovered)
  const perQuarter = remainingRequired / quartersRemaining

  // At filing: projected balance due or refund (federal).
  const balanceDue = projectedFed - alreadyCovered
  const underpaymentExposure = Math.max(0, requiredAnnual - alreadyCovered)

  return {
    income,
    projectedFed,
    projectedState,
    requiredAnnual,
    shCurrent,
    shPrior,
    safeHarborBasis,
    priorPct,
    withholding,
    paymentsMade,
    alreadyCovered,
    remainingRequired,
    perQuarter,
    quartersRemaining,
    balanceDue,
    underpaymentExposure,
    stateName: st.name,
  }
}

export default function EstimatedTax() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => {
    const std = STANDARD_DEDUCTION[form.filing === 'single' ? 'single' : 'married']
    return [
      { label: 'Taxable income', formula: `max(0, ${money(r.income, 2)} − standard deduction ${money(std, 2)})`, result: money(Math.max(0, r.income - std), 2) },
      { label: 'Projected federal tax', formula: `${TAX_YEAR} ordinary brackets applied to taxable income`, result: money(r.projectedFed, 2) },
      { label: 'Projected state tax', formula: `${money(r.income, 2)} × ${r.stateName} wage rate`, result: money(r.projectedState, 2) },
      { label: 'Safe harbor · current year', formula: `90% × ${money(r.projectedFed, 2)}`, result: money(r.shCurrent, 2) },
      { label: 'Safe harbor · prior year', formula: r.shPrior > 0 ? `${r.priorPct * 100}% × prior-year tax (${r.income > 150000 ? 'AGI over $150,000' : 'AGI $150,000 or less'})` : 'no prior-year tax entered', result: r.shPrior > 0 ? money(r.shPrior, 2) : '—' },
      { label: 'Required annual payments', formula: r.shPrior > 0 ? 'lesser of the two safe harbors' : 'current-year safe harbor', result: money(r.requiredAnnual, 2), note: `Basis: ${r.safeHarborBasis}.` },
      { label: 'Already covered', formula: `withholding ${money(r.withholding, 2)} + estimates paid ${money(r.paymentsMade, 2)}`, result: money(r.alreadyCovered, 2) },
      { label: 'Remaining to reach safe harbor', formula: `max(0, ${money(r.requiredAnnual, 2)} − ${money(r.alreadyCovered, 2)})`, result: money(r.remainingRequired, 2) },
      { label: 'Per remaining quarter', formula: `${money(r.remainingRequired, 2)} ÷ ${r.quartersRemaining}`, result: money(r.perQuarter, 2) },
      { label: 'Projected federal balance due at filing', formula: `${money(r.projectedFed, 2)} − ${money(r.alreadyCovered, 2)}`, result: money(r.balanceDue, 2), note: 'Negative means a projected refund.' },
    ]
  }, [r, form.filing])

  return (
    <ToolShell
      title="Estimated Tax & Safe Harbor Planner"
      subtitle="Project the year's federal tax, test the safe-harbor thresholds, account for withholding and payments already made, and calculate the remaining quarterly payments needed to avoid an underpayment penalty."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Income & Payments">
            <MoneyField
              label="Expected total income this year"
              value={form.income}
              onChange={set('income')}
              info="Total expected taxable income for the year from all sources."
            />
            <MoneyField
              label="Prior-year total tax"
              value={form.priorYearTax}
              onChange={set('priorYearTax')}
              info="Total tax from last year's return. The safe harbor lets you pay 100% (or 110% if AGI over $150k) of this amount to avoid penalty."
            />
            <MoneyField
              label="Withholding expected this year"
              value={form.withholding}
              onChange={set('withholding')}
              info="Federal tax withheld from wages, pensions, or other sources. Withholding counts as paid evenly through the year."
            />
            <MoneyField
              label="Estimated payments already made"
              value={form.paymentsMade}
              onChange={set('paymentsMade')}
            />
            <div className="field-row">
              <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
              <SelectField
                label="State"
                value={form.state}
                onChange={set('state')}
                options={STATES.map((s) => ({ value: s.code, label: s.name }))}
              />
            </div>
            <SelectField
              label="Quarters remaining this year"
              value={form.quartersRemaining}
              onChange={set('quartersRemaining')}
              options={[
                { value: '4', label: '4 (start of year)' },
                { value: '3', label: '3' },
                { value: '2', label: '2' },
                { value: '1', label: '1 (final quarter)' },
              ]}
            />
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Estimated Tax Plan"
              meta="Safe-harbor compliance"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={`Remaining payment needed (${r.quartersRemaining} ${r.quartersRemaining === 1 ? 'quarter' : 'quarters'})`}
              value={money(r.perQuarter)}
              note={`${money(r.remainingRequired)} total remaining · per quarter`}
            />
            <Narrative>
              We project {money(r.projectedFed)} of federal tax this year. The
              safe harbor requires paying at least {money(r.requiredAnnual)}{' '}
              (the {r.safeHarborBasis} basis is lower). With {money(r.alreadyCovered)}{' '}
              already covered by withholding and prior payments, an estimated{' '}
              {money(r.remainingRequired)} remains — about {money(r.perQuarter)} per
              remaining quarter to stay penalty-safe.
              {r.balanceDue > 0
                ? ` A balance of roughly ${money(r.balanceDue)} is still projected at filing.`
                : ` A refund of roughly ${money(Math.abs(r.balanceDue))} is projected at filing.`}
            </Narrative>

            <div className="result-list">
              <ResultRow label="Projected federal tax" value={r.projectedFed} />
              <ResultRow label={`Projected state tax (${r.stateName})`} value={r.projectedState} sub />
              <ResultRow label="Safe-harbor required (annual)" value={r.requiredAnnual} info="The lesser of 90% of this year's tax or 100%/110% of last year's tax." />
              <ResultRow label="Already covered (withholding + payments)" value={r.alreadyCovered} sub />
              <ResultRow label="Remaining required" value={r.remainingRequired} total />
              <ResultRow label="Suggested payment per quarter" value={r.perQuarter} sub />
            </div>

            <div className="chart-block" style={{ marginTop: 22 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Funding the safe-harbor requirement
              </div>
              <StackedBar
                data={[
                  { label: 'Withholding', value: r.withholding, color: TONE.navy },
                  { label: 'Payments made', value: r.paymentsMade, color: TONE.accent },
                  { label: 'Remaining needed', value: r.remainingRequired, color: TONE.tax },
                ]}
              />
            </div>

            <div className="chart-block" style={{ marginTop: 20 }}>
              <BarCompare
                height={150}
                groups={[
                  { label: '90% of this year', bars: [{ label: 'Current-year', value: r.shCurrent, color: TONE.debt }] },
                  { label: `${Math.round(r.priorPct * 100)}% of last year`, bars: [{ label: 'Prior-year', value: r.shPrior, color: TONE.accent }] },
                ]}
              />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Assumptions
        items={[
          'Uses 2026 federal ordinary brackets and the standard deduction to project federal tax; itemized deductions, credits, capital gains, and QBI are not modeled.',
          'The safe harbor is the lesser of 90% of the current-year tax or 100% of the prior-year tax (110% if prior-year AGI exceeds $150,000).',
          'Withholding is treated as paid evenly across the year. The tool divides the remaining requirement evenly across the quarters you select; timing of uneven income (annualized method) is not modeled.',
          'State tax is a simplified estimate and is shown for context only; safe-harbor figures are federal.',
          'This is a planning estimate and does not replace a formal Form 1040-ES calculation.',
        ]}
      />
    </ToolShell>
  )
}
