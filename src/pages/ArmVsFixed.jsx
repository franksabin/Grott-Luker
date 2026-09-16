import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SelectField,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
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
  resetRate: '',
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

  return {
    loan, term, horizon, fixedRate, fixedYears,
    fixed, arm, fixedCost, armCost, armSaves, teaserSavings, breakEven,
    armStart: toNumber(form.armRate) / 100,
    resetRate: toNumber(form.resetRate) / 100,
    armCeiling: (toNumber(form.armRate) + toNumber(form.lifetimeCap)) / 100,
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
    ...(r.breakEven !== null ? [{ label: 'Break-even reset rate', formula: `post-reset rate at which the ARM costs the same as the fixed loan over ${r.horizon} years (solved by search)`, result: percent(r.breakEven * 100, 2) }] : [{ label: 'Break-even reset rate', formula: `horizon ends within the ${r.fixedYears}-year fixed period`, result: 'not applicable' }]),
  ], [r, form.periodicCap])

  const armWins = r.armSaves > 0
  const inWindow = r.horizon <= r.fixedYears

  return (
    <ToolShell
      title="ARM or Fixed-Rate Mortgage?"
      subtitle="Compare an adjustable-rate mortgage against a fixed-rate loan over the years the client actually expects to hold it — payments, interest, the balance left at exit, and the reset rate at which the ARM stops winning."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="The loan">
            <MoneyField label="Loan amount" value={form.loan} onChange={set('loan')} />
            <div className="field-row">
              <SelectField label="Term" value={form.term} onChange={set('term')} options={TERMS} />
              <NumberField label="Years the client expects to keep this loan" value={form.horizon} onChange={set('horizon')} suffix="yrs" info="Sale, refinance, or payoff. The comparison is run over this window; the balance still owed at the end counts as a cost." />
            </div>
          </Panel>
          <Panel title="Fixed-rate option">
            <NumberField label="Fixed rate" value={form.fixedRate} onChange={set('fixedRate')} suffix="%" />
          </Panel>
          <Panel title="Adjustable-rate option">
            <div className="field-row">
              <SelectField label="Initial fixed period" value={form.armPeriod} onChange={set('armPeriod')} options={FIXED_PERIODS} />
              <NumberField label="Initial ARM rate" value={form.armRate} onChange={set('armRate')} suffix="%" />
            </div>
            <NumberField label="Assumed rate after the fixed period" value={form.resetRate} onChange={set('resetRate')} suffix="%" info="Your assumption for the fully indexed rate (index + margin) once adjustments begin. The tool moves toward it within the caps below. Try a pessimistic value — that is the point." />
            <div className="field-row">
              <NumberField label="Periodic cap" value={form.periodicCap} onChange={set('periodicCap')} suffix="% / yr" info="Maximum change at each annual adjustment." />
              <NumberField label="Lifetime cap" value={form.lifetimeCap} onChange={set('lifetimeCap')} suffix="% over start" info="Maximum increase above the initial rate over the life of the loan." />
            </div>
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="ARM vs. Fixed" meta={`${money(r.loan)} · ${r.term}-year term · ${r.horizon}-year holding period`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label={armWins ? `ARM saves over ${r.horizon} years` : `Fixed saves over ${r.horizon} years`}
              value={money(Math.abs(r.armSaves))}
              note={`Total cost to exit: ARM ${money(r.armCost)} vs. fixed ${money(r.fixedCost)}`}
            />
            <Narrative>
              The fixed loan costs {money(r.fixed.firstPayment)} a month for the whole window. The ARM starts at {money(r.arm.firstPayment)} for {r.fixedYears} years
              {inWindow
                ? `, and because the client expects to be out in ${r.horizon} years, it never resets — the ARM saves ${money(r.teaserSavings)} in payments with no rate risk taken.`
                : `, then adjusts toward ${percent(r.resetRate * 100, 2)} within the caps, reaching a peak payment of ${money(r.arm.maxPayment)}. Over the full ${r.horizon} years the ${armWins ? 'ARM' : 'fixed loan'} comes out ahead by ${money(Math.abs(r.armSaves))}, including the balance still owed at exit.`}
              {r.breakEven !== null ? ` The ARM stops winning if rates after the reset average more than ${percent(r.breakEven * 100, 2)}.` : ''}
            </Narrative>

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

            <div className="result-list">
              <ResultRow label="Fixed · monthly payment" value={r.fixed.firstPayment} />
              <ResultRow label={`ARM · monthly payment, years 1–${r.fixedYears}`} value={r.arm.firstPayment} />
              <ResultRow label="ARM · highest monthly payment in the window" value={r.arm.maxPayment} />
              <ResultRow label={`Interest paid over ${r.horizon} years · Fixed`} value={r.fixed.interest} sub />
              <ResultRow label={`Interest paid over ${r.horizon} years · ARM`} value={r.arm.interest} sub />
              <ResultRow label="Balance still owed at exit · Fixed" value={r.fixed.balance} sub />
              <ResultRow label="Balance still owed at exit · ARM" value={r.arm.balance} sub />
              <ResultRow label="ARM advantage / (cost) over the window" value={r.armSaves} total positive={armWins} negative={!armWins} />
              {r.breakEven !== null ? <ResultRow label="Break-even reset rate" raw={percent(r.breakEven * 100, 2)} /> : null}
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

      <Assumptions
        items={[
          'Both loans are fully amortizing with level monthly payments; the ARM re-amortizes over the remaining term at each annual adjustment.',
          'After the fixed period the ARM rate moves toward the assumed reset rate by no more than the periodic cap each year and never exceeds the initial rate plus the lifetime cap. Real ARMs follow an index plus margin with a first-adjustment cap that may differ.',
          'Total cost to exit = payments made during the holding period + principal still owed at the end. Closing costs, points, PMI, tax deductibility of interest, and the opportunity cost of payment differences are not modeled.',
          'The break-even reset rate is found by search: the flat post-reset rate at which both loans cost the same over the holding period.',
        ]}
      />
    </ToolShell>
  )
}
