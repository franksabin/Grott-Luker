import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  PillField,
  RefinePanel,
  StatTiles,
  ScenarioCards,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, LineChart, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'

const FIXED_PERIODS = [
  { value: '3', label: '3-year ARM (3/1)' },
  { value: '5', label: '5-year ARM (5/1)' },
  { value: '7', label: '7-year ARM (7/1)' },
  { value: '10', label: '10-year ARM (10/1)' },
]
const TERMS = [
  { value: '30', label: '30 years' },
  { value: '15', label: '15 years' },
]

const BLANK = {
  loan: '',
  term: '30',
  fixedRate: '',
  armRate: '',
  armPeriod: '7',
  resetRate: '7.5',
  periodicCap: '2',
  lifetimeCap: '5',
  horizon: '',
}

const SAMPLE = {
  loan: '650000',
  term: '30',
  fixedRate: '6.75',
  armRate: '6.0',
  armPeriod: '7',
  resetRate: '7.5',
  periodicCap: '2',
  lifetimeCap: '5',
  horizon: '10',
}

// Level monthly payment for a balance at an annual rate over n months.
function pmt(balance, annualRate, months) {
  if (months <= 0) return 0
  const r = annualRate / 12
  if (r === 0) return balance / months
  return (balance * r) / (1 - Math.pow(1 + r, -months))
}

// Walk a loan year by year. `rateForYear(y)` returns the annual rate in year y (1-based).
// Payment is re-amortized over the remaining term whenever the rate changes.
function amortize(loan, termYears, horizonYears, rateForYear) {
  let bal = loan
  let paid = 0
  let interest = 0
  let lastRate = null
  let payment = 0
  let maxPayment = 0
  const rows = []
  const totalMonths = termYears * 12
  for (let y = 1; y <= Math.min(horizonYears, termYears); y++) {
    const rate = rateForYear(y)
    if (rate !== lastRate) {
      payment = pmt(bal, rate, totalMonths - (y - 1) * 12)
      lastRate = rate
    }
    maxPayment = Math.max(maxPayment, payment)
    let yInterest = 0
    for (let m = 0; m < 12; m++) {
      const i = bal * (rate / 12)
      const p = Math.min(bal, payment - i)
      yInterest += i
      bal = Math.max(0, bal - p)
    }
    paid += payment * 12
    interest += yInterest
    rows.push({ year: y, rate, payment, interest: yInterest, balance: bal })
  }
  return { paid, interest, balance: bal, rows, maxPayment, firstPayment: rows[0]?.payment || 0 }
}

function armRatePath(form) {
  const start = toNumber(form.armRate) / 100
  const reset = toNumber(form.resetRate) / 100
  const fixedYears = Math.round(toNumber(form.armPeriod)) || 7
  const cap = toNumber(form.periodicCap) / 100
  const life = toNumber(form.lifetimeCap) / 100
  const ceiling = start + life
  return (y) => {
    if (y <= fixedYears) return start
    // Move toward the assumed reset rate, no more than the periodic cap per year, never above the lifetime cap.
    const steps = y - fixedYears
    const target = Math.min(reset, ceiling)
    if (target >= start) return Math.min(target, start + cap * steps)
    return Math.max(target, start - cap * steps)
  }
}

function compute(form) {
  const loan = toNumber(form.loan)
  const term = Math.round(toNumber(form.term)) || 30
  const horizon = Math.max(1, Math.min(term, Math.round(toNumber(form.horizon)) || term))
  const fixedRate = toNumber(form.fixedRate) / 100
  const fixedYears = Math.round(toNumber(form.armPeriod)) || 7

  const fixed = amortize(loan, term, horizon, () => fixedRate)
  const arm = amortize(loan, term, horizon, armRatePath(form))

  // Total cost over the horizon = payments made + balance still owed at the end.
  const fixedCost = fixed.paid + fixed.balance
  const armCost = arm.paid + arm.balance
  const armSaves = fixedCost - armCost

  // Savings banked during the ARM's fixed period alone.
  const teaserYears = Math.min(fixedYears, horizon)
  const teaserSavings = (fixed.firstPayment - arm.firstPayment) * 12 * teaserYears

  // Break-even reset rate: the post-reset rate at which the ARM's horizon cost equals the fixed loan's.
  let breakEven = null
  if (loan > 0 && horizon > fixedYears) {
    let lo = 0
    let hi = 0.25
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      const test = amortize(loan, term, horizon, armRatePath({ ...form, resetRate: String(mid * 100), lifetimeCap: '99' }))
      const cost = test.paid + test.balance
      if (cost < fixedCost) lo = mid
      else hi = mid
    }
    breakEven = (lo + hi) / 2
  }
  const armCeiling = (toNumber(form.armRate) + toNumber(form.lifetimeCap)) / 100
  // The search ignores the lifetime cap, so the solved rate can sit above the ceiling the
  // ARM can actually reach — in that case the ARM wins at every rate the caps allow.
  const breakEvenAboveCap = breakEven !== null && breakEven > armCeiling + 1e-9
  // The search stops at 25%; a result pinned there means "at least 25%", not a precise figure.
  const breakEvenSaturated = breakEven !== null && breakEven > 0.25 - 1e-6
  const breakEvenLabel = breakEven === null ? '—' : breakEvenSaturated ? 'over 25%' : percent(breakEven * 100, 2)

  // ARM advantage / (cost) if the client exits at the end of each year:
  // (fixed payments so far + fixed balance) − (ARM payments so far + ARM balance).
  // Running sums use the same yearly payment × 12 as amortize(), so the last point equals armSaves.
  let fixedPaidSoFar = 0
  let armPaidSoFar = 0
  const exitAdvantage = fixed.rows.map((row, i) => {
    fixedPaidSoFar += row.payment * 12
    armPaidSoFar += arm.rows[i].payment * 12
    return fixedPaidSoFar + row.balance - (armPaidSoFar + arm.rows[i].balance)
  })

  return {
    loan, term, horizon, fixedRate, fixedYears, teaserYears,
    fixed, arm, fixedCost, armCost, armSaves, teaserSavings, breakEven, breakEvenAboveCap, breakEvenLabel, exitAdvantage,
    armStart: toNumber(form.armRate) / 100,
    resetRate: toNumber(form.resetRate) / 100,
    armCeiling,
  }
}

export default function ArmVsFixed() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Fixed · monthly payment', formula: `${money(r.loan, 2)} amortized over ${r.term} years at ${percent(r.fixedRate * 100, 2)}`, result: money(r.fixed.firstPayment, 2) },
    { label: 'ARM · initial monthly payment', formula: `same loan at ${percent(r.armStart * 100, 2)} for the first ${r.fixedYears} years`, result: money(r.arm.firstPayment, 2) },
    { label: 'ARM · rate after the fixed period', formula: `moves toward ${percent(r.resetRate * 100, 2)} by at most ${form.periodicCap || 0}% a year, never above ${percent(r.armCeiling * 100, 2)} lifetime cap`, result: r.arm.rows.length ? percent(r.arm.rows[r.arm.rows.length - 1].rate * 100, 2) + ` in year ${r.horizon}` : '—' },
    { label: 'ARM · highest monthly payment in the window', formula: 'payment re-amortized over the remaining term at each reset', result: money(r.arm.maxPayment, 2) },
    { label: `Fixed · paid over ${r.horizon} years`, formula: `${money(r.fixed.firstPayment, 2)} × 12 × ${r.horizon}`, result: money(r.fixed.paid, 2), note: `Interest ${money(r.fixed.interest, 2)} · balance left ${money(r.fixed.balance, 2)}` },
    { label: `ARM · paid over ${r.horizon} years`, formula: 'sum of each year’s payments', result: money(r.arm.paid, 2), note: `Interest ${money(r.arm.interest, 2)} · balance left ${money(r.arm.balance, 2)}` },
    { label: 'Total cost to exit · Fixed', formula: `payments ${money(r.fixed.paid, 2)} + balance owed ${money(r.fixed.balance, 2)}`, result: money(r.fixedCost, 2) },
    { label: 'Total cost to exit · ARM', formula: `payments ${money(r.arm.paid, 2)} + balance owed ${money(r.arm.balance, 2)}`, result: money(r.armCost, 2) },
    { label: 'ARM advantage / (cost)', formula: `${money(r.fixedCost, 2)} − ${money(r.armCost, 2)}`, result: money(r.armSaves, 2) },
    { label: 'Saved during the fixed period alone', formula: `(${money(r.fixed.firstPayment, 2)} − ${money(r.arm.firstPayment, 2)}) × 12 × ${Math.min(r.fixedYears, r.horizon)}`, result: money(r.teaserSavings, 2) },
    ...(r.breakEven !== null ? [{ label: 'Break-even reset rate', formula: `post-reset rate at which the ARM costs the same as the fixed loan over ${r.horizon} years (solved by search)`, result: r.breakEvenLabel }] : [{ label: 'Break-even reset rate', formula: `horizon ends within the ${r.fixedYears}-year fixed period`, result: 'not applicable' }]),
  ], [r, form.periodicCap])

  const armWins = r.armSaves > 0
  const inWindow = r.horizon <= r.fixedYears
  const ready = r.loan > 0 && r.fixedRate > 0 && r.armStart > 0

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const armLabel = `${r.fixedYears}/1 ARM`
  const ceilingLabel = percent(r.armCeiling * 100, 2)
  // Break-even copy shared by the screen and the print.
  const breakEvenNote = r.breakEven === null
    ? `exit within the ${r.fixedYears}-year fixed period`
    : r.breakEvenAboveCap ? `above the ${ceilingLabel} cap — ARM wins` : 'ARM stops winning above this'
  const breakEvenSentence = r.breakEven === null
    ? ''
    : r.breakEvenAboveCap
      ? ` The break-even (${r.breakEvenLabel}) is above the ${ceilingLabel} lifetime cap: the ARM wins at any capped rate.`
      : ` The ARM stops winning if rates after the reset average more than ${r.breakEvenLabel}.`
  // ARM payment is the teaser rate only for the years inside the holding window.
  const teaserSpan = `years 1–${r.teaserYears}`
  const armTileNote = inWindow ? `${money(r.arm.firstPayment)} a month throughout` : `${money(r.arm.firstPayment)} a month for ${r.fixedYears} years`

  // Stress test: the same loan under the assumptions the note tells the CPA to try.
  // Inside the fixed period the reset never bites, so test a longer stay instead.
  const stress = useMemo(() => {
    const ceilingPct = String(r.armCeiling * 100)
    if (inWindow) {
      const stay = Math.min(r.term, r.fixedYears + 3)
      const stayForm = { ...form, horizon: String(stay) }
      return {
        note: `if the client stays ${stay} years`,
        rows: [
          { label: `Stays ${stay} yrs · reset to ${percent(r.resetRate * 100, 2)}`, result: compute(stayForm) },
          { label: `Stays ${stay} yrs · reset to ${ceilingLabel} cap`, result: compute({ ...stayForm, resetRate: ceilingPct }) },
        ],
      }
    }
    return {
      note: `${r.horizon}-year holding period`,
      rows: [
        { label: `Reset reaches the ${ceilingLabel} lifetime cap`, result: compute({ ...form, resetRate: ceilingPct }) },
        { label: `Reset settles at the ${percent(r.fixedRate * 100, 2)} fixed rate`, result: compute({ ...form, resetRate: String(r.fixedRate * 100) }) },
      ],
    }
  }, [form, r, inWindow, ceilingLabel])
  const stressTable = stress.rows.map((s) => [s.label, money(s.result.arm.maxPayment), money(s.result.armSaves)])

  const assumptions = [
    'Both loans are fully amortizing with level monthly payments; the ARM re-amortizes over the remaining term at each annual adjustment.',
    'After the fixed period the ARM rate moves toward the assumed reset rate by no more than the periodic cap each year and never exceeds the initial rate plus the lifetime cap. Real ARMs follow an index plus margin with a first-adjustment cap that may differ.',
    'Total cost to exit = payments made during the holding period + principal still owed at the end. Closing costs, points, PMI, tax deductibility of interest, and the opportunity cost of payment differences are not modeled.',
    'The break-even reset rate is found by search: the flat post-reset rate at which both loans cost the same over the holding period, respecting the periodic cap but not the lifetime cap. When it is above the lifetime-cap ceiling, the ARM wins at every rate the caps allow.',
    'The stress test reruns the same loan with a different post-reset rate (or a longer stay when the holding period ends inside the fixed period); everything else is unchanged.',
  ]
  const inputs = [
    ['Loan amount', money(r.loan)],
    ['Term', `${r.term} years`],
    ['Years the client expects to keep this loan', `${r.horizon} years`],
    ['Fixed rate', percent(r.fixedRate * 100, 2)],
    ['ARM initial fixed period', FIXED_PERIODS.find((p) => p.value === form.armPeriod)?.label || `${r.fixedYears} years`],
    ['Initial ARM rate', percent(r.armStart * 100, 2)],
    ['Assumed rate after the fixed period', percent(r.resetRate * 100, 2)],
    ['Periodic cap', `${percent(toNumber(form.periodicCap), 2)} per year`],
    ['Lifetime cap', `${percent(toNumber(form.lifetimeCap), 2)} over start (ceiling ${percent(r.armCeiling * 100, 2)})`],
  ]
  // Year-by-year table for print: every year when the window is short; otherwise the
  // first year, the last year, every fifth year, and each year the ARM rate changes.
  const yearRows = (() => {
    const a = r.arm.rows
    if (a.length <= 12) return a
    const ramp = a.filter((row, i) => i === 0 || i === a.length - 1 || row.year % 5 === 0 || row.rate !== a[i - 1].rate)
    if (ramp.length <= 12) return ramp
    // Long ramp: first reset year and the year the rate settles, plus first/last/every fifth.
    const lastChange = a.reduce((acc, row, i) => (i > 0 && row.rate !== a[i - 1].rate ? row.year : acc), 0)
    return a.filter((row, i) => i === 0 || i === a.length - 1 || row.year % 5 === 0 || row.year === r.fixedYears + 1 || row.year === lastChange)
  })()
  const yearsAbridged = yearRows.length < r.arm.rows.length
  const printReport = ready ? (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="ARM vs. Fixed-Rate Mortgage"
          subtitle="The same loan two ways, measured over the years the client actually expects to keep it."
          meta={`${money(r.loan)} · ${r.term}-year term · ${r.horizon}-year holding period · ${armLabel} vs. fixed`}
          metaRight={today}
        />
        <PrintFeature
          label={armWins ? `ARM saves over ${r.horizon} years` : `Fixed saves over ${r.horizon} years`}
          value={money(Math.abs(r.armSaves))}
          note={`Total cost to exit: ARM ${money(r.armCost)} vs. fixed ${money(r.fixedCost)}`}
        />
        <PrintTiles
          items={[
            { label: 'Fixed · cost to exit', value: money(r.fixedCost), note: `${money(r.fixed.firstPayment)} a month throughout`, best: r.armSaves < 0 },
            { label: 'ARM · cost to exit', value: money(r.armCost), note: armTileNote, best: armWins },
            { label: 'Highest ARM payment', value: money(r.arm.maxPayment), note: r.arm.maxPayment > r.fixed.firstPayment ? `${money(r.arm.maxPayment - r.fixed.firstPayment)} above the fixed payment` : 'never above the fixed payment' },
            { label: 'Break-even reset rate', value: r.breakEvenLabel, note: breakEvenNote },
          ]}
        />
        <PrintSection title="How the loans compare" note={`${r.horizon}-year holding period`}>
          <PrintRows
            rows={[
              { label: 'Fixed · monthly payment', value: money(r.fixed.firstPayment) },
              { label: `ARM · monthly payment, ${teaserSpan}`, value: money(r.arm.firstPayment) },
              { label: 'ARM · highest monthly payment in the window', value: money(r.arm.maxPayment) },
              { label: inWindow ? `Saved in payments over the ${r.horizon}-year window (no reset)` : `Saved during the ${r.fixedYears}-year fixed period alone`, value: money(r.teaserSavings), sub: true },
              { label: `ARM advantage / (cost) over ${r.horizon} years`, value: money(r.armSaves), total: true },
            ]}
          />
        </PrintSection>
        <div style={{ marginTop: 6 }}>
          <PrintSection title="What this means">
            <PrintProse>
              The fixed loan costs {money(r.fixed.firstPayment)} a month for the whole window. The ARM starts at {money(r.arm.firstPayment)} for {r.fixedYears} years
              {inWindow
                ? `, and because the client expects to be out in ${r.horizon} years, it never resets — the ARM saves ${money(r.teaserSavings)} in payments with no rate risk taken.`
                : `, then adjusts toward ${percent(r.resetRate * 100, 2)} within the caps, reaching a peak payment of ${money(r.arm.maxPayment)}. Over the full ${r.horizon} years the ${armWins ? 'ARM' : 'fixed loan'} comes out ahead by ${money(Math.abs(r.armSaves))}, including the balance still owed at exit.`}
              {breakEvenSentence}
            </PrintProse>
          </PrintSection>
        </div>
        <PrintSection title={`Payments, interest, and balance at exit over ${r.horizon} years`} className="pr-chart">
          <BarCompare
            height={230}
            groups={[
              { label: 'Payments made', bars: [{ label: 'Fixed-rate', value: r.fixed.paid, color: TONE.navy }, { label: armLabel, value: r.arm.paid, color: TONE.accent }] },
              { label: 'Interest paid', bars: [{ label: 'Fixed-rate', value: r.fixed.interest, color: TONE.navy }, { label: armLabel, value: r.arm.interest, color: TONE.accent }] },
              { label: 'Balance at exit', bars: [{ label: 'Fixed-rate', value: r.fixed.balance, color: TONE.navy }, { label: armLabel, value: r.arm.balance, color: TONE.accent }] },
            ]}
          />
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="ARM vs. Fixed-Rate Mortgage" right={today} />
        <PrintCols>
          <div>
            <PrintSection title="ARM advantage by exit year" note="incl. balance owed" className="pr-chart">
              <LineChart
                xStart="At closing"
                xEnd={`Year ${r.horizon}`}
                legend={false}
                format={(v) => `${v < 0 ? '-' : ''}$${Math.round(Math.abs(v) / 1000).toLocaleString('en-US')}k`}
                series={[{ label: 'ARM advantage / (cost) if the client exits that year', color: TONE.accent, points: [0, ...r.exitAdvantage] }]}
              />
            </PrintSection>
            <div style={{ marginTop: 8 }}>
              <PrintSection title="Stress test" note={stress.note}>
                <PrintTable
                  head={['Scenario', 'Peak payment', 'ARM advantage']}
                  widths={['52%', '22%', '26%']}
                  align={['left', 'right', 'right']}
                  rows={stressTable}
                />
              </PrintSection>
            </div>
          </div>
          <div>
            <PrintSection title="Fixed-rate · total cost to exit" note={!armWins ? 'lower cost' : undefined}>
              <PrintRows
                rows={[
                  { label: 'Monthly payment', value: money(r.fixed.firstPayment) },
                  { label: `Payments made over ${r.horizon} years`, value: money(r.fixed.paid) },
                  { label: 'Interest paid', value: money(r.fixed.interest), sub: true },
                  { label: 'Balance at exit', value: money(r.fixed.balance) },
                  { label: 'Total cost to exit', value: money(r.fixedCost), total: true },
                ]}
              />
            </PrintSection>
            <div style={{ marginTop: 10 }}>
              <PrintSection title={`${armLabel} · total cost to exit`} note={armWins ? 'lower cost' : undefined}>
                <PrintRows
                  rows={[
                    { label: 'Initial payment · highest payment', value: `${money(r.arm.firstPayment)} · ${money(r.arm.maxPayment)}` },
                    { label: `Payments made over ${r.horizon} years`, value: money(r.arm.paid) },
                    { label: 'Interest paid', value: money(r.arm.interest), sub: true },
                    { label: 'Balance at exit', value: money(r.arm.balance) },
                    { label: 'Total cost to exit', value: money(r.armCost), total: true },
                  ]}
                />
              </PrintSection>
            </div>
          </div>
        </PrintCols>
        <PrintSection title="Rate, payment, and balance by year" note={yearsAbridged ? `selected years of ${r.horizon}: first, last, every fifth, and ARM rate changes` : `years 1–${r.horizon}`}>
          <PrintTable
            head={['Year', 'ARM rate', 'ARM payment', 'Fixed payment', 'ARM balance', 'Fixed balance']}
            widths={['10%', '14%', '19%', '19%', '19%', '19%']}
            align={['left', 'right', 'right', 'right', 'right', 'right']}
            rowClass={(row, i) => (i > 0 && yearRows[i].rate !== yearRows[i - 1].rate ? 'is-tint' : '')}
            rows={yearRows.map((row) => [
              row.year,
              percent(row.rate * 100, 2),
              money(row.payment),
              money(r.fixed.rows[row.year - 1]?.payment || 0),
              money(row.balance),
              money(r.fixed.rows[row.year - 1]?.balance || 0),
            ])}
          />
        </PrintSection>
        <PrintNote title="Reading the result">
          An ARM is a bet on two things: how long the client keeps the loan and where rates go after the fixed period. If they will be out before the first reset, the ARM's lower rate is free money. Past the reset, the answer depends on the rate assumption — so run it at the lifetime cap too, and ask whether the client could carry the highest payment shown.
        </PrintNote>
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
  ) : null

  return (
    <ToolShell
      title="ARM or Fixed-Rate Mortgage?"
      subtitle="Compare an adjustable-rate mortgage against a fixed-rate loan over the years the client actually expects to hold it — payments, interest, the balance left at exit, and the reset rate at which the ARM stops winning."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="The loan">
            <MoneyField label="Loan amount" value={form.loan} onChange={set('loan')} />
            <div className="field-row">
              <PillField label="Term" value={form.term} onChange={set('term')} options={TERMS} />
              <NumberField label="Years the client expects to keep this loan" value={form.horizon} onChange={set('horizon')} suffix="yrs" info="Sale, refinance, or payoff. The comparison is run over this window; the balance still owed at the end counts as a cost." />
            </div>
          </Panel>
          <Panel title="Fixed-rate option">
            <NumberField label="Fixed rate" value={form.fixedRate} onChange={set('fixedRate')} suffix="%" />
          </Panel>
          <Panel title="Adjustable-rate option">
            <PillField label="Initial fixed period" value={form.armPeriod} onChange={set('armPeriod')} options={FIXED_PERIODS} />
            <NumberField label="Initial ARM rate" value={form.armRate} onChange={set('armRate')} suffix="%" />
          </Panel>
          <RefinePanel summary="reset rate, rate caps">
            <NumberField label="Assumed rate after the fixed period" value={form.resetRate} onChange={set('resetRate')} suffix="%" info="Your assumption for the fully indexed rate (index + margin) once adjustments begin. The tool moves toward it within the caps below. Try a pessimistic value — that is the point." />
            <div className="field-row">
              <NumberField label="Periodic cap" value={form.periodicCap} onChange={set('periodicCap')} suffix="% / yr" info="Maximum change at each annual adjustment." />
              <NumberField label="Lifetime cap" value={form.lifetimeCap} onChange={set('lifetimeCap')} suffix="% over start" info="Maximum increase above the initial rate over the life of the loan." />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="ARM vs. Fixed" meta={`${money(r.loan)} · ${r.term}-year term · ${r.horizon}-year holding period`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label={armWins ? `ARM saves over ${r.horizon} years` : `Fixed saves over ${r.horizon} years`}
              value={money(Math.abs(r.armSaves))}
              note={`Total cost to exit: ARM ${money(r.armCost)} vs. fixed ${money(r.fixedCost)}`}
            />
            <StatTiles
              items={[
                { label: `ARM payment, ${teaserSpan}`, value: money(r.arm.firstPayment), note: `vs. ${money(r.fixed.firstPayment)} fixed` },
                { label: 'Highest ARM payment in the window', value: money(r.arm.maxPayment), tone: r.arm.maxPayment > r.fixed.firstPayment ? 'bad' : undefined },
                { label: 'Break-even reset rate', value: r.breakEvenLabel, note: breakEvenNote },
              ]}
            />

            <div className="result-list">
              <ResultRow label="Fixed · monthly payment" value={r.fixed.firstPayment} />
              <ResultRow label={`ARM · monthly payment, ${teaserSpan}`} value={r.arm.firstPayment} />
              <ResultRow label="ARM · highest monthly payment in the window" value={r.arm.maxPayment} />
              <ResultRow label={`Interest paid over ${r.horizon} years · Fixed`} value={r.fixed.interest} sub />
              <ResultRow label={`Interest paid over ${r.horizon} years · ARM`} value={r.arm.interest} sub />
              <ResultRow label="Balance still owed at exit · Fixed" value={r.fixed.balance} sub />
              <ResultRow label="Balance still owed at exit · ARM" value={r.arm.balance} sub />
              <ResultRow label="ARM advantage / (cost) over the window" value={r.armSaves} total positive={armWins} negative={!armWins} />
              {r.breakEven !== null ? <ResultRow label={r.breakEvenAboveCap ? `Break-even reset rate (above the ${ceilingLabel} lifetime cap)` : 'Break-even reset rate'} raw={r.breakEvenLabel} /> : null}
            </div>

            <Narrative>
              The fixed loan costs {money(r.fixed.firstPayment)} a month for the whole window. The ARM starts at {money(r.arm.firstPayment)} for {r.fixedYears} years
              {inWindow
                ? `, and because the client expects to be out in ${r.horizon} years, it never resets — the ARM saves ${money(r.teaserSavings)} in payments with no rate risk taken.`
                : `, then adjusts toward ${percent(r.resetRate * 100, 2)} within the caps, reaching a peak payment of ${money(r.arm.maxPayment)}. Over the full ${r.horizon} years the ${armWins ? 'ARM' : 'fixed loan'} comes out ahead by ${money(Math.abs(r.armSaves))}, including the balance still owed at exit.`}
              {breakEvenSentence}
            </Narrative>

            <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 4, marginTop: 14 }}>Stress test · ARM advantage / (cost) — {stress.note}</div>
            <div className="result-list">
              {stress.rows.map((s) => (
                <div key={s.label}>
                  <ResultRow label={s.label} value={s.result.armSaves} positive={s.result.armSaves > 0} negative={s.result.armSaves < 0} />
                  <ResultRow label="Highest ARM payment in that case" value={s.result.arm.maxPayment} sub />
                </div>
              ))}
            </div>

            <ScenarioCards
              sub={`total cost to exit, ${r.horizon} years`}
              scenarios={[
                {
                  label: 'Fixed-rate',
                  value: money(r.fixedCost),
                  best: r.armSaves < 0,
                  rows: [
                    { label: 'Monthly payment', value: money(r.fixed.firstPayment) },
                    { label: 'Interest paid', value: money(r.fixed.interest) },
                    { label: 'Balance at exit', value: money(r.fixed.balance) },
                  ],
                },
                {
                  label: `${r.fixedYears}/1 ARM`,
                  value: money(r.armCost),
                  best: armWins,
                  rows: [
                    { label: 'Initial payment', value: money(r.arm.firstPayment) },
                    { label: 'Highest payment', value: money(r.arm.maxPayment) },
                    { label: 'Interest paid', value: money(r.arm.interest) },
                    { label: 'Balance at exit', value: money(r.arm.balance) },
                  ],
                },
              ]}
            />

            <div className="chart-block" style={{ marginTop: 6 }}>
              <BarCompare
                height={170}
                groups={[
                  { label: 'Payments made', bars: [{ label: 'Fixed', value: r.fixed.paid, color: TONE.navy }, { label: 'ARM', value: r.arm.paid, color: TONE.accent }] },
                  { label: 'Interest paid', bars: [{ label: 'Fixed', value: r.fixed.interest, color: TONE.navy }, { label: 'ARM', value: r.arm.interest, color: TONE.accent }] },
                  { label: 'Balance at exit', bars: [{ label: 'Fixed', value: r.fixed.balance, color: TONE.navy }, { label: 'ARM', value: r.arm.balance, color: TONE.accent }] },
                ]}
              />
            </div>

            <div className="chart-block">
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Balance owed, year by year</div>
              <LineChart
                xEnd={`Year ${r.horizon}`}
                series={[
                  { label: 'Fixed balance', color: TONE.navy, points: [r.loan, ...r.fixed.rows.map((row) => row.balance)] },
                  { label: 'ARM balance', color: TONE.accent, points: [r.loan, ...r.arm.rows.map((row) => row.balance)] },
                ]}
              />
            </div>

            <table className="data-table" style={{ marginTop: 14 }}>
              <thead><tr><th>Year</th><th className="num">ARM rate</th><th className="num">ARM payment</th><th className="num">Fixed payment</th><th className="num">ARM balance</th><th className="num">Fixed balance</th></tr></thead>
              <tbody>
                {r.arm.rows.map((row, i) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td className="num">{percent(row.rate * 100, 2)}</td>
                    <td className="num">{money(row.payment)}</td>
                    <td className="num">{money(r.fixed.rows[i]?.payment || 0)}</td>
                    <td className="num">{money(row.balance)}</td>
                    <td className="num">{money(r.fixed.rows[i]?.balance || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the result">
        An ARM is a bet on two things: how long the client keeps the loan and where rates go after the fixed period. If they will be out before the first reset, the ARM's lower rate is free money. Past the reset, the answer depends on the rate assumption — so run it at the lifetime cap too, and ask whether the client could carry the highest payment shown.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
