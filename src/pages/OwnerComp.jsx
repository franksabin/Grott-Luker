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
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
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

// The largest salary the profit can fund once the employer share of payroll tax is paid on it
// (salary + employer FICA = net profit). Fixed-point iteration; converges in a handful of steps.
function fundableSalary(netProfit) {
  let s = netProfit
  for (let i = 0; i < 40; i++) s = netProfit - ficaOnSalary(s) / 2
  s = Math.max(0, Math.floor(s))
  // Whole-dollar touch-up so the capped salary leaves a $0 distribution, not $1 or $2.
  const fits = (x) => x + Math.round(ficaOnSalary(x) / 2) <= netProfit
  while (fits(s + 1)) s += 1
  while (s > 0 && !fits(s)) s -= 1
  return s
}

// Every figure is carried in whole dollars (as on a return) so that each total is exactly the sum
// of the rows shown, and the screen, the print report and the bridge rows all foot to the dollar.
function compute(form) {
  const R = Math.round
  const netProfit = R(toNumber(form.netProfit))
  const maxSalary = fundableSalary(netProfit)
  const salary = Math.min(R(toNumber(form.salary)), maxSalary)
  const otherIncome = R(toNumber(form.otherIncome))
  const st = getState(form.state)
  const filing = form.filing
  const stdDed = STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married']
  const stateRate = st.wage / 100

  // --- Strategy 1: Sole proprietor / disregarded LLC (all profit is SE income) ---
  const se = R(selfEmploymentTax(netProfit))
  const seHalf = R(se / 2) // deductible half of SE tax
  const soleQbiIncome = netProfit - seHalf
  const soleOrdinaryBeforeQbi = soleQbiIncome + otherIncome - stdDed
  const soleQbi = R(qbiDeduction(soleQbiIncome, soleOrdinaryBeforeQbi))
  const soleTaxable = Math.max(0, soleOrdinaryBeforeQbi - soleQbi)
  const soleIncomeTax = R(ordinaryTax(soleTaxable, filing))
  const soleState = R(Math.max(0, soleQbiIncome + otherIncome) * stateRate)
  const soleTotal = se + soleIncomeTax + soleState

  // --- Strategy 2: S-corporation (reasonable salary + distribution) ---
  const fica = R(ficaOnSalary(salary)) // total FICA burden on the salary
  const employerFica = R(ficaOnSalary(salary) / 2) // employer half is a business expense
  const distribution = Math.max(0, netProfit - salary - employerFica)
  const scorpQbiIncome = distribution // K-1 pass-through, net of wages
  const scorpOrdinaryBeforeQbi = salary + distribution + otherIncome - stdDed
  const scorpQbi = R(qbiDeduction(scorpQbiIncome, scorpOrdinaryBeforeQbi))
  const scorpTaxable = Math.max(0, scorpOrdinaryBeforeQbi - scorpQbi)
  const scorpIncomeTax = R(ordinaryTax(scorpTaxable, filing))
  const scorpState = R(Math.max(0, salary + distribution + otherIncome) * stateRate)
  const scorpTotal = fica + scorpIncomeTax + scorpState

  const savings = soleTotal - scorpTotal

  return {
    netProfit,
    salary,
    distribution,
    se,
    seHalf,
    fica,
    employerFica,
    soleQbi,
    scorpQbi,
    soleTaxable,
    scorpTaxable,
    soleIncomeTax,
    scorpIncomeTax,
    soleState,
    scorpState,
    soleTotal,
    scorpTotal,
    savings,
    stateRate,
    stateName: st.name,
  }
}

export default function OwnerComp() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Sole prop · self-employment tax', formula: `${money(r.netProfit)} × 92.35% × 15.3% (12.4% capped at the ${money(SS_WAGE_BASE)} wage base)`, result: money(r.se) },
    { label: 'Sole prop · QBI deduction', formula: 'lesser of 20% × (profit − ½ SE tax) and 20% × taxable income', result: money(r.soleQbi) },
    { label: 'Sole prop · federal income tax', formula: `${TAX_YEAR} brackets on profit − ½ SE tax + other income − standard deduction − QBI`, result: money(r.soleIncomeTax) },
    { label: 'Sole prop · state tax', formula: `income × ${r.stateName} rate`, result: money(r.soleState) },
    { label: 'Sole prop · total tax', formula: 'SE + federal + state', result: money(r.soleTotal) },
    { label: 'S-corp · payroll tax on salary', formula: `${money(r.salary)} × 15.3% (employer + employee)`, result: money(r.fica) },
    { label: 'S-corp · distribution', formula: `${money(r.netProfit)} − salary − employer half of payroll tax`, result: money(r.distribution) },
    { label: 'S-corp · QBI deduction', formula: 'lesser of 20% × distribution and 20% × taxable income', result: money(r.scorpQbi) },
    { label: 'S-corp · federal income tax', formula: `${TAX_YEAR} brackets on salary + distribution + other income − standard deduction − QBI`, result: money(r.scorpIncomeTax) },
    { label: 'S-corp · state tax', formula: `income × ${r.stateName} rate`, result: money(r.scorpState) },
    { label: 'S-corp · total tax', formula: 'payroll + federal + state', result: money(r.scorpTotal) },
    { label: 'Savings from S-corp election', formula: `${money(r.soleTotal)} − ${money(r.scorpTotal)}`, result: money(r.savings), note: 'Before payroll-service and tax-return costs of running an S-corp.' },
  ], [r])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const filingLabel = form.filing === 'single' ? 'Single' : 'Married filing jointly'
  const enteredSalary = Math.round(toNumber(form.salary))
  const salaryCapped = enteredSalary > r.salary
  // Bridge figures. compute() works in whole dollars, so every one of these foots exactly to the
  // headline and to the side-by-side table — no plugs.
  const payrollSaved = r.se - r.fica // payroll / SE tax avoided; negative = S-corp pays more
  const deductionChange = r.employerFica - r.seHalf // business-side deduction: employer FICA (S-corp) vs ½ SE tax (sole prop); negative = S-corp deducts less
  const qbiChange = r.scorpQbi - r.soleQbi // negative = S-corp gets less QBI
  const taxableChange = r.scorpTaxable - r.soleTaxable // positive = more federal taxable income under the S-corp
  const fedChange = r.scorpIncomeTax - r.soleIncomeTax
  const stateChange = r.scorpState - r.soleState
  const incomeTaxChange = fedChange + stateChange // = payrollSaved - r.savings
  const hasState = r.stateRate > 0
  const incomeTaxLabel = incomeTaxChange >= 0
    ? `Additional ${hasState ? 'federal + state' : 'federal'} income tax under the S-corp`
    : `${hasState ? 'Federal + state' : 'Federal'} income tax saved under the S-corp`
  const signed = (v) => (v < 0 ? `−${money(-v)}` : money(v))
  // Salary sensitivity for the print report: the same compute() the screen uses, at a few nearby salaries.
  const sensitivityBase = r.salary > 0 ? r.salary : r.netProfit * 0.4
  const sensitivity = [0.6, 0.8, 1, 1.2, 1.4]
    .map((f) => {
      const s = f === 1 ? r.salary : Math.round((sensitivityBase * f) / 1000) * 1000 // compute() caps it at the fundable salary
      return { salary: s, current: f === 1, ...compute({ ...form, salary: String(s) }) }
    })
    .filter((row, i, all) => all.findIndex((x) => x.salary === row.salary) === i)
    .sort((a, b) => a.salary - b.salary)
  const inputs = [
    ['Business net profit', money(r.netProfit)],
    ['Reasonable salary (S-corp)', salaryCapped ? `${money(enteredSalary)} (capped at ${money(r.salary)})` : money(enteredSalary)],
    ['Filing status', filingLabel],
    ['Other household taxable income', money(toNumber(form.otherIncome))],
    ['State', r.stateName],
  ]
  const assumptions = [
    'Uses 2026 federal brackets, standard deduction, the Social Security wage base, and combined employer + employee FICA / self-employment tax rates. All figures are carried in whole dollars, as on a return.',
    'The S-corp distribution equals net profit less the salary and the employer share of payroll tax; distributions are not subject to payroll tax. A salary the profit cannot fund (salary plus employer payroll tax above net profit) is capped at the fundable amount. The sole proprietor deducts one-half of self-employment tax; the S-corp deducts the employer share of payroll tax.',
    'QBI is estimated as 20% of qualified income, limited to 20% of taxable income. W-2 wage and property limitations and the SSTB phase-out are not modeled here (see the QBI Deduction Optimizer).',
    `State tax is ${r.stateName}'s representative rate applied to business income plus other household income, before the QBI deduction (QBI is a federal-only deduction).`,
    'The additional 0.9% Medicare surtax, state-specific rules, and retirement-plan contributions are not modeled.',
    'A “reasonable” salary is a facts-and-circumstances determination; this tool does not opine on what salary is defensible.',
  ]
  const noteText = (
    <>
      An S-corporation can save payroll tax because only the salary is subject to FICA — the distribution is not. But too low a salary invites IRS scrutiny and shrinks retirement-plan contribution room, and once taxable income is above the QBI threshold the deduction is limited by W-2 wages paid, so a very low salary can also cost QBI (that limitation is not modeled here). This report shows the headline tax trade-off; the right salary is a judgment call, and the savings shown are before the payroll-service and separate tax-return costs of running an S-corp.
    </>
  )
  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="Owner Compensation Comparison"
          subtitle="Self-employment income versus an S-corp salary plus distributions — same business, different tax bill."
          meta={`${money(r.netProfit)} net profit · ${money(r.salary)} S-corp salary · ${filingLabel} · ${r.stateName}`}
          metaRight={today}
        />
        <PrintFeature
          label={r.savings >= 0 ? 'Estimated tax savings with S-corp strategy' : 'S-corp strategy costs more by'}
          value={money(Math.abs(r.savings))}
          note={`On ${money(r.netProfit)} of net profit · ${money(r.salary)} salary · before the added cost of running an S-corp`}
        />
        <PrintTiles
          items={[
            { label: 'Sole prop / LLC total tax', value: money(r.soleTotal), best: r.savings < 0 },
            { label: 'S-corporation total tax', value: money(r.scorpTotal), best: r.savings >= 0 },
            { label: 'S-corp distribution · no payroll tax', value: money(r.distribution) },
          ]}
        />
        <PrintSection title="Where the difference comes from" note="estimated, this tax year">
          <PrintRows
            rows={[
              { label: 'Self-employment tax as a sole proprietor', value: money(r.se) },
              { label: `Payroll tax on a ${money(r.salary)} S-corp salary (employer + employee)`, value: money(r.fica) },
              { label: payrollSaved >= 0 ? 'Payroll tax avoided on the distribution' : 'Additional payroll tax under the S-corp', value: money(Math.abs(payrollSaved)) },
              { label: incomeTaxLabel, value: money(Math.abs(incomeTaxChange)) },
              { label: r.savings >= 0 ? 'Net savings from the S-corp election' : 'Net cost of the S-corp election', value: money(Math.abs(r.savings)), total: true },
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>
            On {money(r.netProfit)} of net profit, taking it all as self-employment income results in an estimated {money(r.soleTotal)} of total tax. Paying a {money(r.salary)} salary through an S-corporation and taking {money(r.distribution)} as a distribution results in an estimated {money(r.scorpTotal)} —{' '}
            {r.savings >= 0
              ? `a savings of about ${money(r.savings)}, driven largely by payroll tax avoided on the distribution.`
              : `about ${money(Math.abs(r.savings))} more, once QBI and other effects are considered.`}
          </PrintProse>
        </PrintSection>
        <PrintSection title="Total tax by strategy" className="pr-chart" note="estimated, this tax year">
          <BarCompare
            height={230}
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
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact={hasState}>
        <PrintPageHead title="Owner Compensation Comparison" right={today} />
        <PrintSection title="Side-by-side detail" note="estimated total tax under each strategy">
          <PrintTable
            head={['', 'Sole prop / LLC', 'S-corporation']}
            widths={['46%', '27%', '27%']}
            align={['left', 'right', 'right']}
            rowClass={(row) => (row[0] === 'Estimated total tax' ? 'is-strong' : '')}
            rows={[
              ['Owner W-2 salary', '—', money(r.salary)],
              ['Profit taxed as SE income / taken as distribution', money(r.netProfit), money(r.distribution)],
              ['Payroll / self-employment tax', money(r.se), money(r.fica)],
              ['Deductible share (½ SE tax / employer half of payroll tax)', money(r.seHalf), money(r.employerFica)],
              ['QBI deduction', money(r.soleQbi), money(r.scorpQbi)],
              ['Federal taxable income', money(r.soleTaxable), money(r.scorpTaxable)],
              ['Federal income tax', money(r.soleIncomeTax), money(r.scorpIncomeTax)],
              [`State tax (${r.stateName})`, money(r.soleState), money(r.scorpState)],
              ['Estimated total tax', money(r.soleTotal), money(r.scorpTotal)],
            ]}
          />
        </PrintSection>
        <PrintCols>
          <PrintSection title="How the S-corp profit is split">
            <PrintRows
              rows={[
                { label: 'Business net profit', value: money(r.netProfit) },
                { label: 'Less: reasonable W-2 salary', value: money(r.salary) },
                { label: 'Less: employer half of payroll tax', value: money(r.employerFica), sub: true },
                { label: 'Distribution to the owner', value: money(r.distribution), total: true },
              ]}
            />
          </PrintSection>
          <PrintSection title="Why income tax moves" note="deductions differ, not just payroll tax">
            <PrintRows
              rows={[
                { label: deductionChange <= 0 ? 'Smaller deductible share of payroll / SE tax' : 'Larger deductible share of payroll / SE tax', value: money(Math.abs(deductionChange)) },
                { label: qbiChange <= 0 ? 'QBI deduction given up (salary is not QBI)' : 'Additional QBI deduction with the S-corp', value: money(Math.abs(qbiChange)) },
                { label: taxableChange >= 0 ? 'More federal taxable income under the S-corp' : 'Less federal taxable income under the S-corp', value: money(Math.abs(taxableChange)), sub: true },
                { label: hasState ? (fedChange >= 0 ? 'Additional federal income tax' : 'Federal income tax saved') : incomeTaxLabel, value: money(Math.abs(fedChange)), total: !hasState },
                ...(hasState
                  ? [
                      { label: stateChange >= 0 ? `Additional state tax (${r.stateName})` : `State tax saved (${r.stateName})`, value: money(Math.abs(stateChange)) },
                      { label: incomeTaxLabel, value: money(Math.abs(incomeTaxChange)), total: true },
                    ]
                  : []),
              ]}
            />
          </PrintSection>
        </PrintCols>
        <PrintSection title="What a different salary would do" note="same profit and household; only the S-corp salary changes">
          <PrintTable
            head={['S-corp salary', 'Payroll tax', 'QBI deduction', 'Federal income tax', 'S-corp total tax', 'Savings vs. sole prop']}
            widths={['19%', '12%', '14%', '19%', '16%', '20%']}
            align={['left', 'right', 'right', 'right', 'right', 'right']}
            rowClass={(row, i) => (sensitivity[i].current ? 'is-tint' : '')}
            rows={sensitivity.map((s) => [
              s.current ? `${money(s.salary)} (${salaryCapped ? 'capped' : 'entered'})` : money(s.salary),
              money(s.fica),
              money(s.scorpQbi),
              money(s.scorpIncomeTax),
              money(s.scorpTotal),
              signed(s.savings),
            ])}
          />
        </PrintSection>
        <PrintNote title="Reading the result">{noteText}</PrintNote>
        <PrintCols>
          <PrintSection title="Inputs used in this estimate">
            <PrintInputs items={inputs} />
          </PrintSection>
          <PrintSection title="Assumptions">
            <PrintAssumptions items={assumptions} />
          </PrintSection>
        </PrintCols>
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="Owner Compensation Optimizer"
      subtitle="Compare paying yourself as a sole proprietor / LLC versus taking a reasonable salary plus distributions through an S-corporation — including payroll and self-employment tax, the QBI deduction, and total tax by strategy."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
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
          <Note title="What drives the difference">{noteText}</Note>
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

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
