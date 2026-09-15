import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  SelectField,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
  Callout,
} from '../components/ui.jsx'
import { StackedBar, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ordinaryTax, marginalOrdinaryRate, STANDARD_DEDUCTION, TAX_YEAR } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const FREQ = [
  { value: '52', label: 'Weekly (52)' },
  { value: '26', label: 'Biweekly (26)' },
  { value: '24', label: 'Semimonthly (24)' },
  { value: '12', label: 'Monthly (12)' },
]

const DEDUCTION = [
  { value: 'standard', label: 'Standard deduction' },
  { value: 'itemized', label: 'Itemized' },
]

const BLANK = {
  filing: 'married',
  frequency: '26',
  periodsPaid: '',
  ytdWages: '',
  ytdWithholding: '',
  spouseYtdWages: '',
  spouseYtdWithholding: '',
  bonus: '',
  otherIncome: '',
  deductionType: 'standard',
  itemized: '',
  credits: '',
  estimatedPayments: '',
}

const SAMPLE = {
  filing: 'married',
  frequency: '26',
  periodsPaid: '18',
  ytdWages: '112500',
  ytdWithholding: '13400',
  spouseYtdWages: '58200',
  spouseYtdWithholding: '4900',
  bonus: '15000',
  otherIncome: '6500',
  deductionType: 'standard',
  itemized: '',
  credits: '4000',
  estimatedPayments: '0',
}

function compute(form) {
  const filing = form.filing === 'single' ? 'single' : 'married'
  const periodsTotal = Math.max(1, Math.round(toNumber(form.frequency) || 26))
  const periodsPaid = Math.min(periodsTotal, Math.max(0, Math.round(toNumber(form.periodsPaid))))
  const remaining = Math.max(0, periodsTotal - periodsPaid)

  const ytdWages = toNumber(form.ytdWages)
  const ytdWH = toNumber(form.ytdWithholding)
  const spWages = filing === 'married' ? toNumber(form.spouseYtdWages) : 0
  const spWH = filing === 'married' ? toNumber(form.spouseYtdWithholding) : 0
  const bonus = toNumber(form.bonus)
  const other = toNumber(form.otherIncome)
  const credits = toNumber(form.credits)
  const estPayments = toNumber(form.estimatedPayments)

  const pace = (ytd) => (periodsPaid > 0 ? ytd / periodsPaid : 0)
  const perWages = pace(ytdWages)
  const perWH = pace(ytdWH)
  const spPerWages = pace(spWages)
  const spPerWH = pace(spWH)

  const projWages = ytdWages + perWages * remaining + bonus
  const projSpouseWages = spWages + spPerWages * remaining
  const projIncome = projWages + projSpouseWages + other

  const stdDed = STANDARD_DEDUCTION[filing]
  const itemized = toNumber(form.itemized)
  const deduction = form.deductionType === 'itemized' ? Math.max(itemized, 0) : stdDed
  const usingStandardAnyway = form.deductionType === 'itemized' && itemized < stdDed
  const effectiveDeduction = Math.max(deduction, form.deductionType === 'itemized' ? 0 : stdDed)

  const taxable = Math.max(0, projIncome - effectiveDeduction)
  const grossTax = ordinaryTax(taxable, filing)
  const projTax = Math.max(0, grossTax - credits)
  const marginal = marginalOrdinaryRate(taxable, filing)

  const projWithholding = ytdWH + perWH * remaining + spWH + spPerWH * remaining
  const projPaid = projWithholding + estPayments
  const gap = projTax - projPaid // + = balance due, - = refund

  const extraPerCheck = remaining > 0 && gap > 0 ? gap / remaining : 0
  const reducePerCheck = remaining > 0 && gap < 0 ? Math.abs(gap) / remaining : 0

  // Penalty exposure under the 90% current-year test (prior-year test lives in
  // the Estimated Tax tool).
  const ninety = 0.9 * projTax
  const penaltyShortfall = Math.max(0, ninety - projPaid)
  const extraToSafeHarbor = remaining > 0 ? penaltyShortfall / remaining : 0

  const coverage = projTax > 0 ? projPaid / projTax : 1

  return {
    filing, periodsTotal, periodsPaid, remaining,
    ytdWages, ytdWH, spWages, spWH, bonus, other, credits, estPayments,
    perWages, perWH, projWages, projSpouseWages, projIncome,
    deduction: effectiveDeduction, usingStandardAnyway, stdDed,
    taxable, grossTax, projTax, marginal,
    projWithholding, projPaid, gap, extraPerCheck, reducePerCheck,
    ninety, penaltyShortfall, extraToSafeHarbor, coverage,
  }
}

export default function WithholdingCheckup() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Pay periods', formula: `${r.periodsTotal} per year − ${r.periodsPaid} paid`, result: `${r.remaining} remaining` },
    { label: 'Per-period pace', formula: `wages ${money(r.ytdWages, 2)} ÷ ${r.periodsPaid} · withholding ${money(r.ytdWH, 2)} ÷ ${r.periodsPaid}`, result: `${money(r.perWages, 2)} · ${money(r.perWH, 2)}` },
    { label: 'Projected wages (primary)', formula: `${money(r.ytdWages, 2)} + ${r.remaining} × ${money(r.perWages, 2)} + bonus ${money(r.bonus, 2)}`, result: money(r.projWages, 2) },
    ...(r.spWages > 0 ? [{ label: 'Projected wages (spouse)', formula: `${money(r.spWages, 2)} + ${r.remaining} × ${money(r.spWages / Math.max(1, r.periodsPaid), 2)}`, result: money(r.projSpouseWages, 2) }] : []),
    { label: 'Total income', formula: `${money(r.projWages, 2)}${r.spWages > 0 ? ` + ${money(r.projSpouseWages, 2)}` : ''} + other ${money(r.other, 2)}`, result: money(r.projIncome, 2) },
    { label: 'Taxable income', formula: `${money(r.projIncome, 2)} − deduction ${money(r.deduction, 2)}`, result: money(r.taxable, 2), note: r.usingStandardAnyway ? 'Itemized total was below the standard deduction, so the standard deduction is used.' : undefined },
    { label: 'Federal tax by bracket', formula: `${TAX_YEAR} ${r.filing === 'single' ? 'single' : 'MFJ'} brackets applied to ${money(r.taxable, 2)} (marginal ${percent(r.marginal * 100, 0)})`, result: money(r.grossTax, 2) },
    { label: 'Less credits', formula: `${money(r.grossTax, 2)} − ${money(r.credits, 2)}`, result: money(r.projTax, 2) },
    { label: 'Projected withholding', formula: `${money(r.ytdWH + r.spWH, 2)} to date + ${r.remaining} × ${money(r.perWH + r.spWH / Math.max(1, r.periodsPaid), 2)}${r.estPayments > 0 ? ` + estimated payments ${money(r.estPayments, 2)}` : ''}`, result: money(r.projPaid, 2) },
    { label: r.gap > 0 ? 'Shortfall' : 'Overpayment', formula: `${money(r.projTax, 2)} − ${money(r.projPaid, 2)}`, result: money(Math.abs(r.gap), 2) },
    ...(r.remaining > 0 && r.gap > 0 ? [
      { label: 'Extra per paycheck to close the gap', formula: `${money(r.gap, 2)} ÷ ${r.remaining}`, result: money(r.extraPerCheck, 2) },
      { label: 'Minimum for the 90% test', formula: `max(0, 90% × ${money(r.projTax, 2)} − ${money(r.projPaid, 2)}) ÷ ${r.remaining}`, result: money(r.extraToSafeHarbor, 2) },
    ] : []),
  ], [r])
  const married = form.filing === 'married'
  const owes = r.gap > 0

  return (
    <ToolShell
      title="Withholding Checkup (W-4)"
      subtitle="Will this client owe in April? Project full-year tax from a recent pay stub, compare it to withholding on the current pace, and get the W-4 adjustment that closes the gap over the remaining paychecks."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="From the most recent pay stub">
            <div className="field-row">
              <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
              <SelectField label="Pay frequency" value={form.frequency} onChange={set('frequency')} options={FREQ} />
            </div>
            <NumberField
              label="Pay periods paid so far this year"
              value={form.periodsPaid}
              onChange={set('periodsPaid')}
              info="Count the paychecks received to date. The tool assumes the same pay and withholding continue for the remaining periods."
              hint={r.periodsPaid > 0 ? `${r.remaining} paychecks remain of ${r.periodsTotal}` : undefined}
            />
            <div className="field-row">
              <MoneyField label="YTD taxable wages" value={form.ytdWages} onChange={set('ytdWages')} info="Federal taxable wages year-to-date (after pre-tax 401(k), health premiums, etc.)." />
              <MoneyField label="YTD federal withholding" value={form.ytdWithholding} onChange={set('ytdWithholding')} />
            </div>
            {married ? (
              <div className="field-row">
                <MoneyField label="Spouse YTD taxable wages" value={form.spouseYtdWages} onChange={set('spouseYtdWages')} hint="Leave blank if none." />
                <MoneyField label="Spouse YTD federal withholding" value={form.spouseYtdWithholding} onChange={set('spouseYtdWithholding')} />
              </div>
            ) : null}
          </Panel>

          <Panel title="Rest of the year">
            <div className="field-row">
              <MoneyField label="Bonus or other wages still expected" value={form.bonus} onChange={set('bonus')} info="Wages beyond the regular pace — a year-end bonus, RSU vest, commission." />
              <MoneyField label="Other income (not from wages)" value={form.otherIncome} onChange={set('otherIncome')} info="Interest, dividends, side income, retirement distributions — anything with little or no withholding." />
            </div>
            <div className="field-row">
              <SegmentedField label="Deductions" value={form.deductionType} onChange={set('deductionType')} options={DEDUCTION} />
              {form.deductionType === 'itemized' ? (
                <MoneyField label="Itemized total" value={form.itemized} onChange={set('itemized')} hint={r.usingStandardAnyway ? `Below the ${money(r.stdDed)} standard deduction — standard used.` : undefined} />
              ) : (
                <div />
              )}
            </div>
            <div className="field-row">
              <MoneyField label="Tax credits expected" value={form.credits} onChange={set('credits')} info="Child tax credit, dependent care, education credits — reduce tax dollar for dollar." />
              <MoneyField label="Estimated payments made" value={form.estimatedPayments} onChange={set('estimatedPayments')} />
            </div>
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Withholding Checkup"
              meta={`Tax year ${TAX_YEAR} projection · ${r.remaining} paychecks remaining`}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={owes ? 'Projected balance due at filing' : 'Projected refund at filing'}
              value={money(Math.abs(r.gap))}
              note={`${money(r.projTax)} projected tax · ${money(r.projPaid)} projected withholding & payments · ${percent(r.coverage * 100, 0)} covered`}
            />

            {r.remaining > 0 && owes ? (
              <Callout
                label="W-4 adjustment — Step 4(c), extra withholding per paycheck"
                value={money(r.extraPerCheck)}
                rightLabel="Minimum to avoid penalty (90% test)"
                rightValue={money(r.extraToSafeHarbor)}
                tone={r.penaltyShortfall > 0 ? 'warn' : 'good'}
              />
            ) : null}
            {r.remaining > 0 && !owes && r.reducePerCheck > 0 ? (
              <Callout
                label="Over-withheld — could reduce per paycheck by"
                value={money(r.reducePerCheck)}
                rightLabel="Projected refund"
                rightValue={money(Math.abs(r.gap))}
                tone="good"
              />
            ) : null}

            <Narrative>
              On the current pace, {married ? 'the household' : 'the client'} ends the year with about{' '}
              {money(r.projIncome)} of income and {money(r.projTax)} of federal tax
              {r.credits > 0 ? ` after ${money(r.credits)} in credits` : ''}. Withholding is running at{' '}
              {money(r.projWithholding)} for the year
              {r.estPayments > 0 ? ` plus ${money(r.estPayments)} in estimated payments` : ''}, which{' '}
              {owes ? `leaves a shortfall of ${money(r.gap)}` : `produces a refund of ${money(Math.abs(r.gap))}`}.
              {owes && r.remaining > 0
                ? ` Adding ${money(r.extraPerCheck)} of extra withholding on each of the remaining ${r.remaining} paychecks closes the gap; ${money(r.extraToSafeHarbor)} per paycheck is the minimum to reach the 90% safe harbor.`
                : ''}
              {owes && r.remaining === 0 ? ' No paychecks remain — the balance should be covered with an estimated payment.' : ''}
            </Narrative>

            <div className="result-list">
              <ResultRow label="Projected wages (primary)" value={r.projWages} />
              {married && r.projSpouseWages > 0 ? <ResultRow label="Projected wages (spouse)" value={r.projSpouseWages} /> : null}
              {r.other > 0 ? <ResultRow label="Other income" value={r.other} /> : null}
              <ResultRow label="Deduction" value={-r.deduction} sub />
              <ResultRow label="Taxable income" value={r.taxable} />
              <ResultRow label={`Federal tax (marginal ${percent(r.marginal * 100, 0)})`} value={r.grossTax} />
              {r.credits > 0 ? <ResultRow label="Credits" value={-r.credits} sub /> : null}
              <ResultRow label="Projected tax" value={r.projTax} total />
              <ResultRow label="Projected withholding (current pace)" value={r.projWithholding} />
              {r.estPayments > 0 ? <ResultRow label="Estimated payments" value={r.estPayments} sub /> : null}
              <ResultRow label={owes ? 'Balance due' : 'Refund'} value={Math.abs(r.gap)} total negative={owes} positive={!owes} />
            </div>

            <div className="chart-block" style={{ marginTop: 22 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Covering the projected tax
              </div>
              <StackedBar
                data={[
                  { label: 'Withheld to date', value: r.ytdWH + r.spWH, color: TONE.navy },
                  { label: 'Remaining paychecks (current pace)', value: r.projWithholding - r.ytdWH - r.spWH, color: TONE.accent },
                  ...(r.estPayments > 0 ? [{ label: 'Estimated payments', value: r.estPayments, color: TONE.debt }] : []),
                  ...(owes ? [{ label: 'Shortfall', value: r.gap, color: TONE.tax }] : []),
                ]}
              />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="How to apply the adjustment">
        On a new Form W-4, enter the extra per-paycheck amount on <strong>Step 4(c)</strong>. It takes effect with the next payroll cycle, so if there are only a few paychecks left, an estimated payment may be the surer route — see the Estimated Tax &amp; Safe Harbor Planner for the prior-year safe harbor.
      </Note>

      <Assumptions
        items={[
          `Uses ${TAX_YEAR} federal ordinary brackets and the standard deduction. Capital gains, QBI, AMT, the additional Medicare tax, and phaseouts are not modeled.`,
          'Remaining wages and withholding are projected at the year-to-date pace per pay period; a bonus is added on top with no assumed withholding — enter any bonus withholding as part of YTD once it is paid.',
          'The 90% safe-harbor test uses this year’s projected tax; the 100%/110% prior-year alternative is in the Estimated Tax tool.',
          'State withholding is not modeled. New Hampshire has no wage tax; for MA/ME clients a separate state check applies.',
          'This is a planning estimate from a single pay stub, not a substitute for a completed Form W-4 worksheet.',
        ]}
      />
    </ToolShell>
  )
}
