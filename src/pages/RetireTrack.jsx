import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { DonutChart, BarCompare, TONE, PALETTE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'

const BLANK = {
  age: '',
  retireAge: '',
  savings: '',
  annualContribution: '',
  ssAnnual: '',
  pensionAnnual: '',
  annualExpenses: '',
}

const SAMPLE = {
  age: '55',
  retireAge: '65',
  savings: '850000',
  annualContribution: '40000',
  ssAnnual: '42000',
  pensionAnnual: '0',
  annualExpenses: '110000',
}

const GROWTH = 0.06
const WITHDRAWAL_RATE = 0.04

function compute(form) {
  const age = toNumber(form.age)
  const retireAge = toNumber(form.retireAge)
  const savings = toNumber(form.savings)
  const contribution = toNumber(form.annualContribution)
  const ss = toNumber(form.ssAnnual)
  const pension = toNumber(form.pensionAnnual)
  const expenses = toNumber(form.annualExpenses)

  const years = Math.max(0, retireAge - age)

  // Future value of current savings + contributions.
  const grownSavings = savings * Math.pow(1 + GROWTH, years)
  const grownContributions =
    GROWTH > 0 ? contribution * ((Math.pow(1 + GROWTH, years) - 1) / GROWTH) : contribution * years
  const projectedNestEgg = grownSavings + grownContributions

  const portfolioIncome = projectedNestEgg * WITHDRAWAL_RATE
  const totalIncome = portfolioIncome + ss + pension
  const gap = totalIncome - expenses
  const coverage = expenses > 0 ? (totalIncome / expenses) * 100 : 0
  const onTrack = gap >= 0

  return {
    years,
    projectedNestEgg,
    portfolioIncome,
    ss,
    pension,
    totalIncome,
    expenses,
    gap,
    coverage,
    onTrack,
  }
}

export default function RetireTrack() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  return (
    <ToolShell
      title="Am I on Track to Retire?"
      subtitle="A retirement readiness snapshot — projecting your savings to your target retirement age, estimating sustainable income from all sources, and comparing it against your expected needs."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Your Retirement Picture">
            <div className="field-row">
              <NumberField label="Current age" value={form.age} onChange={set('age')} suffix="yrs" />
              <NumberField label="Target retirement age" value={form.retireAge} onChange={set('retireAge')} suffix="yrs" />
            </div>
            <MoneyField
              label="Current retirement & investment savings"
              value={form.savings}
              onChange={set('savings')}
            />
            <MoneyField
              label="Annual savings / contributions"
              value={form.annualContribution}
              onChange={set('annualContribution')}
            />
            <div className="field-row">
              <MoneyField label="Social Security (annual)" value={form.ssAnnual} onChange={set('ssAnnual')} info="Expected annual Social Security benefit in retirement." />
              <MoneyField label="Pension (annual)" value={form.pensionAnnual} onChange={set('pensionAnnual')} />
            </div>
            <MoneyField
              label="Estimated annual spending in retirement"
              value={form.annualExpenses}
              onChange={set('annualExpenses')}
              info="Your expected annual expenses in retirement, in today's dollars."
            />
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Retirement Readiness Summary"
              meta={r.onTrack ? 'Projected income covers needs' : 'Projected income falls short'}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="Projected annual retirement income"
              value={money(r.totalIncome)}
              note={`Covers ${percent(r.coverage, 0)} of your ${money(r.expenses)} estimated need`}
            />
            <Narrative>
              Growing your savings for {r.years} years, we project a nest egg of
              about {money(r.projectedNestEgg)} at retirement. At a {percent(WITHDRAWAL_RATE * 100, 0)}{' '}
              withdrawal rate that provides roughly {money(r.portfolioIncome)} a
              year, plus {money(r.ss + r.pension)} from Social Security and
              pension — about {money(r.totalIncome)} of total annual income
              against an estimated {money(r.expenses)} of spending, a{' '}
              {r.gap >= 0 ? 'surplus' : 'shortfall'} of {money(Math.abs(r.gap))}.
            </Narrative>

            <div className="tool-grid" style={{ gap: 20, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Income sources</div>
                <DonutChart
                  size={150}
                  legend={false}
                  centerValue={money(r.totalIncome)}
                  centerLabel="Annual"
                  data={[
                    { label: 'Portfolio', value: r.portfolioIncome, color: PALETTE[0] },
                    { label: 'Social Security', value: r.ss, color: PALETTE[2] },
                    { label: 'Pension', value: r.pension, color: PALETTE[4] },
                  ]}
                />
              </div>
              <div>
                <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Income vs. needs</div>
                <BarCompare
                  height={150}
                  legend={false}
                  groups={[
                    { label: 'Income', bars: [{ label: 'Income', value: r.totalIncome, color: TONE.net }] },
                    { label: 'Expenses', bars: [{ label: 'Expenses', value: r.expenses, color: TONE.tax }] },
                  ]}
                />
              </div>
            </div>

            <div className="result-list" style={{ marginTop: 18 }}>
              <ResultRow label="Projected nest egg at retirement" value={r.projectedNestEgg} />
              <ResultRow label={`Sustainable portfolio income (${percent(WITHDRAWAL_RATE * 100, 0)})`} value={r.portfolioIncome} sub />
              <ResultRow label="Social Security + pension" value={r.ss + r.pension} sub />
              <ResultRow label="Total projected income" value={r.totalIncome} total />
              <ResultRow
                label={r.gap >= 0 ? 'Annual surplus' : 'Annual shortfall'}
                value={Math.abs(r.gap)}
                sub
                positive={r.gap >= 0}
                negative={r.gap < 0}
              />
            </div>
            <div className="report-footer">Prepared with Grott Luker &amp; Co. · Planning by BlueLine Advisors</div>
          </section>
        </div>
      </div>

      <Assumptions
        items={[
          'Savings grow at an assumed 6% annual return until your target retirement age; contributions are assumed level and invested each year.',
          'Sustainable income uses a 4% withdrawal rate on the projected nest egg — a common planning guideline, not a guarantee.',
          'Social Security and pension are entered as expected annual amounts and are not inflation-adjusted here.',
          'Expenses are treated in today’s dollars; taxes, healthcare shocks, and market sequence risk are not modeled.',
          'This is a high-level readiness snapshot to frame a planning conversation, not a comprehensive retirement plan.',
        ]}
      />
    </ToolShell>
  )
}
