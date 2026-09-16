import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  SegmentedField,
  SelectField,
  RefinePanel,
  StatTiles,
  ScenarioCards,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber } from '../lib/format.js'
import { ordinaryTax, selfEmploymentTax, ficaOnSalary, STANDARD_DEDUCTION, SS_WAGE_BASE, TAX_YEAR } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

// Refine-panel inputs carry a non-empty default so the tool computes without opening it.
const BLANK = {
  netProfit: '',
  salary: '',
  otherIncome: '0',
  filing: 'married',
  state: 'NH',
}

const SAMPLE = {
  netProfit: '300000',
  salary: '120000',
  otherIncome: '0',
  filing: 'married',
  state: 'NH',
}

// Simplified QBI: 20% of qualified income, limited to 20% of taxable income.
function qbiDeduction(qbiIncome, taxableBeforeQbi) {
  return Math.min(0.2 * Math.max(0, qbiIncome), 0.2 * Math.max(0, taxableBeforeQbi))
}

function compute(form) {
  const netProfit = toNumber(form.netProfit)
  const salary = Math.min(toNumber(form.salary), netProfit)
  const otherIncome = toNumber(form.otherIncome)
  const st = getState(form.state)
  const filing = form.filing
  const stdDed = STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married']
  const stateRate = st.wage / 100

  // --- Strategy 1: Sole proprietor / disregarded LLC (all profit is SE income) ---
  const se = selfEmploymentTax(netProfit)
  const soleQbiIncome = netProfit - se / 2
  const soleOrdinaryBeforeQbi = soleQbiIncome + otherIncome - stdDed
  const soleQbi = qbiDeduction(soleQbiIncome, soleOrdinaryBeforeQbi)
  const soleIncomeTax = ordinaryTax(Math.max(0, soleOrdinaryBeforeQbi - soleQbi), filing)
  const soleState = Math.max(0, soleQbiIncome + otherIncome) * stateRate
  const soleTotal = se + soleIncomeTax + soleState

  // --- Strategy 2: S-corporation (reasonable salary + distribution) ---
  const employerFica = ficaOnSalary(salary) / 2 // employer half is a business expense
  const fica = ficaOnSalary(salary) // total FICA burden on the salary
  const distribution = Math.max(0, netProfit - salary - employerFica)
  const scorpQbiIncome = distribution // K-1 pass-through, net of wages
  const scorpOrdinaryBeforeQbi = salary + distribution + otherIncome - stdDed
  const scorpQbi = qbiDeduction(scorpQbiIncome, scorpOrdinaryBeforeQbi)
  const scorpIncomeTax = ordinaryTax(Math.max(0, scorpOrdinaryBeforeQbi - scorpQbi), filing)
  const scorpState = Math.max(0, salary + distribution + otherIncome) * stateRate
  const scorpTotal = fica + scorpIncomeTax + scorpState

  const savings = soleTotal - scorpTotal

  return {
    netProfit,
    salary,
    distribution,
    se,
    fica,
    soleQbi,
    scorpQbi,
    soleIncomeTax,
    scorpIncomeTax,
    soleState,
    scorpState,
    soleTotal,
    scorpTotal,
    savings,
    stateName: st.name,
  }
}

export default function OwnerComp() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Sole prop · self-employment tax', formula: `${money(r.netProfit, 2)} × 92.35% × 15.3% (12.4% capped at the ${money(SS_WAGE_BASE)} wage base)`, result: money(r.se, 2) },
    { label: 'Sole prop · QBI deduction', formula: 'lesser of 20% × (profit − ½ SE tax) and 20% × taxable income', result: money(r.soleQbi, 2) },
    { label: 'Sole prop · federal income tax', formula: `${TAX_YEAR} brackets on profit − ½ SE tax + other income − standard deduction − QBI`, result: money(r.soleIncomeTax, 2) },
    { label: 'Sole prop · state tax', formula: `income × ${r.stateName} rate`, result: money(r.soleState, 2) },
    { label: 'Sole prop · total tax', formula: 'SE + federal + state', result: money(r.soleTotal, 2) },
    { label: 'S-corp · payroll tax on salary', formula: `${money(r.salary, 2)} × 15.3% (employer + employee)`, result: money(r.fica, 2) },
    { label: 'S-corp · distribution', formula: `${money(r.netProfit, 2)} − salary − employer half of payroll tax`, result: money(r.distribution, 2) },
    { label: 'S-corp · QBI deduction', formula: 'lesser of 20% × distribution and 20% × taxable income', result: money(r.scorpQbi, 2) },
    { label: 'S-corp · federal income tax', formula: `${TAX_YEAR} brackets on salary + distribution + other income − standard deduction − QBI`, result: money(r.scorpIncomeTax, 2) },
    { label: 'S-corp · state tax', formula: `income × ${r.stateName} rate`, result: money(r.scorpState, 2) },
    { label: 'S-corp · total tax', formula: 'payroll + federal + state', result: money(r.scorpTotal, 2) },
    { label: 'Savings from S-corp election', formula: `${money(r.soleTotal, 2)} − ${money(r.scorpTotal, 2)}`, result: money(r.savings, 2), note: 'Before payroll-service and tax-return costs of running an S-corp.' },
  ], [r])

  return (
    <ToolShell
      title="Owner Compensation Optimizer"
      subtitle="Compare paying yourself as a sole proprietor / LLC versus taking a reasonable salary plus distributions through an S-corporation — including payroll and self-employment tax, the QBI deduction, and total tax by strategy."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Business & Owner Profile">
            <MoneyField
              label="Business net profit"
              value={form.netProfit}
              onChange={set('netProfit')}
              info="Net profit of the business before any owner salary or compensation."
            />
            <MoneyField
              label="Reasonable salary (S-corp)"
              value={form.salary}
              onChange={set('salary')}
              info="A reasonable W-2 salary for your role — required for an S-corp. Only the salary is subject to payroll tax; the remaining profit is taken as a distribution."
            />
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
          </Panel>
          <RefinePanel summary="other household income, state">
            <MoneyField
              label="Other household taxable income"
              value={form.otherIncome}
              onChange={set('otherIncome')}
              info="Other taxable income, such as a spouse's wages. Affects the tax bracket the business income falls into."
            />
            <SelectField
              label="State"
              value={form.state}
              onChange={set('state')}
              options={STATES.map((s) => ({ value: s.code, label: s.name }))}
            />
          </RefinePanel>
          <Note title="What drives the difference">
            An S-corporation can save payroll tax because only the salary is
            subject to FICA — the distribution is not. But too low a salary
            invites IRS scrutiny, and a lower salary can also reduce the QBI
            deduction and retirement-plan contribution room. This tool shows the
            headline tax trade-off; the right salary is a judgment call.
          </Note>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Compensation Strategy Comparison"
              meta="Sole prop / LLC vs. S-corporation"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={r.savings >= 0 ? 'Estimated tax savings with S-corp strategy' : 'S-corp strategy costs more by'}
              value={money(Math.abs(r.savings))}
              note={`On ${money(r.netProfit)} of net profit · ${money(r.salary)} salary`}
            />
            <StatTiles
              items={[
                { label: 'Sole prop / LLC total tax', value: money(r.soleTotal) },
                { label: 'S-corporation total tax', value: money(r.scorpTotal) },
                { label: 'S-corp distribution', value: money(r.distribution), note: 'not subject to payroll tax' },
              ]}
            />
            <Narrative>
              On {money(r.netProfit)} of net profit, taking it all as
              self-employment income results in an estimated {money(r.soleTotal)}{' '}
              of total tax. Paying a {money(r.salary)} salary through an
              S-corporation and taking {money(r.distribution)} as a distribution
              results in an estimated {money(r.scorpTotal)} —{' '}
              {r.savings >= 0
                ? `a savings of about ${money(r.savings)}, driven largely by payroll tax avoided on the distribution.`
                : `about ${money(Math.abs(r.savings))} more, once QBI and other effects are considered.`}
            </Narrative>

            <ScenarioCards
              sub="estimated total tax"
              scenarios={[
                {
                  label: 'Sole prop / LLC',
                  value: money(r.soleTotal),
                  best: r.savings < 0,
                  rows: [
                    { label: 'Self-employment tax', value: money(r.se) },
                    { label: 'Federal income tax', value: money(r.soleIncomeTax) },
                    { label: 'QBI deduction', value: money(r.soleQbi) },
                  ],
                },
                {
                  label: 'S-corporation',
                  value: money(r.scorpTotal),
                  best: r.savings >= 0,
                  rows: [
                    { label: 'Payroll tax', value: money(r.fica) },
                    { label: 'Federal income tax', value: money(r.scorpIncomeTax) },
                    { label: 'QBI deduction', value: money(r.scorpQbi) },
                  ],
                },
              ]}
            />

            <div className="chart-block" style={{ marginTop: 20 }}>
              <BarCompare
                groups={[
                  {
                    label: 'Sole prop / LLC',
                    bars: [
                      { label: 'Payroll / SE tax', value: r.se, color: TONE.tax },
                      { label: 'Income + state tax', value: r.soleIncomeTax + r.soleState, color: TONE.debt },
                    ],
                  },
                  {
                    label: 'S-corporation',
                    bars: [
                      { label: 'Payroll / SE tax', value: r.fica, color: TONE.tax },
                      { label: 'Income + state tax', value: r.scorpIncomeTax + r.scorpState, color: TONE.debt },
                    ],
                  },
                ]}
              />
            </div>

            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th className="num">Sole prop / LLC</th>
                    <th className="num">S-corporation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Payroll / self-employment tax</td>
                    <td className="num">{money(r.se)}</td>
                    <td className="num">{money(r.fica)}</td>
                  </tr>
                  <tr>
                    <td>QBI deduction</td>
                    <td className="num">{money(r.soleQbi)}</td>
                    <td className="num">{money(r.scorpQbi)}</td>
                  </tr>
                  <tr>
                    <td>Federal income tax</td>
                    <td className="num">{money(r.soleIncomeTax)}</td>
                    <td className="num">{money(r.scorpIncomeTax)}</td>
                  </tr>
                  <tr>
                    <td>State tax ({r.stateName})</td>
                    <td className="num">{money(r.soleState)}</td>
                    <td className="num">{money(r.scorpState)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>Estimated total tax</td>
                    <td className="num">{money(r.soleTotal)}</td>
                    <td className="num">{money(r.scorpTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Assumptions
        items={[
          'Uses 2026 federal brackets, standard deduction, the Social Security wage base, and combined employer + employee FICA / self-employment tax rates.',
          'The S-corp distribution equals net profit less the salary and the employer share of payroll tax; distributions are not subject to payroll tax.',
          'QBI is estimated as 20% of qualified income, limited to 20% of taxable income. W-2 wage and property limitations and the SSTB phase-out are not modeled here (see the QBI Deduction Optimizer).',
          'The additional 0.9% Medicare surtax, state-specific rules, and retirement-plan contributions are not modeled.',
          'A “reasonable” salary is a facts-and-circumstances determination; this tool does not opine on what salary is defensible.',
        ]}
      />
    </ToolShell>
  )
}
