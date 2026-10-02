import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SliderField,
  RefinePanel,
  StatTiles,
  ResultRow,
  Assumptions,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { DonutChart, BarCompare, LineChart, TONE, PALETTE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'

// Rates print exactly as entered — 4% → "4%", 3.5% → "3.5%", 6.25% → "6.25%" —
// so one input never shows up as three different numbers on the same page.
const rate = (v) => `${parseFloat(toNumber(v).toFixed(2))}%`
const yrs = (n, short = false) => `${n} ${short ? (n === 1 ? 'yr' : 'yrs') : n === 1 ? 'year' : 'years'}`

const BLANK = {
  age: '',
  retireAge: '',
  savings: '',
  annualContribution: '',
  ssAnnual: '',
  pensionAnnual: '',
  otherIncome: '0',
  annualExpenses: '',
  growthRate: '6',
  postRetirementReturn: '4.5',
  inflationRate: '2.5',
  withdrawalRate: '4',
}

const SAMPLE = {
  age: '55',
  retireAge: '65',
  savings: '850000',
  annualContribution: '40000',
  ssAnnual: '42000',
  pensionAnnual: '0',
  otherIncome: '0',
  annualExpenses: '110000',
  growthRate: '6',
  postRetirementReturn: '4.5',
  inflationRate: '2.5',
  withdrawalRate: '4',
}

function compute(form) {
  const age = toNumber(form.age)
  const retireAge = toNumber(form.retireAge)
  const savings = toNumber(form.savings)
  const contribution = toNumber(form.annualContribution)
  const ss = toNumber(form.ssAnnual)
  const pension = toNumber(form.pensionAnnual)
  const other = toNumber(form.otherIncome)
  const expenses = toNumber(form.annualExpenses)
  const growth = toNumber(form.growthRate) / 100
  const inflation = toNumber(form.inflationRate) / 100
  const withdrawalRate = toNumber(form.withdrawalRate) / 100

  const years = Math.max(0, retireAge - age)

  // Future value of current savings + contributions, at the accumulation return.
  const grownSavings = savings * Math.pow(1 + growth, years)
  const grownContributions =
    growth > 0 ? contribution * ((Math.pow(1 + growth, years) - 1) / growth) : contribution * years
  const projectedNestEgg = grownSavings + grownContributions

  // Year-by-year balance for the chart: the same accumulation formula evaluated at each
  // year from today to the target retirement age (its last point equals the nest egg).
  const chartYears = Math.min(years, 100)
  const balances = Array.from({ length: chartYears + 1 }, (_, t) => {
    const fvSavings = savings * Math.pow(1 + growth, t)
    const fvContrib = growth > 0 ? contribution * ((Math.pow(1 + growth, t) - 1) / growth) : contribution * t
    return fvSavings + fvContrib
  })

  // Income need is entered in today's dollars; inflate it to the retirement year.
  const futureExpenses = expenses * Math.pow(1 + inflation, years)

  const portfolioIncome = projectedNestEgg * withdrawalRate
  const totalIncome = portfolioIncome + ss + pension + other
  const gap = totalIncome - futureExpenses
  // Without a spending need there is nothing to cover: coverage and "on track" are not measurable.
  const hasNeed = futureExpenses > 0
  const coverage = hasNeed ? (totalIncome / futureExpenses) * 100 : 0
  const onTrack = hasNeed && gap >= 0

  return {
    years,
    projectedNestEgg,
    portfolioIncome,
    ss,
    pension,
    other,
    totalIncome,
    expenses: futureExpenses,
    gap,
    coverage,
    hasNeed,
    onTrack,
    withdrawalRate,
    balances,
  }
}

export default function RetireTrack() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => {
    const g = toNumber(form.growthRate) / 100
    const infl = toNumber(form.inflationRate) / 100
    const sav = toNumber(form.savings)
    const c = toNumber(form.annualContribution)
    const n = r.years
    const fvSav = sav * Math.pow(1 + g, n)
    return [
      { label: 'Years to retirement', formula: `${toNumber(form.retireAge)} − ${toNumber(form.age)}`, result: `${n}` },
      { label: 'Current savings grown', formula: `${money(sav, 2)} × (1 + ${percent(g * 100, 1)})^${n}`, result: money(fvSav, 2) },
      { label: 'Future contributions grown', formula: `${money(c, 2)} × [((1 + ${percent(g * 100, 1)})^${n} − 1) ÷ ${percent(g * 100, 1)}]`, result: money(r.projectedNestEgg - fvSav, 2) },
      { label: 'Projected nest egg', formula: 'sum of the two', result: money(r.projectedNestEgg, 2) },
      { label: 'Portfolio income', formula: `${money(r.projectedNestEgg, 2)} × ${percent(r.withdrawalRate * 100, 1)} withdrawal rate`, result: money(r.portfolioIncome, 2) },
      { label: 'Total retirement income', formula: `portfolio + Social Security ${money(r.ss, 2)} + pension ${money(r.pension, 2)} + other ${money(r.other, 2)}`, result: money(r.totalIncome, 2) },
      { label: 'Expenses at retirement', formula: `${money(toNumber(form.annualExpenses), 2)} × (1 + ${percent(infl * 100, 1)})^${n}`, result: money(r.expenses, 2) },
      { label: 'Surplus / (gap)', formula: `${money(r.totalIncome, 2)} − ${money(r.expenses, 2)}`, result: money(r.gap, 2) },
      { label: 'Coverage ratio', formula: 'income ÷ expenses', result: percent(r.coverage, 0) },
    ]
  }, [r, form])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const ageN = toNumber(form.age)
  const retireAgeN = toNumber(form.retireAge)
  const otherSources = r.ss + r.pension + r.other
  const wrPct = rate(r.withdrawalRate * 100)
  const growPct = rate(form.growthRate)
  const inflPct = rate(form.inflationRate)
  const todaySavings = toNumber(form.savings)
  const noHorizon = r.years === 0
  const blankAges = ageN === 0 && retireAgeN === 0
  // Status, coverage note and the surplus/shortfall tile are shared by the screen and the print
  // so the two never disagree — including when no spending need has been entered.
  const statusLabel = r.hasNeed
    ? r.onTrack ? 'Projected income covers needs' : 'Projected income falls short'
    : 'Spending need not entered'
  const coverageNote = r.hasNeed
    ? `Covers ${percent(r.coverage, 0)} of your ${money(r.expenses)} estimated need in the first year of retirement`
    : 'Enter an estimated annual spending need to measure coverage'
  const gapLabel = r.gap >= 0 ? 'Annual surplus' : 'Annual shortfall'
  const gapTile = r.hasNeed
    ? { label: gapLabel, value: money(Math.abs(r.gap)), note: `${percent(r.coverage, 0)} of need covered`, best: r.gap >= 0, tone: r.gap >= 0 ? 'good' : 'bad' }
    : { label: 'Surplus / shortfall', value: '—', note: 'no spending need entered' }
  const narrative = (
    <>
      {noHorizon
        ? <>With retirement at your current age there is no accumulation period, so the nest egg is today's savings of {money(r.projectedNestEgg)}.</>
        : <>Growing your savings for {yrs(r.years)}, we project a nest egg of about {money(r.projectedNestEgg)} at retirement.</>}{' '}At a {wrPct} withdrawal rate that provides roughly {money(r.portfolioIncome)} a year, plus {money(otherSources)} from Social Security, pension, and other income — about {money(r.totalIncome)} of total annual income
      {r.hasNeed
        ? <> against an estimated {money(r.expenses)} of spending (inflated to your retirement year), a {r.gap >= 0 ? 'surplus' : 'shortfall'} of {money(Math.abs(r.gap))}.</>
        : <>. No spending need has been entered, so whether that income is enough cannot be measured yet.</>}
    </>
  )
  // Income sources for the print donut and its list; zero sources drop out, matching the chart.
  const incomeSources = [
    { label: 'Portfolio', value: r.portfolioIncome, color: PALETTE[0] },
    { label: 'Social Security', value: r.ss, color: PALETTE[2] },
    { label: 'Pension', value: r.pension, color: PALETTE[4] },
    { label: 'Other', value: r.other, color: PALETTE[3] },
  ].filter((s) => s.value > 0)
  const dot = (color) => <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 7, verticalAlign: 'middle', position: 'relative', top: -1, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
  // Milestone rows for the savings-path table: at most 6 points from today to retirement.
  const milestoneIdx = (() => {
    const n = r.balances.length - 1
    if (n <= 0) return [0]
    const step = Math.max(1, Math.ceil(n / 5))
    const idx = []
    for (let t = 0; t < n; t += step) idx.push(t)
    idx.push(n)
    return idx
  })()
  // When there is no accumulation period (current age at or past the target), the line chart
  // would be a single point; show instead what each extra year of saving would do, using the
  // same compute() with only the retirement age changed.
  const laterRows = noHorizon && !blankAges
    ? [1, 2, 3, 5].map((k) => {
        const alt = compute({ ...form, retireAge: String(ageN + k) })
        return {
          label: `Retire at ${ageN + k} instead · ${yrs(k)} more of saving`,
          value: r.hasNeed ? `${money(alt.totalIncome)} · ${percent(alt.coverage, 0)} covered` : money(alt.totalIncome),
        }
      })
    : []
  const assumptions = [
    'Savings grow at the assumed accumulation return until your target retirement age; contributions are assumed level and invested each year.',
    'Your stated spending need (in today\'s dollars) is inflated to your retirement year at the assumed inflation rate before comparing it to projected income.',
    'Sustainable income applies the assumed withdrawal rate to the projected nest egg — a planning guideline, not a guarantee. The post-retirement return assumption is not yet reflected in this withdrawal math; it is shown to frame a conversation about sequence-of-returns risk.',
    'Social Security, pension, and other income are entered as expected annual amounts and are not separately inflation-adjusted.',
    'Taxes, healthcare shocks, and market sequence risk are not modeled.',
    'This is a high-level readiness snapshot to frame a planning conversation, not a comprehensive retirement plan.',
  ]
  const inputs = [
    ['Current age', `${ageN} yrs`],
    ['Target retirement age', `${retireAgeN} yrs`],
    ['Current savings', money(todaySavings)],
    ['Annual contributions', money(toNumber(form.annualContribution))],
    ['Spending need (today\'s $)', money(toNumber(form.annualExpenses))],
    ['Social Security (annual)', money(r.ss)],
    ['Pension (annual)', money(r.pension)],
    ['Other income (annual)', money(r.other)],
    ['Return (accumulation)', growPct],
    ['Post-retirement return', rate(form.postRetirementReturn)],
    ['Inflation rate', inflPct],
    ['Withdrawal rate', rate(form.withdrawalRate)],
  ]
  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="Retirement Readiness Summary"
          subtitle="Today's savings projected to your target retirement age, and the income they can sustain measured against what you expect to spend."
          meta={`Age ${ageN} → retire at ${retireAgeN} · ${noHorizon ? 'retiring now' : `${yrs(r.years)} to go`} · ${statusLabel}`}
          metaRight={today}
        />
        <PrintFeature
          label="Projected annual retirement income"
          value={money(r.totalIncome)}
          note={coverageNote}
        />
        <PrintTiles
          items={[
            { label: 'Projected nest egg', value: money(r.projectedNestEgg), note: noHorizon ? 'today' : `in ${yrs(r.years)}` },
            { label: 'Portfolio income', value: money(r.portfolioIncome), note: `${wrPct} withdrawal rate` },
            { label: 'Retirement spending', value: r.hasNeed ? money(r.expenses) : '—', note: r.hasNeed ? `inflated at ${inflPct} a year` : 'not entered' },
            gapTile,
          ]}
        />
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        {noHorizon ? (
          <PrintSection title="Projected savings balance">
            <PrintProse>
              {blankAges
                ? 'Enter your current age and target retirement age to project the savings path from today to retirement.'
                : `Your current age (${ageN}) is at or past the target retirement age (${retireAgeN}), so there is no accumulation period to project: the nest egg is today's savings of ${money(r.projectedNestEgg)} and the spending need is measured in today's dollars. The rows below show what each additional year of saving before retirement would do to first-year income.`}
            </PrintProse>
            {laterRows.length ? <PrintRows rows={laterRows} /> : null}
          </PrintSection>
        ) : (
          <PrintSection title="Projected savings balance" className="pr-chart">
            <LineChart
              xStart={form.age ? `Age ${ageN}` : 'Today'}
              xEnd={form.retireAge ? `Age ${retireAgeN}` : 'Retirement'}
              legend={false}
              series={[{ label: 'Retirement & investment savings', color: TONE.net, points: r.balances }]}
            />
          </PrintSection>
        )}
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact={incomeSources.length > 2}>
        <PrintPageHead title="Retirement Readiness Summary" right={today} />
        <PrintCols>
          <PrintSection title="Income sources at retirement" note="first year, annual" className="pr-chart">
            {incomeSources.length ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
                  <DonutChart
                    size={140}
                    thickness={24}
                    legend={false}
                    centerValue={money(r.totalIncome)}
                    centerLabel="Annual"
                    data={incomeSources}
                  />
                </div>
                <PrintRows
                  rows={incomeSources.map((s) => ({
                    label: <>{dot(s.color)}{s.label} · {percent(r.totalIncome > 0 ? (s.value / r.totalIncome) * 100 : 0, 0)}</>,
                    value: money(s.value),
                  }))}
                />
              </>
            ) : (
              <PrintProse>No retirement income has been projected yet. Enter current savings or contributions (for portfolio income), and any Social Security, pension, or other income you expect, to see how the first year of retirement would be funded.</PrintProse>
            )}
          </PrintSection>
          <PrintSection title="Income vs. spending" note="at retirement">
            <PrintRows
              rows={[
                { label: 'Projected nest egg at retirement', value: money(r.projectedNestEgg) },
                { label: `Sustainable portfolio income (${wrPct})`, value: money(r.portfolioIncome), sub: true },
                { label: 'Social Security + pension + other', value: money(otherSources), sub: true },
                { label: 'Total projected income', value: money(r.totalIncome), total: true },
                { label: 'Estimated spending (inflated)', value: r.hasNeed ? money(r.expenses) : 'not entered' },
                r.hasNeed
                  ? { label: gapLabel, value: money(Math.abs(r.gap)), sub: true }
                  : { label: 'Surplus / shortfall', value: 'not measured', sub: true },
              ]}
            />
          </PrintSection>
        </PrintCols>
        <PrintSection title="Savings path to retirement" note={`${growPct} assumed return · ${money(toNumber(form.annualContribution))} added each year`}>
          <PrintTable
            head={['Age', 'Years from today', 'Projected balance', 'Increase since today']}
            widths={['20%', '26%', '27%', '27%']}
            align={['left', 'left', 'right', 'right']}
            rows={milestoneIdx.map((t) => [
              `Age ${ageN + t}`,
              t === 0 ? 'Today' : t === r.years ? `${yrs(t, true)} · retirement` : yrs(t, true),
              money(r.balances[t]),
              t === 0 ? '—' : `+${money(r.balances[t] - todaySavings)}`,
            ])}
          />
        </PrintSection>
        <PrintNote title="Reading the result">
          The coverage ratio compares projected first-year retirement income with your spending need inflated to the retirement year. The withdrawal rate is a planning guideline, not a promise: it tells you how much the nest egg could reasonably supply in year one, before taxes, healthcare surprises, and the order of market returns have their say. The post-retirement return you entered is not yet in this math; it frames the conversation about how the balance behaves once withdrawals begin.{' '}
          {!r.hasNeed
            ? 'No spending need was entered, so the coverage ratio and any surplus or shortfall are not measured; enter your expected annual spending in today\'s dollars to complete the picture.'
            : r.gap >= 0
              ? `A surplus of ${money(r.gap)} is a cushion, not slack — it is the first thing a weak early market or a higher inflation rate would consume.`
              : `A shortfall of ${money(Math.abs(r.gap))} is usually closed by some mix of saving more, retiring later, or spending less; each lever can be tested by changing one input.`}
        </PrintNote>
        <PrintSection title="Inputs used in this estimate">
          <PrintInputs items={inputs} />
        </PrintSection>
        <PrintSection title="Assumptions">
          <PrintAssumptions items={assumptions} />
        </PrintSection>
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="Am I on Track to Retire?"
      subtitle="A retirement readiness snapshot — projecting your savings to your target retirement age, estimating sustainable income from all sources, and comparing it against your expected needs."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
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
            <MoneyField
              label="Estimated annual spending in retirement"
              value={form.annualExpenses}
              onChange={set('annualExpenses')}
              info="Your expected annual expenses in retirement, in today's dollars."
            />
            <div className="field-row">
              <MoneyField label="Social Security (annual)" value={form.ssAnnual} onChange={set('ssAnnual')} info="Expected annual Social Security benefit in retirement." />
              <MoneyField label="Pension (annual)" value={form.pensionAnnual} onChange={set('pensionAnnual')} />
            </div>
          </Panel>

          <RefinePanel summary="return, inflation, withdrawal rate, other income">
            <MoneyField label="Other retirement income (annual)" value={form.otherIncome} onChange={set('otherIncome')} info="Rental income, part-time work, annuities, or any other expected income source." />
            <div className="field-row">
              <SliderField
                label="Assumed annual return (accumulation)"
                value={form.growthRate}
                onChange={set('growthRate')}
                min={0}
                max={12}
                step={0.25}
                readout={`${form.growthRate}%`}
              />
              <SliderField
                label="Post-retirement return"
                value={form.postRetirementReturn}
                onChange={set('postRetirementReturn')}
                min={0}
                max={10}
                step={0.25}
                readout={`${form.postRetirementReturn}%`}
                info="Not yet reflected in the withdrawal math below — informs the conversation about sequence-of-returns risk after retirement."
              />
            </div>
            <div className="field-row">
              <SliderField
                label="Assumed inflation rate"
                value={form.inflationRate}
                onChange={set('inflationRate')}
                min={0}
                max={6}
                step={0.25}
                readout={`${form.inflationRate}%`}
                info="Applied to your stated spending need between now and your target retirement age."
              />
              <SliderField
                label="Assumed withdrawal rate"
                value={form.withdrawalRate}
                onChange={set('withdrawalRate')}
                min={2}
                max={7}
                step={0.25}
                readout={`${form.withdrawalRate}%`}
                info="The share of the projected nest egg drawn as income in the first year of retirement."
              />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Retirement Readiness Summary"
              meta={statusLabel}
              metaRight={today}
            />
            <FeatureBlock
              label="Projected annual retirement income"
              value={money(r.totalIncome)}
              note={coverageNote}
            />
            <StatTiles
              items={[
                { label: 'Projected nest egg', value: money(r.projectedNestEgg), note: noHorizon ? 'today' : `in ${yrs(r.years)}` },
                { label: 'Portfolio income', value: money(r.portfolioIncome), note: `${wrPct} withdrawal rate` },
                gapTile,
              ]}
            />
            <div className="result-list">
              <ResultRow label="Projected nest egg at retirement" value={r.projectedNestEgg} />
              <ResultRow label={`Sustainable portfolio income (${wrPct})`} value={r.portfolioIncome} sub />
              <ResultRow label="Social Security + pension + other" value={otherSources} sub />
              <ResultRow label="Total projected income" value={r.totalIncome} total />
              <ResultRow
                label={gapLabel}
                value={Math.abs(r.gap)}
                sub
                positive={r.gap >= 0}
                negative={r.gap < 0}
              />
            </div>

            <Narrative>{narrative}</Narrative>

            <div className="chart-block">
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Projected savings balance</div>
              <LineChart
                xStart={form.age ? `Age ${ageN}` : 'Today'}
                xEnd={form.retireAge ? `Age ${retireAgeN}` : 'Retirement'}
                series={[{ label: 'Retirement & investment savings', color: TONE.net, points: r.balances }]}
              />
            </div>

            <div className="tool-grid" style={{ gap: 20, gridTemplateColumns: '1fr 1fr', marginTop: 18 }}>
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
                    { label: 'Other', value: r.other, color: PALETTE[3] },
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
            <div className="report-footer">Prepared with Grott Luker &amp; Co. · Planning by BlueLine Advisors</div>
          </section>
        </div>
      </div>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
