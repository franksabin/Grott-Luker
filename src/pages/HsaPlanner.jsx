import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  PillField,
  SelectField,
  RefinePanel,
  StatTiles,
  ScenarioCards,
  ResultRow,
  Assumptions,
  Note,
  DisclosureBox,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, LineChart, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, percent } from '../lib/format.js'
import { TAX_YEAR, SS_WAGE_BASE } from '../lib/tax.js'
import { STATES } from '../lib/states.js'
import { computeHsa as compute, hsaFlags, ficaExplain, parseAmount, plural, HSA, DEFAULTS, RETIREE_HEALTH } from '../lib/hsa.js'

const COVERAGE = [
  { value: 'self', label: 'Self-only' },
  { value: 'family', label: 'Family' },
]
const YES_NO_PLAN = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]
const MEDICARE = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]
const FUNDING = [
  { value: 'payroll', label: 'Payroll deduction at work' },
  { value: 'return', label: 'On my own, deducted on my return' },
]
const DEC1 = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]
const BRACKET = [
  { value: '10', label: '10%' },
  { value: '12', label: '12%' },
  { value: '22', label: '22%' },
  { value: '24', label: '24%' },
  { value: '32', label: '32%' },
  { value: '35', label: '35%' },
  { value: '37', label: '37%' },
]

// The two ways of using the account, named the same way everywhere.
const OPT_A = 'Pay from the account'
const OPT_B = 'Pay from your pocket, keep receipts'

const BLANK = {
  coverage: 'self',
  age: '',
  spouseAge: '',
  plan: 'yes',
  medicare: 'no',
  funding: 'payroll',
  wages: '',
  employer: '',
  amount: '',
  bracket: '24',
  state: 'NH',
  months: '',
  dec1: 'no',
  balance: '',
  ...DEFAULTS,
}
const SAMPLE = {
  ...BLANK,
  coverage: 'family',
  age: '45',
  spouseAge: '43',
  wages: '140000',
  employer: '1000',
  balance: '5000',
  spend: '3000',
}

// ?sample=1 wins (ToolShell also applies it); in dev, ?state=<base64 JSON> merges over BLANK (a test hook, dead code in a production build).
function initialForm() {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('sample')) return SAMPLE
    if (import.meta.env.DEV) {
      const st = q.get('state')
      if (st) {
        const o = JSON.parse(atob(st.replace(/ /g, '+')))
        const merged = { ...BLANK }
        Object.keys(o).forEach((k) => { merged[k] = typeof o[k] === 'number' ? String(o[k]) : o[k] })
        return merged
      }
    }
  } catch (e) {
    // fall through to blank
  }
  return BLANK
}

// Projections run decades at one steady rate, so show them to the nearest $100.
const aboutN = (v) => Math.round(v / 100) * 100
const about = (v) => money(aboutN(v))
// 0.06 → "6%", 0.025 → "2.5%".
const pct = (v) => `${+(v * 100).toFixed(2)}%`
const axisMoney = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : money(v))
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const typed = (v) => String(v ?? '').trim() !== ''
// A typed value with no digit in it is read as blank or 0; say so beside the field instead of doing it silently.
const unread = (v) => (typed(v) && !/\d/.test(String(v)) ? `Could not read “${String(v).trim()}”, so it counts as blank or $0.` : undefined)

export default function HsaPlanner() {
  const [form, setForm] = useState(initialForm)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const flags = useMemo(() => hsaFlags(r), [r])
  const p = r.projection
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const hasBills = !!p && p.spend > 0
  const ready = r.eligible && r.age >= 18 // a printed report needs an age; without one it would be a draft passed off as finished
  const blocks = flags.filter((w) => w.level === 'block')
  const warns = flags.filter((w) => w.level === 'warn')
  const infos = flags.filter((w) => w.level === 'info')
  const coverageLabel = r.family ? 'Family coverage' : 'Self-only coverage'
  const stateLine = r.stateConforms ? (r.stateRate ? `${+(r.stateRate * 100).toFixed(2)}% ${r.stateName}` : `no ${r.stateName} income tax`) : `${r.stateName} gives no deduction`
  const headline = r.eligible ? money(r.taxSaved) : 'Not eligible'
  const featureNote = r.eligible
    ? [`on ${money(r.contribution)} put in`, `${percent(r.fed * 100, 0)} federal`, stateLine, r.payroll ? (r.ficaSaved > 0 ? 'plus payroll tax' : '') : 'no payroll-tax saving'].filter(Boolean).join(' · ')
    : 'See the Not eligible note under Coverage'
  const perDollar = r.contribution > 0 ? r.taxSaved / r.contribution : 0
  const costAfterTax = Math.max(0, r.contribution - r.taxSaved)
  // Why there is no projection, in the words the form itself uses (a blank retirement age is not "chosen" by the client).
  const noProjection = r.eligible && !p
    ? r.age < 18
      ? 'Shown once an age is entered.'
      : r.years < 1
        ? typed(form.retireAge)
          ? `Retire at age (${r.retireAge}) has to be after your age (${r.age}); change “Retire at age” to see the projection.`
          : `Enter a retirement age after your age (${r.age}) to see the projection.`
        : 'Nothing is being put in and there is no balance yet, so there is nothing to project.'
    : null
  const noProjectionPrint = r.years < 1
    ? typed(form.retireAge)
      ? `Retire at age (${r.retireAge}) is not after the current age (${r.age}), so no projection to retirement is shown.`
      : `No retirement age after the current age (${r.age}) was entered, so no projection to retirement is shown.`
    : 'Nothing is being put in and there is no balance, so no projection to retirement is shown.'

  // What a typed value became after the limits: shown beside the field so the screen and the print never disagree quietly.
  const retireHint = typed(form.retireAge) && parseAmount(form.retireAge) !== r.retireAge ? `Used ${r.retireAge} (allowed 50–80).` : undefined
  const growthHint = typed(form.growth) && Math.abs(parseAmount(form.growth) - r.growth * 100) > 1e-9 ? `Used ${pct(r.growth)} (allowed −10% to 20%).` : undefined
  const monthsHint = typed(form.months) && parseAmount(form.months) !== r.months ? `Used ${r.months} (allowed 1–12).` : undefined
  const ageHint = typed(form.age) && r.age > 0 && parseAmount(form.age) !== r.age ? `Used ${r.age} (whole years).` : undefined

  // One sentence about when deposits stop, used on the screen and in the printed assumptions, so it can never contradict the tiles.
  const depositNote = !p
    ? `Deposits stop at ${HSA.medicareAge}, when most people enroll in Medicare.`
    : p.endsThisYear
      ? 'Only this year’s deposit is assumed, because eligibility ended before December 1.'
      : r.age >= HSA.medicareAge
        ? `Deposits continue to age ${p.retireAge}, assuming you stay out of Medicare; they must stop once you enroll.`
        : p.depositYears < p.years
          ? `Deposits stop at ${HSA.medicareAge}, when most people enroll in Medicare and lose eligibility.`
          : `Deposits run to age ${p.retireAge}.`
  const keptUp = p ? (p.depositYears > 1 ? `Kept up for ${plural(p.depositYears, 'year')} at ${pct(p.growth)}` : `With only this year’s deposit, grown at ${pct(p.growth)}`) : ''
  // "federal, state and payroll tax": only the kinds of tax that were actually saved.
  const taxParts = ['federal', r.stateSaved > 0 && 'state', r.ficaSaved > 0 && 'payroll'].filter(Boolean)
  const taxKinds = `${taxParts.length > 1 ? `${taxParts.slice(0, -1).join(', ')} and ${taxParts[taxParts.length - 1]}` : taxParts[0]} tax`

  const depositText = (q) => (q.depositYears < 1 ? 'no deposits' : `${money(q.yearly)} a year for ${plural(q.depositYears, 'year')}`)

  const steps = useMemo(() => {
    if (!r.eligible) return [{ label: 'Not eligible', formula: 'No qualifying plan, or enrolled in Medicare: nothing can be contributed', result: '$0' }]
    const core = `${money(r.baseLimit)} ${r.family ? 'family' : 'self-only'}${r.catchUps ? ` + ${r.catchUps} × ${money(HSA.catchUp)} catch-up (age ${HSA.catchUpAge}+)` : ''}`
    const out = [
      { label: `${TAX_YEAR} maximum`, formula: r.prorated ? `(${core}) × ${r.months}/12 months` : core, result: money(r.limit, 2) },
      { label: 'Room for your own contribution', formula: `${money(r.limit, 2)} − ${money(r.employerCounted, 2)} from the employer${r.employerExcess >= 0.5 ? ` (the employer’s ${money(r.employer, 2)} is over the limit; only the limit counts)` : ''}`, result: money(r.room, 2) },
      { label: 'Your contribution', formula: typed(form.amount) ? `the lesser of ${money(r.asked, 2)} entered and ${money(r.room, 2)} of room` : 'the room, since no amount was entered', result: money(r.contribution, 2) },
      { label: 'Federal income tax saved', formula: `${money(r.contribution, 2)} × ${percent(r.fed * 100, 0)}`, result: money(r.fedSaved, 2) },
      { label: `${r.stateName} income tax saved`, formula: r.stateConforms ? `${money(r.contribution, 2)} × ${+(r.stateRate * 100).toFixed(2)}%` : `${r.stateName} does not follow the federal deduction`, result: money(r.stateSaved, 2) },
      { label: 'Social Security & Medicare tax avoided', formula: ficaExplain(r), result: money(r.ficaSaved, 2) },
      { label: 'Tax saved this year', formula: 'federal + state + payroll tax', result: money(r.taxSaved, 2) },
      { label: 'Your cost after tax', formula: `${money(r.contribution, 2)} − ${money(r.taxSaved, 2)}`, result: money(costAfterTax, 2) },
    ]
    if (p) {
      out.push(
        {
          label: `Account at ${p.retireAge} · ${OPT_B}`,
          formula: `${money(p.balance0)} now, plus ${depositText(p)}, deposited at each year’s end, grown ${pct(p.growth)} a year over ${plural(p.years, 'year')}`,
          result: money(p.investBalance),
        },
        {
          label: `Account at ${p.retireAge} · ${OPT_A}`,
          formula: `the same deposits, less the bills it pays: ${money(p.aPaid)} of ${money(p.bank)} (${money(p.spend)} a year)${p.aOut > 0.5 ? `; it runs dry, so you pay the other ${money(p.aOut)}` : ''}`,
          result: money(p.spendBalance),
        },
        { label: 'Receipts you could reimburse tax free', formula: `${money(p.spend)} a year × ${plural(p.years, 'year')} of bills paid from your pocket${p.reimbursable < p.bank ? ', limited to the balance' : ''}`, result: money(p.reimbursable) },
      )
    }
    return out
  }, [r, form.amount, p, costAfterTax])

  const assumptions = [
    `${TAX_YEAR} limits (IRS Rev. Proc. 2025-19): ${money(HSA.self)} self-only, ${money(HSA.family)} family, plus ${money(HSA.catchUp)} for each spouse aged ${HSA.catchUpAge} or older, in that spouse’s own HSA. Employer money counts toward the limit (both employers’, for a couple). Part-year: 1/12 a month, unless eligible on December 1 (the full amount, with a testing period to the end of next year).`,
    `Tax saved: the contribution × the federal bracket, plus one flat state rate (representative, often the top rate; none for California and New Jersey), plus 7.65% payroll tax for a payroll deduction (the 6.2% only below the ${money(SS_WAGE_BASE)} wage base). Not modeled: the 0.9% Additional Medicare Tax, state tax on earnings, effects on other tax benefits.`,
    `Projection: this year’s amount deposited at each year-end, with no limit increases and no catch-up added at 55, at one steady growth rate with no fees or down years: a what-if. ${depositNote} Bills are a flat yearly amount; retirement spending is not modeled.`,
    '“Pay from your pocket” means paying qualified bills from other money and keeping the receipts. That cash is a real cost today, and the comparison does not credit what it could earn elsewhere.',
    'Qualified medical spending is tax free at any age; other withdrawals are taxed as income, plus a 20% penalty before 65. This tool does not compare a high-deductible plan with other plans.',
  ]
  const typedAmount = typed(form.amount)
  const inputs = [
    ['Coverage', coverageLabel],
    ['Age', r.age >= 18 ? String(r.age) : '—'],
    ...(r.family ? [['Spouse’s age', r.spouseAge ? String(r.spouseAge) : 'not entered']] : []),
    ['Contribution method', r.payroll ? `payroll deduction${r.wagesTyped ? ` · pay ${money(r.wages)}` : ` · pay not entered, taken as under ${money(SS_WAGE_BASE)}`}` : 'deducted on the tax return'],
    ['Employer contribution', money(r.employer)],
    ['Your contribution', typedAmount ? (r.asked > r.contribution + 0.5 ? `${money(r.asked)} entered, limited to ${money(r.contribution)}` : money(r.asked)) : 'the maximum'],
    ['Federal bracket · state', `${percent(r.fed * 100, 0)} · ${r.stateName}`],
    ...(r.months < 12 ? [['Months eligible', `${r.months}${r.lastMonth ? ' · eligible on December 1' : ''}`]] : []),
    ['Balance now', money(r.balance0)],
    ['Retire at · growth', `${r.retireAge} · ${pct(r.growth)} a year`],
    ['Medical bills a year', money(r.spend)],
  ]

  const rows = (
    <>
      <ResultRow label={`${TAX_YEAR} maximum${r.catchAmount ? ` (includes ${money(r.catchAmount)} of catch-up)` : ''}${r.prorated ? ` · ${plural(r.months, 'month')}` : ''}`} value={r.limit} />
      {r.employerCounted > 0 ? <ResultRow label="Employer contribution" value={-r.employerCounted || 0} negative sub /> : null}
      <ResultRow label="Room for your own contribution" value={r.room} sub />
      <ResultRow label="Your contribution" value={r.contribution} total />
      <ResultRow label="Federal income tax saved" value={r.fedSaved} positive sub />
      <ResultRow label={r.stateConforms ? `${r.stateName} income tax saved` : `${r.stateName} income tax saved (no deduction)`} value={r.stateSaved} positive={r.stateSaved > 0} sub />
      {r.payroll ? <ResultRow label="Social Security & Medicare tax avoided" value={r.ficaSaved} positive sub /> : null}
      <ResultRow label="Tax saved this year" value={r.taxSaved} total positive={r.taxSaved > 0} />
      <ResultRow label="Your cost after tax" value={costAfterTax} sub />
    </>
  )

  // The comparison, in words: what paying from your pocket costs, what the account ends up with, and which part of the difference is new.
  // The two rounded balances are what the client sees, so the difference is taken between them.
  const ownR = p ? aboutN(p.aPaid) : 0
  const extraR = p ? aboutN(p.investBalance) - aboutN(p.spendBalance) : 0
  const growthTail = r.stateConforms ? '' : r.stateCode === 'CA' ? ' (California taxes it each year)' : ` (${r.stateName} may tax it)`
  const growthClause = !p
    ? ''
    : Math.abs(p.gain) < 0.5
      ? 'none of it is growth'
      : p.gain > 0
        ? `about ${money(Math.max(0, extraR - ownR))} is growth, which stays out of federal tax when it pays medical costs${growthTail}`
        : `growth takes away about ${money(Math.max(0, ownR - extraR))} because the return is negative`
  const compareText = hasBills
    ? `Paying from your pocket costs ${money(p.aPaid)} more of your own money over ${plural(p.years, 'year')}. The account ends about ${money(Math.max(0, extraR))} larger: about ${money(ownR)} is your own money, which the receipts let you take back tax free, and ${growthClause}. ${p.gain > 0.5 ? 'That growth is the benefit, so paying from your pocket only makes sense if you can comfortably afford the bills.' : 'At this growth rate paying from your pocket adds nothing.'} It does not credit what that cash could earn elsewhere.${p.aOut > 0.5 ? ` The account runs dry, so even then you pay ${money(p.aOut)} of bills yourself.` : ''}`
    : null

  const narrative = r.eligible ? (
    <>
      {coverageLabel} allows up to {money(r.limit)} for {TAX_YEAR}{r.catchAmount ? `, including ${money(r.catchAmount)} of catch-up` : ''}{r.prorated ? `, prorated for ${plural(r.months, 'month')}` : ''}.
      {r.employerCounted ? ` The employer adds ${money(r.employerCounted)}, which leaves ${money(r.room)} for you.` : ''}
      {r.contribution > 0
        ? ` Putting in ${money(r.contribution)} saves about ${money(r.taxSaved)} in tax this year (${money(r.fedSaved)} federal${r.stateSaved ? `, ${money(r.stateSaved)} state` : ''}${r.payroll ? `, and ${money(r.ficaSaved)} in Social Security and Medicare tax avoided through payroll` : ''}), or about ${percent(perDollar * 100, 0)} of every dollar.`
        : ' No contribution of your own is included, so there is no tax saving to show.'}
      {p
        ? hasBills
          ? ` ${keptUp}, the account could reach about ${about(p.investBalance)} by age ${p.retireAge} if you pay medical bills from your pocket and use the receipts later, or about ${about(p.spendBalance)} if the account pays them as they come${p.aOut > 0.5 ? ` (it runs out of money, so you still pay ${money(p.aOut)} yourself)` : ''}.`
          : ` ${keptUp}, the account could reach about ${about(p.investBalance)} by age ${p.retireAge}.`
        : ''}
    </>
  ) : r.medicare ? (
    'Medicare enrollment ends the right to contribute, so there is no saving to show. The balance already in the account stays yours, and no projection is shown while contributions are not possible.'
  ) : (
    'Without a qualifying high-deductible plan there is nothing to contribute, so there is no saving to show, and no projection while contributions are not possible.'
  )

  const lineSeries = p
    ? [
        { label: hasBills ? OPT_B : 'Account', color: TONE.net, points: p.investBalances },
        ...(hasBills ? [{ label: OPT_A, color: TONE.accent, points: p.spendBalances }] : []),
        { label: 'Total put in', color: TONE.cost, points: p.putInSeries },
      ]
    : []
  const lineChart = p ? <LineChart xStart={`Age ${p.age}`} xEnd={`Age ${p.retireAge}`} format={axisMoney} series={lineSeries} /> : null
  const costChart = (
    <BarCompare
      height={230}
      groups={[
        {
          label: `${money(r.contribution)} into the HSA`,
          bars: [
            { label: 'Put in', value: r.contribution, color: TONE.cost },
            { label: 'Tax saved', value: r.taxSaved, color: TONE.net },
            { label: 'Cost after tax', value: costAfterTax, color: TONE.navy },
          ],
        },
      ]}
    />
  )

  const receiptsText = `${hasBills
    ? `Paying the ${money(p.spend)} a year from your pocket puts ${money(p.bank)} of receipts in a folder, and with no deadline ${p.reimbursable >= p.bank - 0.005 ? money(p.bank) : about(p.reimbursable)} of it could come out of the account tax free at retirement, or any time cash is needed.`
    : 'Pay a qualified medical bill from other money and keep the receipt, and the account can repay you tax free at any time later, even decades on.'} A bill counts if it came after the account was opened and funded, insurance did not pay it, you did not deduct it on Schedule A, and you keep the receipt or insurer statement (date, amount, what it was for).`
  const inheritText = 'A spouse named as beneficiary takes the account over with no tax (being an heir under a will is not enough). Anyone else is taxed on the whole balance as ordinary income in the year of death, less the owner’s earlier medical bills the beneficiary pays within a year; an estate gets no such reduction and reports the whole balance on the owner’s final return. Beneficiaries get no credit for old receipts, so reimburse yourself while you can. From 65 the account can also pay Medicare Part B, D and Advantage premiums (not Medigap).'
  const eligibilityText = `Eligibility is assumed, not tested: a qualifying high-deductible plan (${TAX_YEAR}: deductible of at least ${money(HSA.minDeductible.self)} self-only, ${money(HSA.minDeductible.family)} family) or exchange bronze or catastrophic plan, no Medicare, no other disqualifying coverage (a general-purpose health FSA, even a spouse’s; a direct primary care arrangement over ${money(HSA.dpcCap.one)} a month, ${money(HSA.dpcCap.more)} for more than one person), and no one else able to claim you as a dependent.`

  const putInNote = p
    ? `you and your employer${p.balance0 ? `, plus ${money(p.balance0)} already there` : ''}`
    : ''
  const projectionTiles = p
    ? [
        { label: 'Total put in', value: money(p.putIn), note: putInNote },
        { label: `Account at ${p.retireAge}`, value: about(p.investBalance), note: hasBills ? `after ${money(p.bank)} of bills you pay` : `${pct(p.growth)} a year` },
        { label: 'Tax saved over the years', value: about(p.taxSavedOverTime), tone: 'good', note: p.depositYears > 1 ? `${money(r.taxSaved)} a year at today’s rates` : 'this year only' },
      ]
    : []
  const strategyRows = hasBills
    ? [
        {
          label: OPT_A,
          value: about(p.spendBalance),
          sub: `account at ${p.retireAge}`,
          rows: [
            { label: 'Total put in', value: money(p.putIn) },
            { label: 'Bills the account paid', value: money(p.aPaid) },
            { label: 'Bills you still pay', value: money(p.aOut) },
          ],
        },
        {
          label: OPT_B,
          value: about(p.investBalance),
          sub: `account at ${p.retireAge}`,
          rows: [
            { label: 'Total put in', value: money(p.putIn) },
            { label: 'Bills you pay from your pocket', value: money(p.bank) },
            { label: 'Reimbursable tax free', value: p.reimbursable >= p.investBalance - 0.005 ? about(p.reimbursable) : money(p.reimbursable) },
          ],
        },
      ]
    : []

  // The typed-amount warning stays on the screen: the printed inputs already say "entered, limited to". The employer-excess one prints.
  const printInfos = [...warns.filter((w) => w.id === 'employer-excess'), ...infos].filter((w) => w.print !== false)
  // One note with short paragraphs: four separate boxed notes would not leave room on a two-page report.
  const line = { marginTop: 4 }
  const printNotes = (
    <PrintNote title="Worth knowing">
      {printInfos.map((w, i) => (
        <div key={w.id} style={i ? line : undefined}>{w.text}</div>
      ))}
      <div style={printInfos.length ? line : undefined}><b>Receipts.</b> {receiptsText}</div>
      <div style={line}><b>Inheritance.</b> {inheritText}</div>
      <div style={line}>{eligibilityText}</div>
    </PrintNote>
  )
  const limitsSection = (
    <PrintSection title={`${TAX_YEAR} limits and rules`}>
      <PrintTable
        head={['', 'Self-only', 'Family']}
        widths={['44%', '28%', '28%']}
        align={['left', 'right', 'right']}
        rows={[
          ['Contribution limit', money(HSA.self), money(HSA.family)],
          ['Catch-up, age 55 and over (each spouse’s own HSA)', money(HSA.catchUp), money(HSA.catchUp)],
          ['Plan minimum deductible', money(HSA.minDeductible.self), money(HSA.minDeductible.family)],
          ['Plan maximum out-of-pocket', money(HSA.maxOutOfPocket.self), money(HSA.maxOutOfPocket.family)],
        ]}
      />
    </PrintSection>
  )
  const printInputsCols = (
    <PrintCols>
      <PrintSection title="Inputs used in this estimate">
        <PrintInputs items={p ? inputs : inputs.filter(([k]) => !['Balance now', 'Retire at · growth', 'Medical bills a year'].includes(k))} />
      </PrintSection>
      <PrintSection title="Assumptions">
        <PrintAssumptions items={p ? assumptions : [assumptions[0], assumptions[1], assumptions[4]]} />
      </PrintSection>
    </PrintCols>
  )
  const printReport = ready ? (
    <PrintDoc>
      <PrintPage compact>
        <PrintBand
          title="HSA Savings Plan"
          subtitle="The most you can put in this year, the tax it saves, and what the account can become."
          meta={`${coverageLabel} · age ${r.age} · ${TAX_YEAR} limits`}
          metaRight={today}
        />
        <PrintFeature label="Tax saved this year" value={headline} note={featureNote} />
        <PrintTiles
          items={[
            { label: `${TAX_YEAR} maximum`, value: money(r.limit), note: r.catchAmount ? `includes ${money(r.catchAmount)} of catch-up` : r.prorated ? `${r.months} of 12 months` : 'no catch-up' },
            { label: 'You put in', value: money(r.contribution), note: r.employerCounted ? `employer adds ${money(r.employerCounted)}` : 'no employer contribution', best: true },
            { label: 'Saved per dollar', value: percent(perDollar * 100, 0), note: taxKinds },
            ...(p ? [{ label: `Account at ${p.retireAge}`, value: about(p.investBalance), note: hasBills ? `after ${money(p.bank)} of bills you pay` : `${pct(p.growth)} a year` }] : []),
          ]}
        />
        <PrintSection title="Where the saving comes from" note="this tax year">
          <PrintRows
            rows={[
              { label: `Your contribution (${TAX_YEAR} maximum ${money(r.limit)}${r.employerCounted > 0 ? `, less ${money(r.employerCounted)} from the employer` : ''})`, value: money(r.contribution) },
              { label: 'Federal income tax saved', value: money(r.fedSaved), sub: true },
              { label: r.stateConforms ? `${r.stateName} income tax saved` : `${r.stateName} income tax saved (no deduction)`, value: money(r.stateSaved), sub: true },
              ...(r.payroll ? [{ label: 'Social Security & Medicare tax avoided', value: money(r.ficaSaved), sub: true }] : []),
              { label: 'Tax saved this year', value: money(r.taxSaved), total: true },
              { label: 'Your cost after tax', value: money(costAfterTax), sub: true },
            ]}
          />
        </PrintSection>
        {p ? (
          <PrintSection title="The account to retirement" note={hasBills ? `${pct(p.growth)} a year · ${money(p.spend)} of bills a year · not a forecast` : `${pct(p.growth)} a year · not a forecast`} className="pr-chart">
            {lineChart}
          </PrintSection>
        ) : (
          <PrintSection title="What the contribution costs after tax" note="this tax year" className="pr-chart">
            {costChart}
            <PrintProse>{noProjectionPrint}</PrintProse>
          </PrintSection>
        )}
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="HSA Savings Plan" right={today} />
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        {hasBills ? (
          <PrintSection title="Two ways to use the account" note={`${pct(p.growth)} a year, retire at ${p.retireAge}`}>
            <PrintTable
              head={['', `Account at ${p.retireAge}`, 'Bills you pay from your pocket']}
              widths={['46%', '24%', '30%']}
              align={['left', 'right', 'right']}
              rows={[
                [OPT_A, about(p.spendBalance), money(p.aOut)],
                [OPT_B, about(p.investBalance), money(p.bank)],
              ]}
            />
            <PrintProse>{compareText}</PrintProse>
          </PrintSection>
        ) : null}
        {p ? null : limitsSection}
        {printNotes}
        {printInputsCols}
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  ) : (
    <PrintDoc>
      <PrintPage last compact>
        <PrintBand
          title="HSA Savings Plan"
          subtitle="The most you can put in this year, the tax it saves, and what the account can become."
          meta={`${coverageLabel} · ${TAX_YEAR} limits${r.eligible ? ' · estimate not complete' : ''}`}
          metaRight={today}
        />
        <PrintFeature label="Tax saved this year" value={r.eligible ? '—' : 'Not eligible'} note={r.eligible ? 'Estimate not complete' : 'Not eligible to contribute'} />
        <PrintNote title={r.eligible ? 'Estimate not complete' : 'Not eligible'}>
          {r.eligible
            ? 'An age of 18 or older is needed to apply the age-55 catch-up and to project the account, so this page shows the limits only.'
            : blocks.map((w) => cap(w.text.replace(/^Not eligible: /, ''))).join(' ')}
        </PrintNote>
        {limitsSection}
        <PrintCols>
          <PrintSection title="What was entered">
            <PrintInputs
              items={[
                ['Coverage', coverageLabel],
                ['Age', r.age >= 18 ? String(r.age) : r.age > 0 ? `${r.age} (under 18)` : 'not entered'],
                ...(r.family ? [['Spouse’s age', r.spouseAge ? String(r.spouseAge) : 'not entered']] : []),
                ['Qualifying high-deductible plan', r.noPlan ? 'No' : 'Yes'],
                ['Enrolled in Medicare', r.medicare ? 'Yes' : 'No'],
              ]}
            />
          </PrintSection>
          <PrintSection title="Assumptions">
            <PrintAssumptions items={[assumptions[0], assumptions[4]]} />
          </PrintSection>
        </PrintCols>
        <PrintFooter page={1} pages={1} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="How Much Can I Save in an HSA?"
      subtitle="The most you can put in this year, the tax it saves, and what the account could grow to, whether it pays your medical bills or you pay them yourself and keep the receipts."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Coverage">
            <PillField label="Health plan covers" value={form.coverage} onChange={set('coverage')} options={COVERAGE} info="Family means the plan covers anyone besides you, a child included. The family limit is one amount shared between spouses: if you and your spouse are both eligible and either of you has family coverage, choose Family, and one family limit applies to you both. If your coverage changed during the year, enter what it is on December 1; the full limit for that coverage applies if you stay eligible through the end of next year, otherwise the difference becomes income plus a 10% tax. Check with your CPA." />
            <div className="field-row">
              <NumberField label="Your age" value={form.age} onChange={set('age')} suffix="yrs" placeholder="—" hint={ageHint || unread(form.age)} info={`Age at the end of the year. At ${HSA.catchUpAge} or older you can add ${money(HSA.catchUp)}.`} />
              {r.family ? (
                <NumberField label="Spouse’s age" value={form.spouseAge} onChange={set('spouseAge')} suffix="yrs" placeholder="—" hint={unread(form.spouseAge) || 'Leave blank only if your spouse will not have an HSA.'} info={`A spouse aged ${HSA.catchUpAge} or older adds ${money(HSA.catchUp)}, but only if the spouse is also eligible (not on Medicare, no disqualifying coverage), and it has to be deposited in the spouse’s own HSA.`} />
              ) : <div />}
            </div>
            <PillField label="Covered by a qualifying high-deductible plan" value={form.plan} onChange={set('plan')} options={YES_NO_PLAN} hint="Not sure? Ask HR or the insurer whether the plan is HSA-qualified before relying on this." info={`${TAX_YEAR}: deductible of at least ${money(HSA.minDeductible.self)} self-only or ${money(HSA.minDeductible.family)} family and an out-of-pocket maximum no more than ${money(HSA.maxOutOfPocket.self)} or ${money(HSA.maxOutOfPocket.family)}. Exchange bronze and catastrophic plans also qualify. A general-purpose health FSA, including a spouse’s, disqualifies. The plan documents usually say whether it is HSA-qualified.`} />
            <PillField label={r.family ? 'You are enrolled in Medicare (even Part A only)' : 'Enrolled in Medicare (even Part A only)'} value={form.medicare} onChange={set('medicare')} options={MEDICARE} info={`Enrollment in any part of Medicare ends the right to contribute, and drawing Social Security at 65 or older starts Part A automatically. The existing balance stays yours. If Medicare started partway through this year, choose No, enter the months before it started under Months eligible, and leave Eligible on December 1 at No: only this year’s deposit is then assumed.${r.family ? ' If only your spouse is on Medicare, leave this at No and leave Spouse’s age blank: you can still contribute up to the family limit.' : ''}`} />
            {blocks.map((w) => (
              <DisclosureBox key={w.id}>
                <b>Not eligible. </b>
                {cap(w.text.replace(/^Not eligible: /, ''))}
              </DisclosureBox>
            ))}
          </Panel>
          <Panel title="This year">
            <PillField
              label="How the contribution is made"
              value={form.funding}
              onChange={set('funding')}
              options={FUNDING}
              hint="Self-employed, a partner, or own more than 2% of an S-corporation? Choose “On my own”."
              info="Through payroll, the money also skips Social Security and Medicare tax. Self-employed people, partners, and owners of more than 2% of an S-corporation (counting stock a spouse, child or parent owns) cannot make pre-tax payroll deductions for their own HSA: they deduct the contribution on the return, and this tool counts income tax only."
            />
            <div className="field-row">
              {r.payroll ? (
                <MoneyField label="Your yearly pay" value={form.wages} onChange={set('wages')} placeholder="—" hint={unread(form.wages) || `Only to work out the Social Security tax saved. Leave blank if under ${money(SS_WAGE_BASE)}.`} />
              ) : null}
              <MoneyField label="Employer contribution" value={form.employer} onChange={set('employer')} placeholder="0" hint={unread(form.employer) || (r.family ? 'Both spouses’ employers, counted toward the limit.' : 'Counts toward the limit.')} info="Money the employer puts in, including any seed or match. Do not include your own payroll deductions, even though W-2 box 12 code W shows them with the employer’s money. Anything a family member or an IRA transfer adds also counts toward the limit; enter it here too (it is not counted as a saving of your own)." />
              {r.payroll ? null : <div />}
            </div>
            <MoneyField
              label="Your contribution"
              value={form.amount}
              onChange={set('amount')}
              placeholder={Math.round(r.room).toLocaleString('en-US')}
              hint={unread(form.amount) || 'Leave blank for the most you can put in.'}
            />
            {warns.map((w) => (
              <DisclosureBox key={w.id}>
                <b>Note. </b>
                {w.text}
              </DisclosureBox>
            ))}
          </Panel>
          <Panel title="Over the years">
            <div className="field-row">
              <MoneyField label="Balance now" value={form.balance} onChange={set('balance')} placeholder="0" hint={unread(form.balance)} />
              <NumberField label="Retire at age" value={form.retireAge} onChange={set('retireAge')} suffix="yrs" placeholder="65" hint={retireHint || unread(form.retireAge)} info="When the balance is measured, between 50 and 80. Deposits stop at 65 in this projection, when most people enroll in Medicare and lose eligibility; someone past 65 and not enrolled keeps depositing." />
            </div>
            <div className="field-row">
              <NumberField label="Growth a year" value={form.growth} onChange={set('growth')} suffix="%" placeholder="6" hint={growthHint || unread(form.growth)} info="A steady yearly return after fees, between −10% and 20%. Real markets swing; this is a what-if." />
              <MoneyField label="Medical bills a year" value={form.spend} onChange={set('spend')} placeholder="2,000" hint={unread(form.spend)} info="What you pay yourself in a typical year after insurance (deductibles, copays, prescriptions, dental, vision), not premiums. It drives the comparison of paying from the account or from your pocket." />
            </div>
          </Panel>
          <RefinePanel title="Tax rate and part-year" summary="bracket, state, months eligible">
            <PillField label="Federal bracket" value={form.bracket} onChange={set('bracket')} options={BRACKET} info="Your top federal rate, the rate on the last dollar of your taxable income; your last return or your CPA can tell you. If the deduction pulls part of your income into a lower bracket, the real saving is a little smaller." />
            <div className="field-row">
              <SelectField label="State" value={form.state} onChange={set('state')} options={STATES.map((s) => ({ value: s.code, label: s.name }))} info="One flat state rate, a representative and often top-of-schedule figure, so the true saving is usually lower. California and New Jersey do not follow the federal deduction and show no state saving. Other states generally do, but only some were checked one by one: confirm for your state." />
              <NumberField label="Months eligible" value={form.months} onChange={set('months')} placeholder="12" hint={monthsHint || 'Leave blank for the whole year.'} info="Months in the year with a qualifying plan, counted from the first of the month. Fewer than 12 prorates the limit, unless you are eligible on December 1." />
            </div>
            {r.months < 12 ? <PillField label="Eligible on December 1" value={form.dec1} onChange={set('dec1')} options={DEC1} info="Choose Yes only if on December 1 you have a qualifying plan and are not on Medicare, and you expect to stay eligible through the end of next year. Then the full-year limit applies. Anyone whose plan ended or whose Medicare started during the year is not eligible on December 1." /> : null}
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="HSA Savings Plan"
              meta={`${coverageLabel}${r.age >= 18 ? ` · age ${r.age}` : ''} · ${TAX_YEAR} limits`}
              metaRight={today}
            />
            <FeatureBlock label="Tax saved this year" value={headline} note={featureNote} />
            {r.eligible ? (
              <>
                <StatTiles
                  items={[
                    { label: `${TAX_YEAR} maximum`, value: money(r.limit), note: r.catchAmount ? `includes ${money(r.catchAmount)} of catch-up` : r.prorated ? `${r.months} of 12 months` : 'no catch-up' },
                    { label: 'You put in', value: money(r.contribution), tone: 'good', note: r.employerCounted ? `employer adds ${money(r.employerCounted)}` : 'no employer contribution' },
                    { label: 'Saved per dollar', value: percent(perDollar * 100, 0), note: taxKinds },
                  ]}
                />
                <div className="result-list">{rows}</div>
              </>
            ) : null}
            <Narrative>{narrative}</Narrative>
            {r.eligible && infos.length ? (
              <div style={{ marginBottom: 14 }}>
                {infos.map((w) => (
                  <div className="hint plan-info" key={w.id}>{w.text}</div>
                ))}
              </div>
            ) : null}

            {p ? (
              <div className="chart-block">
                <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>The account to retirement</div>
                <StatTiles items={projectionTiles} />
                {hasBills ? <ScenarioCards sub="two ways to use the account" scenarios={strategyRows} /> : null}
                {lineChart}
                {hasBills ? (
                  <div className="report-narrative">
                    <div className="report-narrative-label">What the difference is</div>
                    <p>{compareText}</p>
                  </div>
                ) : null}
                <Note title="A what-if, not a forecast">
                  Growth is a steady {pct(p.growth)} with no fees or down years. {p.endsThisYear ? '' : `The yearly deposit stays at ${money(p.yearly)}, with no later limit increases and no catch-up added at ${HSA.catchUpAge}. `}{depositNote} The growth assumes the money is invested; many providers ask for a cash balance first (commonly $500 to $1,000), and fees vary. Spending in retirement is not modeled; for scale, Fidelity’s {RETIREE_HEALTH.year} estimate is about {money(RETIREE_HEALTH.amount)} of health care costs for a single 65-year-old retiring that year, not counting long-term care.
                </Note>
              </div>
            ) : noProjection ? (
              <Note title="The account to retirement">{noProjection}</Note>
            ) : null}
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Keep the receipts">{receiptsText}</Note>
      <Note title="Who inherits it">{inheritText}</Note>
      <Note title="Before relying on this">{eligibilityText}</Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
