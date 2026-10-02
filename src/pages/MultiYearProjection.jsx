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
  ScenarioCards,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { LineChart, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { TAX_YEAR, rmdStartAge } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'
import { computeMultiYear, TAXABLE_DRAG } from '../lib/multiYear.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const MODE = [
  { value: 'none', label: 'No conversions' },
  { value: 'fill', label: 'Fill a bracket each year' },
  { value: 'flat', label: 'Same amount each year' },
]
const FILL = [
  { value: '12', label: 'Top of 12%' },
  { value: '22', label: 'Top of 22%' },
  { value: '24', label: 'Top of 24%' },
]
const END_AGE = ['85', '90', '95', '100'].map((v) => ({ value: v, label: v }))
const BENEFICIARY = ['12', '22', '24', '32', '35', '37'].map((v) => ({ value: v, label: `${v}%` }))
const YESNO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const BLANK = {
  birthYear: '',
  filing: 'married',
  endAge: '95',
  pretax: '',
  roth: '',
  taxable: '',
  wages: '',
  retireAge: '',
  ssAnnual: '',
  ssStartAge: '',
  pension: '',
  otherIncome: '',
  mode: 'fill',
  fillBracket: '24',
  fillUntilAge: '',
  flatAmount: '',
  flatYears: '',
  beneficiaryRate: '32',
  ret: '6',
  infl: '2.5',
  index: 'yes',
  state: 'NH',
}

// The accountant's RMD Planner case: single filer, 62 in 2026, $900k pre-tax.
const SAMPLE = {
  birthYear: String(TAX_YEAR - 62),
  filing: 'single',
  endAge: '95',
  pretax: '900000',
  roth: '0',
  taxable: '150000',
  wages: '0',
  retireAge: '62',
  ssAnnual: '50400',
  ssStartAge: '68',
  pension: '0',
  otherIncome: '4000',
  mode: 'fill',
  fillBracket: '22',
  fillUntilAge: '74',
  flatAmount: '75000',
  flatYears: '12',
  beneficiaryRate: '32',
  ret: '7',
  infl: '2',
  index: 'yes',
  state: 'NH',
}

const RATE_COLORS = { 0.1: '#c9d6e6', 0.12: '#9fb8d6', 0.22: '#5a93cf', 0.24: '#2f6099', 0.32: '#1d4576', 0.35: '#0f2440', 0.37: '#08162b' }

// Stacked columns: dollars of taxable income in each bracket, one column per year.
function BracketBars({ rows, height = 200 }) {
  const max = Math.max(1, ...rows.map((r) => r.taxable))
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]
  const anyConversion = rows.some((r) => r.conversion > 0)
  return (
    <div className="bracket-chart">
      <div className="bracket-cols" style={{ height }}>
        {rows.map((r) => (
          <div key={r.t} className="bracket-col" title={`${r.year} · age ${r.age} · taxable ${money(r.taxable)} · conversion ${money(r.conversion)} · tax ${money(r.tax)}`}>
            <div className="bracket-stack">
              {r.fill.map((f, k) => (
                <span key={k} style={{ height: `${(f.amount / max) * 100}%`, background: RATE_COLORS[f.rate] }} />
              ))}
              {r.conversion > 0 ? <i className="bracket-conv" /> : null}
            </div>
            {r.age % 5 === 0 || r.t === 0 ? <span className="bracket-age">{r.age}</span> : <span className="bracket-age" />}
          </div>
        ))}
      </div>
      <div className="bracket-legend">
        {rates.map((rate) => (
          <span key={rate}><i style={{ background: RATE_COLORS[rate] }} />{Math.round(rate * 100)}%</span>
        ))}
        {anyConversion ? <span><i className="bracket-conv-key" />conversion year</span> : null}
      </div>
    </div>
  )
}

export default function MultiYearProjection() {
  // ?sample=1 opens the page with the sample loaded (handy for screenshots and review links).
  const [form, setForm] = useState(() => (new URLSearchParams(window.location.search).get('sample') ? SAMPLE : BLANK))
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const st = getState(form.state)
  const birthYear = Math.round(toNumber(form.birthYear)) || TAX_YEAR - 63
  const startAge = TAX_YEAR - birthYear
  const rmdAge = rmdStartAge(birthYear)
  const inputs = useMemo(() => ({
    birthYear,
    filing: form.filing,
    endAge: Math.max(startAge + 1, Math.round(toNumber(form.endAge)) || 95),
    retireAge: Math.round(toNumber(form.retireAge)) || startAge,
    wages: toNumber(form.wages),
    ssAnnual: toNumber(form.ssAnnual),
    ssStartAge: Math.round(toNumber(form.ssStartAge)) || 67,
    pension: toNumber(form.pension),
    otherIncome: toNumber(form.otherIncome),
    pretax: toNumber(form.pretax),
    roth: toNumber(form.roth),
    taxable: toNumber(form.taxable),
    ret: toNumber(form.ret) / 100,
    infl: toNumber(form.infl) / 100,
    index: form.index !== 'no',
    stateRate: st.wage / 100,
    mode: form.mode,
    flatAmount: toNumber(form.flatAmount),
    flatYears: Math.round(toNumber(form.flatYears)) || 0,
    fillBracket: Math.round(toNumber(form.fillBracket)) || 24,
    fillUntilAge: Math.round(toNumber(form.fillUntilAge)) || rmdAge - 1,
    beneficiaryRate: toNumber(form.beneficiaryRate) / 100,
  }), [form, birthYear, startAge, rmdAge, st])

  const r = useMemo(() => computeMultiYear(inputs), [inputs])
  const { plan, none, thisYear } = r
  const hasPlan = form.mode !== 'none' && plan.totalConverted > 0
  const better = r.delta > 0

  const steps = useMemo(() => [
    { label: 'Ages and RMD start', formula: `born ${birthYear} → age ${startAge} in ${TAX_YEAR}; RMDs begin at ${rmdAge} (${birthYear >= 1960 ? 'born 1960 or later' : 'born 1951–1959'})`, result: `${startAge} → ${inputs.endAge}` },
    { label: 'Method', formula: `each year: income − standard deduction${inputs.index ? ` (indexed ${percent(inputs.infl * 100, 1)}/yr with the brackets)` : ' (flat)'} → tax by bracket; RMD = balance ÷ Uniform Lifetime divisor; Social Security taxed by the provisional-income test`, result: `${plan.years} years` },
    ...(hasPlan ? [{ label: 'Conversion rule', formula: form.mode === 'fill' ? `convert enough each year to reach the top of the ${form.fillBracket}% bracket, through age ${inputs.fillUntilAge}` : `convert ${money(inputs.flatAmount)} a year for ${inputs.flatYears} years`, result: `${money(plan.totalConverted)} converted in total` }] : []),
    ...plan.rows.filter((row) => row.conversion > 0 || row.rmd > 0).slice(0, 40).map((row) => ({
      label: `${row.year} · age ${row.age}`,
      formula: `${row.wages ? `wages ${money(row.wages)} + ` : ''}${row.rmd ? `RMD ${money(row.rmd)} + ` : ''}${row.conversion ? `conversion ${money(row.conversion)} + ` : ''}taxable SS ${money(row.taxableSS)}${row.pension ? ` + pension ${money(row.pension)}` : ''}${row.other ? ` + other ${money(row.other)}` : ''} − deduction ${money(row.std)}${row.senior ? ` − senior ${money(row.senior)}` : ''} = taxable ${money(row.taxable)} (${percent(row.marginal * 100, 0)})`,
      result: money(row.tax),
    })),
    ...(hasPlan ? [
      { label: `This year’s conversion (${TAX_YEAR})`, formula: `tax with conversion ${money(plan.rows[0].tax)} − tax without ${money(none.rows[0].tax)}`, result: `${money(thisYear.tax)} on ${money(thisYear.conversion)} · ${percent(thisYear.rate * 100, 1)} effective` },
      { label: 'Net into the Roth this year', formula: `${money(thisYear.conversion)} − tax withheld from the conversion ${money(plan.rows[0].withheld)}`, result: money(thisYear.netToRoth) },
      ...(thisYear.irmaaApplies ? [{ label: `IRMAA triggered in ${TAX_YEAR + 2}`, formula: `surcharge at MAGI ${money(plan.rows[0].agi)} − surcharge at ${money(none.rows[0].agi)} (annual, household)`, result: money(thisYear.irmaaLater) }] : []),
    ] : []),
    { label: 'Lifetime IRMAA · plan vs. do nothing', formula: 'Medicare surcharge each year from 65, set by MAGI two years earlier; paid from the taxable account', result: `${money(plan.lifetimeIrmaa)} vs. ${money(none.lifetimeIrmaa)}` },
    { label: 'Lifetime tax · plan vs. do nothing', formula: 'sum of every year, federal + state', result: `${money(plan.lifetimeTax)} vs. ${money(none.lifetimeTax)}` },
    { label: `Balances at ${inputs.endAge} · plan`, formula: 'pre-tax · Roth · taxable', result: `${money(plan.endPretax)} · ${money(plan.endRoth)} · ${money(plan.endSide)}` },
    { label: `Balances at ${inputs.endAge} · do nothing`, formula: 'pre-tax · Roth · taxable', result: `${money(none.endPretax)} · ${money(none.endRoth)} · ${money(none.endSide)}` },
    { label: 'Heirs’ tax on what is still pre-tax', formula: `pre-tax balance × beneficiary rate ${percent(inputs.beneficiaryRate * 100, 0)} (10-year rule)`, result: `${money(plan.heirsTax)} plan · ${money(none.heirsTax)} do nothing` },
    { label: `After-tax family wealth at ${inputs.endAge}`, formula: 'pre-tax × (1 − heirs’ rate) + Roth + taxable', result: `${money(plan.familyWealth)} plan · ${money(none.familyWealth)} do nothing` },
    { label: 'Difference', formula: 'plan − do nothing', result: money(r.delta) },
  ], [r, plan, none, thisYear, inputs, form.mode, form.fillBracket, birthYear, startAge, rmdAge, hasPlan])

  const ready = inputs.pretax > 0 && toNumber(form.birthYear) > 0
  const chartRows = plan.rows
  const label = hasPlan ? (form.mode === 'fill' ? `Fill to ${form.fillBracket}%` : 'Convert each year') : 'As entered'
  // Breakeven: the first age from which the plan's after-tax family wealth stays at or above
  // the do-nothing line through the end of the plan. If the plan ends behind, it is not reached.
  // wealth[i] is the end of year i-1 (wealth[0] is today), so wealth[i] pairs with rows[i-1].
  const breakevenAge = useMemo(() => {
    if (!hasPlan || r.delta <= 0) return null
    let lastBehind = 0
    for (let i = 1; i < plan.wealth.length; i++) {
      if (plan.wealth[i] < none.wealth[i]) lastBehind = i
    }
    const row = plan.rows[Math.min(lastBehind, plan.rows.length - 1)]
    return row ? row.age : null
  }, [hasPlan, r.delta, plan, none])
  const breakevenNote = breakevenAge
    ? `plan pulls ahead of doing nothing${breakevenAge - plan.startAge > 0 ? ` after ${breakevenAge - plan.startAge} year${breakevenAge - plan.startAge === 1 ? '' : 's'} and stays ahead` : ' immediately and stays ahead'}`
    : `do nothing is still ahead at ${inputs.endAge}`

  // The first conversion the plan actually makes. Wages can leave no bracket room until
  // retirement, so "this year's conversion" may be a later year; the screen and the
  // report then describe that year instead of printing zeros.
  const firstConv = useMemo(() => {
    if (!hasPlan) return null
    const k = plan.rows.findIndex((row) => row.conversion > 0)
    if (k <= 0) return { ...thisYear, t: 0, year: TAX_YEAR, age: plan.rows[0].age, irmaaYear: TAX_YEAR + 2 }
    const p = plan.rows[k]
    const n = none.rows[k]
    const p2 = plan.rows[k + 2]
    const n2 = none.rows[k + 2]
    const irmaaApplies = p.age + 2 >= 65
    return {
      t: k, year: p.year, age: p.age,
      conversion: p.conversion,
      tax: p.tax - n.tax,
      rate: (p.tax - n.tax) / p.conversion,
      netToRoth: Math.max(0, p.conversion - p.withheld),
      irmaaApplies,
      irmaaYear: p.year + 2,
      irmaaLater: irmaaApplies && p2 && n2 ? Math.max(0, p2.irmaa - n2.irmaa) : 0,
    }
  }, [hasPlan, plan, none, thisYear])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const filingLabel = form.filing === 'single' ? 'Single' : 'Married filing jointly'
  const metaLine = ready ? `Age ${startAge} to ${inputs.endAge} · ${form.filing === 'single' ? 'single' : 'MFJ'} · RMDs from ${rmdAge} · ${label}` : 'Enter a year of birth and a pre-tax balance'
  // Shared between the screen Note and the printed "Reading the result".
  const noteText = `The comparison that matters is the family’s after-tax wealth at the end of the plan, not the tax paid this year. Converting costs tax now at the client’s rate; not converting leaves a larger pre-tax balance that the heirs must empty within ten years at their rate, often while they are still working and in a higher bracket. Filling a bracket each year before RMDs begin is the usual sweet spot: the years between retirement and Social Security, and again before the RMD age, are where the low-bracket room lives. ${hasPlan ? 'Watch the two lines cross.' : 'Choose a conversion approach that converts something to add the plan line and see where the two cross.'}`

  // Shared between the screen Narrative and the printed "What this means".
  const narrative = ready ? (
    <>
      Born in {birthYear}, the client is {startAge} and must start RMDs at {rmdAge}.
      {' '}
      {hasPlan
        ? `${form.mode === 'fill' ? `Filling the ${form.fillBracket}% bracket each year through age ${inputs.fillUntilAge}` : `Converting ${money(inputs.flatAmount)} a year for ${inputs.flatYears} years`} moves ${money(plan.totalConverted)} to Roth and ${r.taxDelta >= 0 ? 'raises' : 'lowers'} lifetime tax by ${money(Math.abs(r.taxDelta))}, from ${money(none.lifetimeTax)} to ${money(plan.lifetimeTax)}${r.taxDelta < 0 ? ' — paying at today’s rate beats the RMDs that would come later' : ''}. In return, the pre-tax balance at ${inputs.endAge} falls from ${money(none.endPretax)} to ${money(plan.endPretax)}, so the heirs’ tax bill at ${percent(inputs.beneficiaryRate * 100, 0)} drops from ${money(none.heirsTax)} to ${money(plan.heirsTax)}. ${r.irmaaDelta > 0 ? `The plan also adds ${money(r.irmaaDelta)} of IRMAA over the years. ` : r.irmaaDelta < 0 ? `The plan also avoids ${money(-r.irmaaDelta)} of IRMAA over the years. ` : ''}After everyone’s tax, the family keeps ${money(plan.familyWealth)} with the plan against ${money(none.familyWealth)} doing nothing — ${better ? 'ahead' : 'behind'} by ${money(Math.abs(r.delta))}.`
        : `Doing nothing, RMDs begin at ${rmdAge} and lifetime tax through ${inputs.endAge} is ${money(none.lifetimeTax)}. The ${money(none.endPretax)} still pre-tax at ${inputs.endAge} would cost the heirs ${money(none.heirsTax)} at ${percent(inputs.beneficiaryRate * 100, 0)}, leaving the family ${money(none.familyWealth)}.`}
    </>
  ) : (
    'Enter the year of birth, the balances, and income. The plan compares Roth conversions against doing nothing, through the end of the plan and into the heirs’ hands.'
  )

  const assumptions = [
    `${TAX_YEAR} federal brackets, standard deduction, and senior deduction (65+, through 2028). With indexing on, brackets, deduction, Social Security, pension, and other income grow with inflation each year; with it off, the ${TAX_YEAR} tables are held flat.`,
    'RMDs begin at 73 for clients born 1951–1959 and 75 for those born 1960 or later, using the IRS Uniform Lifetime Table on the prior year-end balance. RMDs cannot be converted; conversions come on top of the RMD.',
    'Social Security is taxed through the provisional-income test each year; wages stop at the retirement age entered.',
    'Fill-a-bracket conversions are sized so taxable income reaches the top of the chosen bracket after Social Security taxation and the senior deduction phase-out, limited by the pre-tax balance.',
    `All accounts earn the same return; the taxable account is reduced by a ${percent(TAXABLE_DRAG * 100, 0)} tax drag. The tax the household owes without a conversion (on wages, pension, Social Security, and RMDs) and IRMAA are paid from the taxable account while it lasts and out of that income once it is empty — identically in both scenarios, so the taxable account never goes below zero. Only the extra tax a conversion causes is charged to the conversion: from the taxable account first, then withheld from the conversion itself (which reduces what reaches the Roth; the gross-up on withheld tax is not modeled).`,
    'The heirs’ tax applies the beneficiary rate to the pre-tax balance at the end of the plan, as if withdrawn under the 10-year rule; the growth during those ten years and the heirs’ own bracket creep are not modeled. Roth and taxable balances pass without income tax (the taxable account gets a basis step-up).',
    'IRMAA is applied from age 65 using the 2026 Part B and D surcharge tiers (indexed with inflation when indexing is on) against MAGI from two years earlier; the first two projection years use the current year’s MAGI as a proxy. It is paid from the taxable account while it lasts and counted in family wealth.',
    'Capital gains, itemized deductions, QCDs, and estate tax are not modeled. State tax is a simplified flat rate on taxable income.',
    'Baseline model. Not reviewed by Grott Luker & Co.',
  ]

  // ---- Print report (fixed Letter pages; replaces the screen layout when printing) ----
  const printInputs = [
    ['Year of birth', form.birthYear ? `${form.birthYear} (age ${startAge})` : '—'],
    ['Filing status', filingLabel],
    ['Project through age', String(inputs.endAge)],
    ['Pre-tax IRA / 401(k)', money(inputs.pretax)],
    ['Roth', money(inputs.roth)],
    ['Taxable / cash', money(inputs.taxable)],
    ['Wages until retirement', money(inputs.wages)],
    ['Retirement age', String(inputs.retireAge)],
    ['Social Security (annual, today’s $)', money(inputs.ssAnnual)],
    ['Social Security claiming age', String(inputs.ssStartAge)],
    ['Pension (annual)', money(inputs.pension)],
    ['Interest, dividends, other', money(inputs.otherIncome)],
    ['Roth conversions', (MODE.find((m) => m.value === form.mode) || {}).label || form.mode],
    ...(form.mode === 'fill' ? [['Fill to the top of', `${form.fillBracket}% bracket`], ['Convert through age', `${inputs.fillUntilAge}${inputs.fillUntilAge < startAge ? ' (past)' : ''}`]] : []),
    ...(form.mode === 'flat' ? [['Amount converted each year', money(inputs.flatAmount)], ['For how many years', `${inputs.flatYears} years`]] : []),
    ['Heirs’ tax bracket', percent(inputs.beneficiaryRate * 100, 0)],
    ['Annual return, all accounts', percent(inputs.ret * 100, 1)],
    ['Index brackets, deduction, benefits', inputs.index ? 'Yes' : 'No'],
    ['Inflation', `${percent(inputs.infl * 100, 1)} / yr`],
    ['State of residence', st.name],
  ]
  const signedDelta = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`
  // A chosen approach that converts nothing (convert-through age already past, or no bracket room) is said so
  // next to the inputs, because the rest of the report describes the do-nothing result.
  const inputsNote = form.mode !== 'none' && !hasPlan
    ? `nothing converted${form.mode === 'fill' && inputs.fillUntilAge < startAge ? ` — convert-through age ${inputs.fillUntilAge} is already past` : form.mode === 'fill' ? ' — no room below the top of the bracket' : ''}; the report shows doing nothing`
    : undefined
  const compareRows = [
    [`After-tax family wealth at ${inputs.endAge}`, money(none.familyWealth), money(plan.familyWealth)],
    ['Lifetime tax (federal + state)', money(none.lifetimeTax), money(plan.lifetimeTax)],
    ['Lifetime IRMAA', money(none.lifetimeIrmaa), money(plan.lifetimeIrmaa)],
    ['Converted in total', '—', money(plan.totalConverted)],
    [`Still pre-tax at ${inputs.endAge}`, money(none.endPretax), money(plan.endPretax)],
    [`Heirs’ tax at ${percent(inputs.beneficiaryRate * 100, 0)}`, money(none.heirsTax), money(plan.heirsTax)],
    [`Roth at ${inputs.endAge}`, money(none.endRoth), money(plan.endRoth)],
    [`Taxable account at ${inputs.endAge}`, money(none.endSide), money(plan.endSide)],
  ]
  // Marginal bracket reads '—' when nothing was taxed (the engine falls back to the lowest rate on $0 taxable income).
  const bracketOf = (row) => (row.taxable > 0.5 ? percent(row.marginal * 100, 0) : '—')
  // Page 3 budget, in table rows: ~40 rows plus the inputs block fit a compact page. Thin the year table
  // to every k-th year only beyond that; when the horizon is short, add the income build-up table
  // (≤ 17 years) and the year-end balance / wealth table (≤ 10 years) so the page stays useful.
  const YEAR_ROWS_CAP = 40
  const nYears = plan.rows.length
  const yearStep = Math.ceil(nYears / YEAR_ROWS_CAP)
  const yearRows = yearStep > 1 ? plan.rows.filter((row, i) => i % yearStep === 0 || i === nYears - 1) : plan.rows
  const showIncomeTable = nYears <= 17
  const showBalanceTable = nYears <= 10
  const convTint = (row) => (row.conversion > 0 ? 'is-tint' : '')
  const convTitle = firstConv ? (firstConv.t === 0 ? `This year’s conversion (${TAX_YEAR})` : `First conversion (${firstConv.year})`) : ''
  const convNote = firstConv ? (firstConv.t === 0 ? 'what converting costs now' : `age ${firstConv.age} · none in ${TAX_YEAR}: ${inputs.wages > 0 && firstConv.age >= inputs.retireAge ? 'wages fill the bracket until retirement' : 'no bracket room until then'}`) : ''
  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="Roth Conversion & RMD Projection"
          subtitle="This year’s conversion, then every year to the end of the plan — RMDs, Social Security, conversions, and what the heirs keep."
          meta={metaLine}
          metaRight={today}
        />
        <PrintFeature
          label={`After-tax family wealth at ${inputs.endAge} — ${hasPlan ? 'plan vs. do nothing' : 'as entered'}`}
          value={hasPlan ? `${r.delta >= 0 ? '+' : '−'}${money(Math.abs(r.delta))}` : money(none.familyWealth)}
          note={hasPlan ? `${money(plan.familyWealth)} with the plan · ${money(none.familyWealth)} doing nothing` : 'Choose a conversion approach to compare against doing nothing'}
        />
        <PrintTiles
          items={[
            { label: 'Lifetime tax paid', value: money(plan.lifetimeTax), note: hasPlan ? `vs. ${money(none.lifetimeTax)} doing nothing` : 'through the end of the plan' },
            { label: `Heirs’ tax at ${inputs.endAge}`, value: money(plan.heirsTax), note: hasPlan ? `vs. ${money(none.heirsTax)} doing nothing` : `${percent(inputs.beneficiaryRate * 100, 0)} on what is pre-tax` },
            { label: 'Converted in total', value: money(plan.totalConverted), note: hasPlan ? `Roth at ${inputs.endAge}: ${money(plan.endRoth)}` : 'no conversions' },
            // Marked best only when the plan ends ahead and stays ahead — the one winner on the page.
            ...(hasPlan ? [{ label: 'Breakeven', value: breakevenAge ? `Age ${breakevenAge}` : 'Not reached', best: !!breakevenAge, note: breakevenNote }] : []),
          ]}
        />
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        <PrintSection title="After-tax family wealth, year by year" note={`age ${startAge} to ${inputs.endAge}, after all tax including the heirs’`} className="pr-chart">
          <LineChart
            xStart={`Age ${startAge}`}
            xEnd={`Age ${inputs.endAge}`}
            series={[
              { label: 'Do nothing', color: TONE.cost, points: none.wealth },
              ...(hasPlan ? [{ label: label, color: TONE.net, points: plan.wealth }] : []),
            ]}
          />
        </PrintSection>
        <PrintFooter page={1} pages={3} />
      </PrintPage>
      <PrintPage compact>
        <PrintPageHead title="Roth Conversion & RMD Projection" right={today} />
        {hasPlan ? (
          <PrintCols>
            <PrintSection title={convTitle} note={convNote}>
              <PrintRows
                rows={[
                  { label: firstConv.t === 0 ? 'Converted this year' : `Converted in ${firstConv.year}`, value: money(firstConv.conversion) },
                  { label: 'Tax on the conversion (federal + state)', value: money(firstConv.tax), sub: true },
                  { label: 'Effective rate on the converted dollars', value: percent(firstConv.rate * 100, 1), sub: true },
                  { label: 'Net into the Roth after tax withheld', value: money(firstConv.netToRoth), sub: true },
                  ...(firstConv.irmaaApplies ? [{ label: `IRMAA it triggers in ${firstConv.irmaaYear} (per year, household)`, value: money(firstConv.irmaaLater), sub: true }] : []),
                  { label: 'Lifetime tax, plan vs. do nothing', value: signedDelta(r.taxDelta) },
                  { label: 'Lifetime IRMAA, plan vs. do nothing', value: signedDelta(r.irmaaDelta), sub: true },
                ]}
              />
            </PrintSection>
            <PrintSection title={`Do nothing vs. ${label}`} note={`at age ${inputs.endAge}`}>
              <PrintTable head={['', 'Do nothing', label]} widths={['44%', '28%', '28%']} align={['left', 'right', 'right']} rows={compareRows} rowClass={(row, i) => (i === 0 ? 'is-strong' : '')} />
            </PrintSection>
          </PrintCols>
        ) : (
          <PrintCols>
            <PrintSection title="Doing nothing — the numbers" note="through the end of the plan">
              <PrintRows
                rows={[
                  { label: 'Lifetime tax (federal + state)', value: money(none.lifetimeTax) },
                  { label: 'Lifetime IRMAA', value: money(none.lifetimeIrmaa), sub: true },
                  { label: `Still pre-tax at ${inputs.endAge}`, value: money(none.endPretax) },
                  { label: `Heirs’ tax at ${percent(inputs.beneficiaryRate * 100, 0)}`, value: money(none.heirsTax), sub: true },
                  { label: `After-tax family wealth at ${inputs.endAge}`, value: money(none.familyWealth), total: true },
                ]}
              />
            </PrintSection>
            <PrintSection title={`Balances at ${inputs.endAge}`} note="before the heirs’ tax">
              <PrintRows
                rows={[
                  { label: 'Pre-tax IRA / 401(k)', value: money(none.endPretax) },
                  { label: 'Roth', value: money(none.endRoth) },
                  { label: 'Taxable account', value: money(none.endSide) },
                  { label: `First RMD, age ${rmdAge}`, value: money((none.rows.find((row) => row.rmd > 0) || {}).rmd || 0), sub: true },
                ]}
              />
            </PrintSection>
          </PrintCols>
        )}
        <PrintSection title={`Taxable income by bracket, each year${hasPlan ? ' (with the plan)' : ''}`} note={hasPlan ? 'a dot above a column marks a conversion year' : `no conversions · RMDs begin at ${rmdAge}`} className="pr-chart">
          <BracketBars rows={chartRows} height={230} />
        </PrintSection>
        <PrintNote title="Reading the result">{noteText}</PrintNote>
        <PrintSection title="Assumptions">
          <PrintAssumptions items={assumptions} />
        </PrintSection>
        <PrintFooter page={2} pages={3} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="Roth Conversion & RMD Projection" right={today} />
        <PrintSection title={`Year by year, age ${startAge} to ${inputs.endAge}`} note={`${label}${yearStep > 1 ? ` · every ${yearStep === 2 ? 'other' : `${yearStep}th`} year shown` : ''}${hasPlan ? ' · conversion years shaded' : ''} · balances at year end`}>
          <PrintTable
            head={['Year', 'Age', 'RMD', 'Conversion', 'Taxable income', 'Bracket', 'Tax', 'IRMAA', 'Pre-tax', 'Roth']}
            widths={['8%', '7%', '11%', '11%', '13%', '8%', '11%', '9%', '11%', '11%']}
            align={['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']}
            rowClass={convTint}
            rows={yearRows.map((row) => [
              row.year,
              row.age,
              row.rmd ? money(row.rmd) : '—',
              row.conversion ? money(row.conversion) : '—',
              money(row.taxable),
              bracketOf(row),
              money(row.tax),
              row.irmaa ? money(row.irmaa) : '—',
              money(row.pretax),
              money(row.roth),
            ])}
          />
        </PrintSection>
        {showIncomeTable ? (
          <PrintSection title="How taxable income is built, each year" note={`${hasPlan ? 'with the plan · ' : ''}deductions = standard deduction${plan.rows.some((row) => row.senior > 0) ? ' + senior deduction' : ''}`}>
            <PrintTable
              head={['Year', 'Age', 'Wages', 'Taxable SS', 'Pension & other', 'RMD', 'Conversion', 'AGI', 'Deductions', 'Taxable income']}
              widths={['8%', '7%', '11%', '11%', '12%', '10%', '11%', '11%', '10%', '9%']}
              align={['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']}
              rowClass={convTint}
              rows={plan.rows.map((row) => [
                row.year,
                row.age,
                row.wages ? money(row.wages) : '—',
                row.taxableSS ? money(row.taxableSS) : '—',
                row.pension + row.other ? money(row.pension + row.other) : '—',
                row.rmd ? money(row.rmd) : '—',
                row.conversion ? money(row.conversion) : '—',
                money(row.agi),
                money(row.std + row.senior),
                money(row.taxable),
              ])}
            />
          </PrintSection>
        ) : null}
        {showBalanceTable ? (
          <PrintSection title="Year-end balances and what the family keeps" note={hasPlan ? `family wealth after the heirs’ tax at ${percent(inputs.beneficiaryRate * 100, 0)} · ${label} vs. doing nothing` : `heirs’ tax at ${percent(inputs.beneficiaryRate * 100, 0)} on the pre-tax balance`}>
            <PrintTable
              head={['Year', 'Age', 'Pre-tax', 'Roth', 'Taxable acct', 'Heirs’ tax', hasPlan ? 'Family wealth' : 'After-tax family wealth', ...(hasPlan ? ['Doing nothing', 'Plan ahead by'] : [])]}
              widths={hasPlan ? ['8%', '7%', '12%', '12%', '12%', '11%', '13%', '13%', '12%'] : ['10%', '9%', '16%', '16%', '16%', '14%', '19%']}
              align={['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right']}
              rowClass={convTint}
              rows={plan.rows.map((row, i) => [
                row.year,
                row.age,
                money(row.pretax),
                money(row.roth),
                money(row.side),
                money(row.pretax * inputs.beneficiaryRate),
                money(plan.wealth[i + 1]),
                ...(hasPlan ? [money(none.wealth[i + 1]), signedDelta(plan.wealth[i + 1] - none.wealth[i + 1])] : []),
              ])}
            />
          </PrintSection>
        ) : null}
        <PrintSection title="Inputs used in this estimate" note={inputsNote}>
          <PrintInputs items={printInputs} />
        </PrintSection>
        <PrintFooter page={3} pages={3} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="Roth Conversion & RMD Planner"
      subtitle="This year's conversion and the whole plan in one place: what converting costs now in tax and IRMAA, then year by year to the end — RMDs from the right age, Social Security, conversions that fill a bracket or run at a set amount, and what the client's heirs keep if you do nothing versus if you act."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="The client">
            <div className="field-row">
              <NumberField label="Year of birth" value={form.birthYear} onChange={set('birthYear')} hint={form.birthYear ? `Age ${startAge} in ${TAX_YEAR} · RMDs begin at ${rmdAge}` : 'Sets today’s age and the RMD start age (73 or 75).'} />
              <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            </div>
            <PillField label="Project through age" value={form.endAge} onChange={set('endAge')} options={END_AGE} info="The end of the plan. Whatever is still pre-tax at this point is taxed at the heirs’ rate below." />
          </Panel>
          <Panel title="Balances today">
            <MoneyField label="Pre-tax IRA / 401(k)" value={form.pretax} onChange={set('pretax')} />
            <div className="field-row">
              <MoneyField label="Roth" value={form.roth} onChange={set('roth')} />
              <MoneyField label="Taxable / cash" value={form.taxable} onChange={set('taxable')} info="Receives RMDs and pays the household’s tax and IRMAA while it lasts, plus the extra tax a conversion causes. Once it is empty, conversion tax is withheld from the conversion itself." />
            </div>
          </Panel>
          <Panel title="Income">
            <div className="field-row">
              <MoneyField label="Wages until retirement" value={form.wages} onChange={set('wages')} />
              <NumberField label="Retirement age" value={form.retireAge} onChange={set('retireAge')} suffix="yrs" />
            </div>
            <div className="field-row">
              <MoneyField label="Social Security (annual, today’s $)" value={form.ssAnnual} onChange={set('ssAnnual')} />
              <NumberField label="Claiming age" value={form.ssStartAge} onChange={set('ssStartAge')} suffix="yrs" />
            </div>
            <div className="field-row">
              <MoneyField label="Pension (annual)" value={form.pension} onChange={set('pension')} />
              <MoneyField label="Interest, dividends, other" value={form.otherIncome} onChange={set('otherIncome')} />
            </div>
          </Panel>
          <Panel title="The plan">
            <PillField label="Roth conversions" value={form.mode} onChange={set('mode')} options={MODE} />
            {form.mode === 'fill' ? (
              <div className="field-row">
                <PillField label="Fill to the" value={form.fillBracket} onChange={set('fillBracket')} options={FILL} info="Each year the conversion is sized so taxable income lands at the top of this bracket — the way an accountant fills the bracket by hand." />
                <NumberField label="Through age" value={form.fillUntilAge} onChange={set('fillUntilAge')} suffix="yrs" hint={`Default: the year before RMDs (${rmdAge - 1}).`} />
              </div>
            ) : null}
            {form.mode === 'flat' ? (
              <div className="field-row">
                <MoneyField label="Amount each year" value={form.flatAmount} onChange={set('flatAmount')} />
                <NumberField label="For how many years" value={form.flatYears} onChange={set('flatYears')} suffix="yrs" />
              </div>
            ) : null}
            <PillField label="Heirs’ tax bracket" value={form.beneficiaryRate} onChange={set('beneficiaryRate')} options={BENEFICIARY} info="Non-spouse beneficiaries must empty an inherited pre-tax IRA within 10 years and pay tax at their own rate. Roth passes tax-free. This rate is applied to whatever is still pre-tax at the end of the plan." />
          </Panel>
          <RefinePanel summary={`${form.ret}% return, ${form.index === 'no' ? 'no' : `${form.infl}%`} indexing, ${st.name}`}>
            <div className="field-row">
              <NumberField label="Annual return, all accounts" value={form.ret} onChange={set('ret')} suffix="%" info={`The taxable account earns ${percent((1 - TAXABLE_DRAG) * 100, 0)} of this after tax drag.`} />
              <SelectField label="State of residence" value={form.state} onChange={set('state')} options={STATES.map((s) => ({ value: s.code, label: s.name }))} info="Simplified flat rate on taxable income." />
            </div>
            <div className="field-row">
              <SegmentedField label="Index brackets, deduction, and benefits" value={form.index} onChange={set('index')} options={YESNO} info="Yes moves the brackets, standard deduction, Social Security, and other income with inflation each year. No holds the 2026 tables flat, which overstates bracket creep." />
              <NumberField label="Inflation" value={form.infl} onChange={set('infl')} suffix="% / yr" />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Multi-Year Projection"
              meta={metaLine}
              metaRight={today}
            />
            <FeatureBlock
              label={`After-tax family wealth at ${inputs.endAge} — ${hasPlan ? 'plan vs. do nothing' : 'as entered'}`}
              value={hasPlan ? `${r.delta >= 0 ? '+' : '−'}${money(Math.abs(r.delta))}` : money(none.familyWealth)}
              note={hasPlan ? `${money(plan.familyWealth)} with the plan · ${money(none.familyWealth)} doing nothing` : `Choose a conversion approach to compare against doing nothing`}
            />
            <StatTiles
              items={[
                { label: 'Lifetime tax paid', value: money(plan.lifetimeTax), note: hasPlan ? `vs. ${money(none.lifetimeTax)} doing nothing` : 'through the end of the plan' },
                { label: `Heirs’ tax at ${inputs.endAge}`, value: money(plan.heirsTax), tone: hasPlan && plan.heirsTax < none.heirsTax ? 'good' : undefined, note: hasPlan ? `vs. ${money(none.heirsTax)} doing nothing` : `${percent(inputs.beneficiaryRate * 100, 0)} on what is pre-tax` },
                { label: 'Converted in total', value: money(plan.totalConverted), note: hasPlan ? `Roth at ${inputs.endAge}: ${money(plan.endRoth)}` : 'no conversions' },
                ...(hasPlan ? [{ label: 'Breakeven', value: breakevenAge ? `Age ${breakevenAge}` : 'Not reached', tone: breakevenAge ? 'good' : 'bad', note: breakevenNote }] : []),
              ]}
            />

            {firstConv ? (
              <div className="result-list">
                <ResultRow label={firstConv.t === 0 ? `This year’s conversion (${TAX_YEAR})` : `First conversion (${firstConv.year}, age ${firstConv.age}): ${convNote}`} value={firstConv.conversion} />
                <ResultRow label="Tax on the conversion (federal + state)" value={firstConv.tax} negative sub />
                <ResultRow label="Effective rate on the converted dollars" raw={percent(firstConv.rate * 100, 1)} sub />
                <ResultRow label="Net into the Roth after tax withheld" value={firstConv.netToRoth} sub />
                {firstConv.irmaaApplies ? <ResultRow label={`IRMAA it triggers in ${firstConv.irmaaYear} (per year, household)`} value={firstConv.irmaaLater} negative={firstConv.irmaaLater > 0} sub /> : null}
              </div>
            ) : null}

            <Narrative>{narrative}</Narrative>

            <ScenarioCards
              sub={`at age ${inputs.endAge}, after all tax`}
              scenarios={[
                { label: 'Do nothing', value: money(none.familyWealth), best: hasPlan && !better, rows: [{ label: 'Lifetime tax', value: money(none.lifetimeTax) }, { label: 'Still pre-tax', value: money(none.endPretax) }, { label: 'Heirs’ tax', value: money(none.heirsTax) }, { label: 'IRMAA', value: money(none.lifetimeIrmaa) }, { label: 'Roth', value: money(none.endRoth) }] },
                { label: hasPlan ? label : 'With a plan', value: hasPlan ? money(plan.familyWealth) : '—', best: hasPlan && better, rows: [{ label: 'Lifetime tax', value: hasPlan ? money(plan.lifetimeTax) : '—' }, { label: 'Still pre-tax', value: hasPlan ? money(plan.endPretax) : '—' }, { label: 'Heirs’ tax', value: hasPlan ? money(plan.heirsTax) : '—' }, { label: 'IRMAA', value: hasPlan ? money(plan.lifetimeIrmaa) : '—' }, { label: 'Roth', value: hasPlan ? money(plan.endRoth) : '—' }] },
              ]}
            />

            <div className="chart-block">
              <div className="chart-title">After-tax family wealth, year by year</div>
              <LineChart
                xStart={`Age ${startAge}`}
                xEnd={`Age ${inputs.endAge}`}
                series={[
                  { label: 'Do nothing', color: TONE.cost, points: none.wealth },
                  ...(hasPlan ? [{ label: label, color: TONE.net, points: plan.wealth }] : []),
                ]}
              />
            </div>

            <div className="chart-block">
              <div className="chart-title">Taxable income by bracket, each year{hasPlan ? ' (with the plan)' : ''}</div>
              <BracketBars rows={chartRows} />
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ marginTop: 10 }}>
                <thead><tr><th>Year</th><th>Age</th><th className="num">RMD</th><th className="num">Conversion</th><th className="num">Taxable income</th><th className="num">Bracket</th><th className="num">Tax</th><th className="num">IRMAA</th><th className="num">Pre-tax</th><th className="num">Roth</th></tr></thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr key={row.t} className={row.conversion > 0 ? 'is-conv' : undefined}>
                      <td>{row.year}</td><td>{row.age}</td>
                      <td className="num">{row.rmd ? money(row.rmd) : '—'}</td>
                      <td className="num">{row.conversion ? money(row.conversion) : '—'}</td>
                      <td className="num">{money(row.taxable)}</td>
                      <td className="num">{bracketOf(row)}</td>
                      <td className="num">{money(row.tax)}</td>
                      <td className="num">{row.irmaa ? money(row.irmaa) : '—'}</td>
                      <td className="num">{money(row.pretax)}</td>
                      <td className="num">{money(row.roth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the result">{noteText}</Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
