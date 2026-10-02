import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  SelectField,
  PillField,
  RefinePanel,
  StatTiles,
  ResultRow,
  Assumptions,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { StackedBar, BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber } from '../lib/format.js'
import { ordinaryTax, STANDARD_DEDUCTION, TAX_YEAR, saltCap, CHARITY_AGI_FLOOR, itemizedAfterCap, childTaxCredit, dependentCareCredit, CHILD_TAX_CREDIT } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const DEDUCTION = [
  { value: 'standard', label: 'Standard' },
  { value: 'itemized', label: 'Itemized' },
]

const QUARTERS = [
  { value: '4', label: '4 (start of year)' },
  { value: '3', label: '3' },
  { value: '2', label: '2' },
  { value: '1', label: '1 (final quarter)' },
]

// Refine-panel inputs carry a non-empty default so the tool computes without opening it.
const BLANK = {
  income: '',
  k1: '0',
  children: '0',
  careExpenses: '0',
  carePersons: '0',
  deductionType: 'standard',
  saltPaid: '0',
  mortgageInterest: '0',
  charity: '0',
  otherItemized: '0',
  priorYearTax: '0',
  withholding: '',
  paymentsMade: '',
  quartersRemaining: '4',
  filing: 'married',
  state: 'NH',
}

const SAMPLE = {
  income: '240000',
  k1: '40000',
  children: '2',
  careExpenses: '12000',
  carePersons: '2',
  deductionType: 'itemized',
  saltPaid: '18000',
  mortgageInterest: '14000',
  charity: '6000',
  otherItemized: '0',
  priorYearTax: '48000',
  withholding: '22000',
  paymentsMade: '10000',
  quartersRemaining: '2',
  filing: 'married',
  state: 'NH',
}

function compute(form) {
  const wages = toNumber(form.income)
  const k1 = toNumber(form.k1)
  const income = wages + k1
  const priorYearTax = toNumber(form.priorYearTax)
  const withholding = toNumber(form.withholding)
  const paymentsMade = toNumber(form.paymentsMade)
  const quartersRemaining = Math.max(1, Math.min(4, Math.round(toNumber(form.quartersRemaining) || 4)))
  const st = getState(form.state)
  const filing = form.filing
  const stdDed = STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married']

  // Deductions: standard, or itemized with the 2026 SALT cap, the 0.5%-of-AGI
  // charitable floor, and the 35-cent limit for top-bracket filers.
  const saltPaid = toNumber(form.saltPaid)
  const saltCapApplied = saltCap(income)
  const saltAllowed = Math.min(saltPaid, saltCapApplied)
  const charity = toNumber(form.charity)
  const charityFloor = CHARITY_AGI_FLOOR * income
  const charityAllowed = Math.max(0, charity - charityFloor)
  const itemizedRaw = saltAllowed + toNumber(form.mortgageInterest) + charityAllowed + toNumber(form.otherItemized)
  const { allowed: itemizedAllowed } = itemizedAfterCap(itemizedRaw, Math.max(0, income - itemizedRaw), filing)
  const wantsItemized = form.deductionType === 'itemized'
  const usingStandardAnyway = wantsItemized && itemizedAllowed < stdDed
  const deduction = wantsItemized ? Math.max(itemizedAllowed, stdDed) : stdDed
  const deductionBasis = wantsItemized && !usingStandardAnyway ? 'itemized' : 'standard'

  const taxable = Math.max(0, income - deduction)
  const grossFed = ordinaryTax(taxable, filing)

  // Credits: child tax credit and the dependent care credit, both income-phased.
  const children = Math.max(0, Math.round(toNumber(form.children)))
  const ctc = childTaxCredit(children, income, filing)
  const ctcFull = children * CHILD_TAX_CREDIT.amount
  const care = dependentCareCredit(toNumber(form.careExpenses), toNumber(form.carePersons), income, filing)
  const credits = ctc + care.credit
  const projectedFed = Math.max(0, grossFed - credits)
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
    wages,
    k1,
    stdDed,
    saltPaid,
    saltCapApplied,
    saltAllowed,
    charity,
    charityFloor,
    charityAllowed,
    itemizedRaw,
    itemizedAllowed,
    wantsItemized,
    usingStandardAnyway,
    deduction,
    deductionBasis,
    taxable,
    grossFed,
    children,
    ctc,
    ctcFull,
    care,
    credits,
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
      { label: 'Total income', formula: `wages & other ${money(r.wages, 2)} + K-1 income ${money(r.k1, 2)}`, result: money(r.income, 2) },
      ...(r.wantsItemized ? [
        { label: 'Itemized deductions', formula: `SALT ${money(r.saltAllowed, 2)} (paid ${money(r.saltPaid, 2)}, cap ${money(r.saltCapApplied, 2)}) + mortgage ${money(toNumber(form.mortgageInterest), 2)} + charity above the 0.5% floor ${money(r.charityAllowed, 2)} + other ${money(toNumber(form.otherItemized), 2)}`, result: money(r.itemizedAllowed, 2), note: r.itemizedAllowed < r.itemizedRaw ? 'Reduced by the 35-cent limit on itemized deductions for top-bracket filers.' : undefined },
      ] : []),
      { label: 'Deduction used', formula: r.wantsItemized ? `greater of itemized ${money(r.itemizedAllowed, 2)} and standard ${money(std, 2)}` : `standard deduction`, result: money(r.deduction, 2), note: r.usingStandardAnyway ? 'Itemized total is below the standard deduction, so the standard deduction is used.' : undefined },
      { label: 'Taxable income', formula: `max(0, ${money(r.income, 2)} − ${money(r.deduction, 2)})`, result: money(r.taxable, 2) },
      { label: 'Federal tax before credits', formula: `${TAX_YEAR} ordinary brackets applied to taxable income`, result: money(r.grossFed, 2) },
      ...(r.children > 0 ? [{ label: 'Child tax credit', formula: `${r.children} × ${money(CHILD_TAX_CREDIT.amount)}${r.ctc < r.ctcFull ? ` − $50 per $1,000 of income over ${money(CHILD_TAX_CREDIT.phaseStart[form.filing === 'single' ? 'single' : 'married'])}` : ''}`, result: money(r.ctc, 2) }] : []),
      ...(r.care.credit > 0 ? [{ label: 'Dependent care credit', formula: `${money(r.care.eligible, 2)} of eligible expenses × ${Math.round(r.care.rate * 100)}% (rate set by income)`, result: money(r.care.credit, 2) }] : []),
      { label: 'Projected federal tax', formula: `max(0, ${money(r.grossFed, 2)} − credits ${money(r.credits, 2)})`, result: money(r.projectedFed, 2) },
      { label: 'Projected state tax', formula: `${money(r.income, 2)} × ${r.stateName} wage rate`, result: money(r.projectedState, 2) },
      { label: 'Safe harbor · current year', formula: `90% × ${money(r.projectedFed, 2)}`, result: money(r.shCurrent, 2) },
      { label: 'Safe harbor · prior year', formula: r.shPrior > 0 ? `${Math.round(r.priorPct * 100)}% × prior-year tax (${r.income > 150000 ? 'AGI over $150,000' : 'AGI $150,000 or less'})` : 'no prior-year tax entered', result: r.shPrior > 0 ? money(r.shPrior, 2) : '—' },
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
              label="Wages and other income this year"
              value={form.income}
              onChange={set('income')}
              info="Expected taxable income from wages, pensions, interest, dividends, and anything else that is not on a K-1."
            />
            <MoneyField
              label="K-1 income (partnership / S-corp)"
              value={form.k1}
              onChange={set('k1')}
              info="Ordinary business income passed through on Schedule K-1. Taxed as ordinary income here; self-employment tax, passive-loss limits, and the QBI deduction are not modeled."
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
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            <PillField
              label="Quarters remaining this year"
              value={form.quartersRemaining}
              onChange={set('quartersRemaining')}
              options={QUARTERS}
            />
          </Panel>
          <RefinePanel summary="deductions, credits, prior-year tax, state">
            <SegmentedField label="Deductions" value={form.deductionType} onChange={set('deductionType')} options={DEDUCTION} />
            {form.deductionType === 'itemized' ? (
              <>
                <div className="field-row">
                  <MoneyField label="State & local taxes paid" value={form.saltPaid} onChange={set('saltPaid')} hint={`2026 cap ${money(r.saltCapApplied)} at this income`} />
                  <MoneyField label="Mortgage interest" value={form.mortgageInterest} onChange={set('mortgageInterest')} />
                </div>
                <div className="field-row">
                  <MoneyField label="Charitable gifts" value={form.charity} onChange={set('charity')} hint={r.charity > 0 ? `${money(r.charityFloor)} floor (0.5% of income) does not count` : undefined} />
                  <MoneyField label="Other itemized" value={form.otherItemized} onChange={set('otherItemized')} info="Deductible medical above the AGI floor, investment interest, etc." />
                </div>
                {r.usingStandardAnyway ? <div className="field-hint">Itemized total {money(r.itemizedAllowed)} is below the {money(r.stdDed)} standard deduction, so the standard deduction is used.</div> : null}
              </>
            ) : null}
            <div className="field-row">
              <NumberField label="Children under 17" value={form.children} onChange={set('children')} info={`Child tax credit of ${money(CHILD_TAX_CREDIT.amount)} each, phased out $50 per $1,000 of income over ${money(CHILD_TAX_CREDIT.phaseStart.single)} (single) / ${money(CHILD_TAX_CREDIT.phaseStart.married)} (joint).`} />
              <NumberField label="Dependents in paid care" value={form.carePersons} onChange={set('carePersons')} info="Children under 13 (or a disabled spouse or dependent) with day care, after-school, or summer-camp costs so the client can work." />
            </div>
            <MoneyField label="Dependent care expenses this year" value={form.careExpenses} onChange={set('careExpenses')} hint={r.care.credit > 0 ? `${money(r.care.eligible)} eligible × ${Math.round(r.care.rate * 100)}% credit at this income` : 'Up to $3,000 for one person, $6,000 for two or more. The credit rate falls from 50% to 20% as income rises.'} />
            <MoneyField
              label="Prior-year total tax"
              value={form.priorYearTax}
              onChange={set('priorYearTax')}
              info="Total tax from last year's return. The safe harbor lets you pay 100% (or 110% if AGI over $150k) of this amount to avoid penalty."
            />
            <SelectField
              label="State"
              value={form.state}
              onChange={set('state')}
              options={STATES.map((s) => ({ value: s.code, label: s.name }))}
            />
          </RefinePanel>
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
            <StatTiles
              items={[
                { label: 'Projected federal tax', value: money(r.projectedFed) },
                { label: 'Safe-harbor target', value: money(r.requiredAnnual), note: `${r.safeHarborBasis} basis` },
                r.balanceDue > 0
                  ? { label: 'Projected balance due at filing', value: money(r.balanceDue), tone: 'bad' }
                  : { label: 'Projected refund at filing', value: money(Math.abs(r.balanceDue)), tone: 'good' },
              ]}
            />
            <div className="result-list">
              <ResultRow label="Total income" value={r.income} />
              <ResultRow label={`${r.deductionBasis === 'itemized' ? 'Itemized' : 'Standard'} deduction`} value={-r.deduction} sub />
              <ResultRow label="Taxable income" value={r.taxable} />
              <ResultRow label="Federal tax before credits" value={r.grossFed} />
              {r.ctc > 0 ? <ResultRow label={`Child tax credit (${r.children})`} value={-r.ctc} sub /> : null}
              {r.care.credit > 0 ? <ResultRow label={`Dependent care credit (${Math.round(r.care.rate * 100)}%)`} value={-r.care.credit} sub /> : null}
              <ResultRow label="Projected federal tax" value={r.projectedFed} total />
              <ResultRow label={`Projected state tax (${r.stateName})`} value={r.projectedState} sub />
              <ResultRow label="Safe-harbor required (annual)" value={r.requiredAnnual} info="The lesser of 90% of this year's tax or 100%/110% of last year's tax." />
              <ResultRow label="Already covered (withholding + payments)" value={r.alreadyCovered} sub />
              <ResultRow label="Remaining required" value={r.remainingRequired} total />
              <ResultRow label="Suggested payment per quarter" value={r.perQuarter} sub />
            </div>

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
          'Uses 2026 federal ordinary brackets. Deductions are the standard deduction or, if chosen, itemized deductions with the $40,400 SALT cap (phased down above $505,000 of income), the 0.5%-of-income charitable floor, and the 35-cent limit on itemized deductions for 37%-bracket filers. Capital gains rates and QBI are not modeled.',
          'Credits: the $2,200 child tax credit per child under 17 (reduced $50 per $1,000 of income over $200,000 / $400,000) and the dependent care credit (50% of up to $3,000 / $6,000 of expenses, falling to 35% by about $45,000 of income and to 20% at higher incomes). Both are treated as non-refundable here. Other credits are not modeled.',
          'K-1 income is taxed as ordinary income; self-employment tax, passive-activity limits, and basis are not modeled. The 2026 senior deduction ($6,000 per person 65+) is not applied because age is not collected.',
          'The safe harbor is the lesser of 90% of the current-year tax or 100% of the prior-year tax (110% if prior-year AGI exceeds $150,000).',
          'Withholding is treated as paid evenly across the year. The tool divides the remaining requirement evenly across the quarters you select; timing of uneven income (annualized method) is not modeled.',
          'State tax is a simplified estimate and is shown for context only; safe-harbor figures are federal.',
          'This is a planning estimate and does not replace a formal Form 1040-ES calculation.',
        ]}
      />
    </ToolShell>
  )
}
