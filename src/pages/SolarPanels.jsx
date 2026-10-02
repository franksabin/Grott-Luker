import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  RefinePanel,
  StatTiles,
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

const PAY = [
  { value: 'cash', label: 'Pay cash' },
  { value: 'loan', label: 'Finance it' },
]

const LIFE = 25 // system life, years
const INVERTER_YEAR = 12

const yrs = (n) => `${n} ${n === 1 ? 'year' : 'years'}`
const yrsShort = (n) => `${n} ${n === 1 ? 'yr' : 'yrs'}`

const BLANK = {
  cost: '',
  incentives: '',
  creditPct: '0',
  annualSavings: '',
  escalation: '3',
  degradation: '0.5',
  maintenance: '0',
  inverter: '0',
  pay: 'cash',
  loanRate: '',
  loanYears: '',
  horizon: '',
  discount: '5',
  homeValueAdd: '0',
}

const SAMPLE = {
  cost: '32000',
  incentives: '2500',
  creditPct: '0',
  annualSavings: '2400',
  escalation: '3',
  degradation: '0.5',
  maintenance: '150',
  inverter: '2500',
  pay: 'loan',
  loanRate: '7.5',
  loanYears: '15',
  horizon: '12',
  discount: '5',
  homeValueAdd: '12000',
}

function pmt(balance, annualRate, months) {
  if (months <= 0) return 0
  const r = annualRate / 12
  if (r === 0) return balance / months
  return (balance * r) / (1 - Math.pow(1 + r, -months))
}

// Internal rate of return on a series of annual cash flows (year 0 first), by bisection.
function irr(flows) {
  const npv = (rate) => flows.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0)
  if (npv(0) <= 0) return null // never pays back
  let lo = 0
  let hi = 1
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (npv(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function compute(form) {
  const cost = toNumber(form.cost)
  const credit = cost * (toNumber(form.creditPct) / 100)
  const incentives = toNumber(form.incentives)
  const netCost = Math.max(0, cost - credit - incentives)
  const savings1 = toNumber(form.annualSavings)
  const esc = toNumber(form.escalation) / 100
  const degr = toNumber(form.degradation) / 100
  const maint = toNumber(form.maintenance)
  const inverter = toNumber(form.inverter)
  const financed = form.pay === 'loan'
  const loanRate = toNumber(form.loanRate) / 100
  const loanYears = Math.max(1, Math.round(toNumber(form.loanYears)) || 10)
  const horizon = Math.max(1, Math.min(LIFE, Math.round(toNumber(form.horizon)) || LIFE))
  const disc = toNumber(form.discount) / 100
  const homeValueAdd = toNumber(form.homeValueAdd)

  const monthly = financed ? pmt(netCost, loanRate, loanYears * 12) : 0
  const annualLoan = monthly * 12
  const totalLoanPaid = annualLoan * loanYears

  // Year-by-year over the full system life; the "horizon" is when the client expects to sell.
  const rows = []
  let cum = financed ? 0 : -netCost
  let paybackYear = null
  let loanBal = financed ? netCost : 0
  const flows = [financed ? 0 : -netCost]
  for (let y = 1; y <= LIFE; y++) {
    const savings = savings1 * Math.pow(1 + esc, y - 1) * Math.pow(1 - degr, y - 1)
    const upkeep = maint + (y === INVERTER_YEAR ? inverter : 0)
    const loanPay = financed && y <= loanYears ? annualLoan : 0
    if (financed && y <= loanYears) {
      // reduce balance for the exit-year payoff figure
      let b = loanBal
      for (let m = 0; m < 12; m++) {
        const i = b * (loanRate / 12)
        b = Math.max(0, b - (monthly - i))
      }
      loanBal = b
    }
    const net = savings - upkeep - loanPay
    cum += net
    // Payback: the first year cumulative cash covers any loan balance still owed — the year the
    // client could sell with no home-value premium and be whole. For a cash purchase the balance is 0.
    if (paybackYear === null && savings > 0 && cum - loanBal >= 0) paybackYear = y
    flows.push(net)
    rows.push({ year: y, savings, upkeep, loanPay, net, cum, loanBal })
  }

  // At the client's exit year: cumulative net cash + any home-value premium − loan payoff.
  const exit = rows[horizon - 1]
  const exitPosition = exit.cum + homeValueAdd - exit.loanBal
  const exitNoPremium = exit.cum - exit.loanBal
  // Kept for the full system life: net of any balance still owed (loans longer than the system life).
  const lifeEnd = rows[LIFE - 1]
  const lifetimeNet = lifeEnd.cum - lifeEnd.loanBal

  // NPV / IRR over the holding period, counting the exit premium and loan payoff in the final year.
  const hFlows = flows.slice(0, horizon + 1)
  hFlows[horizon] += homeValueAdd - exit.loanBal
  const npv = hFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + disc, t), 0)
  const npvNoPremium = npv - homeValueAdd / Math.pow(1 + disc, horizon)
  const rate = financed ? null : irr(hFlows)

  const totalSavingsH = rows.slice(0, horizon).reduce((s, r) => s + r.savings, 0)
  const totalUpkeepH = rows.slice(0, horizon).reduce((s, r) => s + r.upkeep, 0)
  const totalLoanH = rows.slice(0, horizon).reduce((s, r) => s + r.loanPay, 0)

  return {
    cost, credit, incentives, netCost, savings1, esc, degr, financed, monthly, annualLoan, totalLoanPaid, loanYears, loanRate,
    horizon, disc, homeValueAdd, rows, paybackYear, exit, exitPosition, exitNoPremium, lifetimeNet, lifeLoanBal: lifeEnd.loanBal,
    npv, npvNoPremium, irr: rate, totalSavingsH, totalUpkeepH, totalLoanH,
  }
}

export default function SolarPanels() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Net installed cost', formula: `${money(r.cost, 2)} − tax credit ${money(r.credit, 2)} − rebates ${money(r.incentives, 2)}`, result: money(r.netCost, 2) },
    ...(r.financed ? [{ label: 'Loan payment', formula: `${money(r.netCost, 2)} over ${r.loanYears} years at ${percent(r.loanRate * 100, 2)}`, result: `${money(r.monthly, 2)} / month · ${money(r.annualLoan, 2)} / year`, note: `Total paid over the loan: ${money(r.totalLoanPaid, 2)}.` }] : []),
    { label: 'Year-1 electricity savings', formula: 'as entered', result: money(r.savings1, 2) },
    { label: `Year-${r.horizon} electricity savings`, formula: `${money(r.savings1, 2)} × (1 + ${percent(r.esc * 100, 1)})^${r.horizon - 1} × (1 − ${percent(r.degr * 100, 1)})^${r.horizon - 1}`, result: money(r.exit.savings, 2) },
    { label: `Savings over ${r.horizon} years`, formula: 'sum of each year, escalated and degraded', result: money(r.totalSavingsH, 2) },
    { label: `Upkeep over ${r.horizon} years`, formula: `maintenance each year${r.horizon >= INVERTER_YEAR ? ` + inverter replacement in year ${INVERTER_YEAR}` : ''}`, result: money(r.totalUpkeepH, 2) },
    ...(r.financed ? [{ label: `Loan payments over ${r.horizon} years`, formula: `${money(r.annualLoan, 2)} × ${Math.min(r.horizon, r.loanYears)}`, result: money(r.totalLoanH, 2) }, { label: `Loan balance at year ${r.horizon}`, formula: 'amortized balance to pay off at sale', result: money(r.exit.loanBal, 2) }] : []),
    { label: `Cumulative cash position at year ${r.horizon}`, formula: r.financed ? 'savings − upkeep − loan payments' : `savings − upkeep − ${money(r.netCost, 2)} paid up front`, result: money(r.exit.cum, 2) },
    { label: 'Home-value premium at sale', formula: 'as entered', result: money(r.homeValueAdd, 2) },
    { label: `Net position at exit (year ${r.horizon})`, formula: `${money(r.exit.cum, 2)} + ${money(r.homeValueAdd, 2)} − loan payoff ${money(r.exit.loanBal, 2)}`, result: money(r.exitPosition, 2) },
    { label: 'Payback year', formula: r.financed ? 'first year cumulative cash covers the remaining loan balance' : 'first year cumulative cash turns positive', result: r.paybackYear ? `year ${r.paybackYear}` : `not within ${LIFE} years` },
    { label: `Net present value at ${percent(r.disc * 100, 1)}`, formula: `Σ cash flow ÷ (1 + ${percent(r.disc * 100, 1)})^year, years 0–${r.horizon}`, result: money(r.npv, 2) },
    ...(r.irr !== null && !r.financed ? [{ label: 'Internal rate of return', formula: 'discount rate at which NPV = 0 (solved by search)', result: percent(r.irr * 100, 1) }] : []),
  ], [r])

  const good = r.npv > 0
  // Cumulative cash by year over the holding period; year 0 is the starting position.
  const cumSeries = [r.financed ? 0 : -r.netCost, ...r.rows.slice(0, r.horizon).map((row) => row.cum)]
  const hasCash = cumSeries.some((v) => Math.abs(v) >= 1)

  // Payback copy shared by the screen and the print so the two can never disagree.
  const soldBeforePayback = r.paybackYear !== null && r.paybackYear > r.horizon
  const paybackHow = r.financed ? 'cash covers the loan balance' : 'cumulative cash turns positive'
  const featureNote = r.paybackYear
    ? `Pays back in year ${r.paybackYear}${soldBeforePayback ? `, after the planned year-${r.horizon} sale` : ''} · net position at exit ${money(r.exitPosition)}`
    : `Does not pay back within ${LIFE} years · net position at exit ${money(r.exitPosition)}`
  const paybackTile = {
    label: 'Payback year',
    value: r.paybackYear ? `Year ${r.paybackYear}` : 'None',
    note: r.paybackYear ? (soldBeforePayback ? `after the year-${r.horizon} sale` : paybackHow) : `not within ${LIFE} years`,
  }
  const upfront = r.credit + r.incentives
  const narrative = (
    <>
      {upfront > 0 ? `After the ${money(upfront)} in credits and rebates, the system costs ${money(r.netCost)}` : `With no credits or rebates, the system costs ${money(r.netCost)}`}
      {r.financed ? `, financed at ${money(r.monthly)} a month for ${yrs(r.loanYears)}` : ' paid up front'}.
      It saves about {money(r.savings1)} in the first year, rising with a {percent(r.esc * 100, 1)} utility escalator and easing with {percent(r.degr * 100, 1)} annual panel degradation.
      {r.paybackYear
        ? ` ${r.financed ? 'Cumulative cash covers the remaining loan balance' : 'Cumulative cash turns positive'} in year ${r.paybackYear}${soldBeforePayback ? `, after the planned sale in year ${r.horizon}` : ''}.`
        : ` Cumulative cash never ${r.financed ? 'covers the loan balance' : 'turns positive'} over the ${LIFE}-year system life.`}
      {' '}Selling in year {r.horizon} {r.homeValueAdd > 0 ? `with a ${money(r.homeValueAdd)} premium` : 'with no home-value premium'}{r.financed ? (r.exit.loanBal >= 0.5 ? ` and paying off the ${money(r.exit.loanBal)} loan balance` : ', with the loan already retired,') : ''} leaves the client {r.exitPosition >= 0 ? 'ahead' : 'behind'} by {money(Math.abs(r.exitPosition))}
      {' '}— {r.npv === 0 ? 'a' : good ? 'a positive' : 'a negative'} net present value of {money(Math.abs(r.npv))} at a {percent(r.disc * 100, 1)} discount rate.
    </>
  )
  const lifetimeLabel = `Lifetime (${LIFE}-year) net cash if kept${r.lifeLoanBal >= 0.5 ? ', net of loan payoff' : ''}`

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const payLabel = r.financed ? 'Financed' : 'Paid in cash'
  const yearRows = r.rows.filter((row) => row.year <= r.horizon && (row.year <= 5 || row.year % 5 === 0 || row.year === r.horizon || row.year === INVERTER_YEAR))
  const yearHead = ['Year', 'Savings', 'Upkeep', ...(r.financed ? ['Loan'] : []), 'Net', 'Cumulative', ...(r.financed ? ['Loan balance'] : [])]
  const assumptions = [
    `Savings grow with the utility escalator and shrink with panel degradation each year over a ${LIFE}-year system life; production is otherwise assumed flat (no shading changes, no net-metering policy changes).`,
    'The federal residential clean energy credit (§25D) is not available for systems placed in service after 2025 under the 2025 tax law; the credit field defaults to 0%. Business installations under §48E and any state credits are entered manually.',
    'Loans are level-payment and fully amortizing; the remaining balance is paid off at sale. Dealer fees embedded in solar loans should be included in the gross cost.',
    'Payback is the first year cumulative cash covers any loan balance still owed — the year the client could sell with no home-value premium and be whole. It can fall after the planned sale.',
    'Net present value and IRR run over the holding period only and include the home-value premium and loan payoff in the final year. Electricity savings are treated as untaxed.',
    'Insurance, roof work, permitting, panel removal for re-roofing, and battery storage are not modeled.',
  ]
  const inputs = [
    ['Installed system cost (gross)', money(r.cost)],
    ['State, utility & other rebates', money(r.incentives)],
    ['Federal tax credit', `${percent(toNumber(form.creditPct), 0)} · ${money(r.credit)}`],
    ['How it is paid for', payLabel],
    ...(r.financed ? [['Loan rate', percent(r.loanRate * 100, 2)], ['Loan term', yrs(r.loanYears)]] : []),
    ['Year-1 electricity savings', money(r.savings1)],
    ['Years until the home is sold', yrs(r.horizon)],
    ['Discount rate', percent(r.disc * 100, 1)],
    ['Utility rate escalation', `${percent(r.esc * 100, 1)} / yr`],
    ['Panel degradation', `${percent(r.degr * 100, 1)} / yr`],
    ['Annual maintenance', money(toNumber(form.maintenance))],
    [`Inverter replacement (year ${INVERTER_YEAR})`, money(toNumber(form.inverter))],
    ['Home-value premium at sale', money(r.homeValueAdd)],
  ]
  // Page-2 comparison, drawn as horizontal bars with inline styles: the shared BarCompare squashes its
  // tallest bar by the value-label height (flex-shrink), so a three-bar comparison prints with wrong ratios.
  const dollarBars = [
    { label: `Electricity saved`, value: r.totalSavingsH, color: TONE.accent },
    r.financed
      ? { label: `Loan payments (${yrsShort(Math.min(r.horizon, r.loanYears))})`, value: r.totalLoanH, color: TONE.navy }
      : { label: 'Net cost, paid up front', value: r.netCost, color: TONE.navy },
    { label: 'Upkeep', value: r.totalUpkeepH, color: TONE.debt },
    { label: 'Home premium at sale', value: r.homeValueAdd, color: TONE.net },
  ]
  const barMax = Math.max(0, ...dollarBars.map((b) => b.value))
  const barInk = { fontSize: 9.5, color: '#726d63', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const barVal = { fontSize: 11, fontWeight: 400, color: '#0f2440', fontVariantNumeric: 'lining-nums tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }
  const glanceRows = [
    { label: 'Net installed cost', value: money(r.netCost) },
    ...(r.financed ? [{ label: `Monthly loan payment (${percent(r.loanRate * 100, 2)} · ${yrsShort(r.loanYears)})`, value: money(r.monthly), sub: true }] : []),
    { label: `Total electricity saved over ${yrs(r.horizon)}`, value: money(r.totalSavingsH) },
    { label: `Upkeep over ${yrs(r.horizon)}`, value: money(-r.totalUpkeepH || 0), sub: true },
    ...(r.financed ? [{ label: `Loan payments over ${yrs(r.horizon)}`, value: money(-r.totalLoanH || 0), sub: true }] : []),
    { label: `Cumulative cash at year ${r.horizon}`, value: money(r.exit.cum) },
    { label: 'Home-value premium at sale', value: money(r.homeValueAdd), sub: true },
    ...(r.financed && r.exit.loanBal >= 0.5 ? [{ label: `Loan balance paid off at sale (year ${r.horizon})`, value: money(-r.exit.loanBal), sub: true }] : []),
    { label: 'Net position at exit', value: money(r.exitPosition), total: true },
    ...(r.horizon < LIFE ? [{ label: lifetimeLabel, value: money(r.lifetimeNet), sub: true }] : []),
    ...(r.irr !== null && !r.financed ? [{ label: 'Internal rate of return (cash purchase)', value: percent(r.irr * 100, 1) }] : []),
  ]
  const sensitivityRows = [
    { label: `Net position at exit, no premium`, value: money(r.exitNoPremium) },
    { label: `NPV at ${percent(r.disc * 100, 1)}, no premium`, value: money(r.npvNoPremium) },
    { label: `Year-${r.horizon} electricity savings`, value: money(r.exit.savings), sub: true },
    { label: 'Payback year', value: r.paybackYear ? `Year ${r.paybackYear}${soldBeforePayback ? ' (after sale)' : ''}` : 'None', sub: true },
  ]
  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="Solar Investment Review"
          subtitle="A solar quote as a financial decision: net cost, savings that grow with rates and fade with age, payback, and NPV over the holding period."
          meta={`${money(r.netCost)} net cost · ${r.horizon}-year horizon · ${r.financed ? 'financed' : 'paid in cash'}`}
          metaRight={today}
        />
        <PrintFeature
          label={`Net present value over ${yrs(r.horizon)} at ${percent(r.disc * 100, 1)}`}
          value={money(r.npv)}
          note={featureNote}
        />
        <PrintTiles
          items={[
            { label: 'Net installed cost', value: money(r.netCost), note: r.financed ? `${money(r.monthly)}/mo financed` : 'paid up front' },
            { label: 'Electricity saved', value: money(r.totalSavingsH), note: `over ${yrs(r.horizon)} · ${money(r.savings1)} in year 1` },
            paybackTile,
            { label: 'Net position at exit', value: money(r.exitPosition), note: `year ${r.horizon}, with home premium`, best: r.exitPosition > 0 },
          ]}
        />
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        <PrintSection title="Cumulative cash by year" note={r.financed ? 'savings less upkeep and loan payments, before the sale' : 'savings less upkeep, after the up-front cost'} className="pr-chart">
          {hasCash ? (
            <LineChart
              xStart="Today"
              xEnd={`Year ${r.horizon}`}
              series={[{ label: 'Cumulative cash position', color: TONE.net, points: cumSeries }]}
            />
          ) : (
            <PrintProse>Enter the installed cost and the year-1 electricity savings to chart the cumulative cash position through the planned sale.</PrintProse>
          )}
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="Solar Investment Review" right={today} />
        <PrintCols>
          <PrintSection title="The investment at a glance" note={`${r.horizon}-year holding period`}>
            <PrintRows rows={glanceRows} />
          </PrintSection>
          <div>
            <PrintSection title={`Dollars over ${yrs(r.horizon)}`} note={r.financed ? `loan runs ${yrs(r.loanYears)} · ${money(r.totalLoanPaid)} total` : 'cash purchase'}>
              {barMax > 0 ? (
                <div style={{ padding: '6px 12px 0' }}>
                  {dollarBars.map((b) => (
                    <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '118px minmax(0, 1fr) 62px', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={barInk}>{b.label}</span>
                      <span style={{ display: 'block', height: 12, background: '#efeae0', borderRadius: 2, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <span style={{ display: 'block', height: '100%', width: `${(Math.max(0, b.value) / barMax) * 100}%`, minWidth: b.value > 0 ? 2 : 0, background: b.color, borderRadius: 2, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                      </span>
                      <b style={barVal}>{money(b.value)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <PrintProse>Enter the installed cost and the year-1 electricity savings to compare the dollars in and out.</PrintProse>
              )}
            </PrintSection>
            <PrintSection title="Without the home premium" note="the conservative case">
              <PrintRows rows={sensitivityRows} />
            </PrintSection>
          </div>
        </PrintCols>
        <PrintSection title="Year by year" note={`through year ${r.horizon}${r.horizon >= INVERTER_YEAR ? `; inverter replacement in year ${INVERTER_YEAR}` : ''}`}>
          <PrintTable
            head={yearHead}
            align={yearHead.map((_, i) => (i === 0 ? 'left' : 'right'))}
            rows={yearRows.map((row) => [
              String(row.year),
              money(row.savings),
              money(row.upkeep),
              ...(r.financed ? [money(row.loanPay)] : []),
              money(row.net),
              money(row.cum),
              ...(r.financed ? [money(row.loanBal)] : []),
            ])}
          />
        </PrintSection>
        <PrintNote title="Reading the result">
          Solar is a long-dated, illiquid investment in a home the client may not keep. The two inputs that swing the answer most are the holding period and the home-value premium at sale — run it with the premium at zero before trusting a positive result. A financed system that only pencils out because of the loan's tax-free savings stream is a leveraged bet on utility rates.
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
      title="Should I Invest in Solar Panels?"
      subtitle="Turn a solar quote into a financial decision: net cost after incentives, electricity savings that grow with utility rates and fade with panel age, payback year, and the net present value over the years the client expects to stay in the home."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="The quote">
            <div className="field-row">
              <MoneyField label="Installed system cost (gross)" value={form.cost} onChange={set('cost')} />
              <MoneyField label="State, utility & other rebates" value={form.incentives} onChange={set('incentives')} />
            </div>
            <SegmentedField label="How it is paid for" value={form.pay} onChange={set('pay')} options={PAY} />
            {form.pay === 'loan' ? (
              <div className="field-row">
                <NumberField label="Loan rate" value={form.loanRate} onChange={set('loanRate')} suffix="%" />
                <NumberField label="Loan term" value={form.loanYears} onChange={set('loanYears')} suffix="yrs" />
              </div>
            ) : null}
          </Panel>
          <Panel title="Savings & horizon">
            <div className="field-row">
              <MoneyField label="Year-1 electricity savings" value={form.annualSavings} onChange={set('annualSavings')} info="From the installer's production estimate × the client's utility rate, or the portion of the current bill the system offsets." />
              <NumberField label="Years until the home is sold" value={form.horizon} onChange={set('horizon')} suffix="yrs" info={`Up to ${LIFE}, the assumed system life.`} />
            </div>
          </Panel>
          <RefinePanel summary="tax credit, escalation, degradation, upkeep, discount rate, home-value premium">
            <div className="field-row">
              <NumberField label="Federal tax credit" value={form.creditPct} onChange={set('creditPct')} suffix="%" info="The 30% residential clean energy credit (§25D) ended for systems placed in service after December 31, 2025. Leave at 0 for 2026 installs unless the client qualifies under a transition rule; the business credit (§48E) has different terms." />
              <NumberField label="Discount rate" value={form.discount} onChange={set('discount')} suffix="%" info="What the money could earn elsewhere — used for the net present value." />
            </div>
            <div className="field-row">
              <NumberField label="Utility rate escalation" value={form.escalation} onChange={set('escalation')} suffix="% / yr" />
              <NumberField label="Panel degradation" value={form.degradation} onChange={set('degradation')} suffix="% / yr" info="Output loss per year; 0.5% is typical for modern panels." />
            </div>
            <div className="field-row">
              <MoneyField label="Annual maintenance" value={form.maintenance} onChange={set('maintenance')} />
              <MoneyField label={`Inverter replacement (year ${INVERTER_YEAR})`} value={form.inverter} onChange={set('inverter')} />
            </div>
            <MoneyField label="Home-value premium at sale" value={form.homeValueAdd} onChange={set('homeValueAdd')} info="What an owned system adds to the sale price. Often a fraction of cost; zero is the conservative choice. Leased systems typically add nothing." />
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="Solar Investment Review" meta={`${money(r.netCost)} net cost · ${r.horizon}-year horizon · ${r.financed ? 'financed' : 'paid in cash'}`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label={`Net present value over ${yrs(r.horizon)} at ${percent(r.disc * 100, 1)}`}
              value={money(r.npv)}
              note={featureNote}
            />
            <StatTiles
              items={[
                { label: 'Net installed cost', value: money(r.netCost), note: r.financed ? `${money(r.monthly)}/mo financed` : 'paid up front' },
                paybackTile,
                { label: `Net position at exit`, value: money(r.exitPosition), tone: r.exitPosition > 0 ? 'good' : r.exitPosition < 0 ? 'bad' : undefined, note: `year ${r.horizon}, with home premium` },
              ]}
            />

            <div className="result-list">
              <ResultRow label="Net installed cost" value={r.netCost} />
              {r.financed ? <ResultRow label="Monthly loan payment" value={r.monthly} /> : null}
              <ResultRow label="Year-1 savings" value={r.savings1} sub />
              <ResultRow label={`Total electricity saved over ${yrs(r.horizon)}`} value={r.totalSavingsH} />
              <ResultRow label={`Upkeep over ${yrs(r.horizon)}`} value={-r.totalUpkeepH} negative sub />
              <ResultRow label={`Cumulative cash at year ${r.horizon}`} value={r.exit.cum} />
              <ResultRow label={`Net position at exit (with home premium${r.financed ? ', after loan payoff' : ''})`} value={r.exitPosition} total positive={r.exitPosition > 0} negative={r.exitPosition < 0} />
              <ResultRow label="Net position at exit with no home premium" value={r.exitNoPremium} sub />
              {r.horizon < LIFE ? <ResultRow label={lifetimeLabel} value={r.lifetimeNet} sub /> : null}
              {r.irr !== null && !r.financed ? <ResultRow label="Internal rate of return (cash purchase)" raw={percent(r.irr * 100, 1)} /> : null}
            </div>

            <Narrative>{narrative}</Narrative>

            <div className="chart-block">
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Cumulative cash by year</div>
              <LineChart
                xStart="Today"
                xEnd={`Year ${r.horizon}`}
                series={[{ label: 'Cumulative cash position', color: TONE.net, points: cumSeries }]}
              />
            </div>

            <div className="chart-block" style={{ marginTop: 6 }}>
              <BarCompare
                height={170}
                groups={[
                  { label: `Over ${r.horizon} years`, bars: [
                    { label: 'Electricity saved', value: r.totalSavingsH, color: TONE.accent },
                    { label: r.financed ? 'Loan payments' : 'Net cost', value: r.financed ? r.totalLoanH : r.netCost, color: TONE.navy },
                    { label: 'Upkeep', value: r.totalUpkeepH, color: TONE.debt },
                  ] },
                ]}
              />
            </div>

            <table className="data-table" style={{ marginTop: 14 }}>
              <thead><tr><th>Year</th><th className="num">Savings</th><th className="num">Upkeep</th>{r.financed ? <th className="num">Loan</th> : null}<th className="num">Net</th><th className="num">Cumulative</th></tr></thead>
              <tbody>
                {r.rows.filter((row) => row.year <= r.horizon && (row.year <= 5 || row.year % 5 === 0 || row.year === r.horizon || row.year === INVERTER_YEAR)).map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td className="num">{money(row.savings)}</td>
                    <td className="num">{money(row.upkeep)}</td>
                    {r.financed ? <td className="num">{money(row.loanPay)}</td> : null}
                    <td className="num">{money(row.net)}</td>
                    <td className="num">{money(row.cum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the result">
        Solar is a long-dated, illiquid investment in a home the client may not keep. The two inputs that swing the answer most are the holding period and the home-value premium at sale — run it with the premium at zero before trusting a positive result. A financed system that only pencils out because of the loan's tax-free savings stream is a leveraged bet on utility rates.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
