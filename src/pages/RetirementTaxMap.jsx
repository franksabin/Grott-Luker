import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  SelectField,
  SegmentedField,
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
import { StackedBar, DonutChart, BarCompare, PALETTE, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import {
  ordinaryTax,
  capitalGainsTax,
  niitTax,
  taxableSocialSecurity,
  irmaaSurcharge,
  irmaaHeadroom,
  STANDARD_DEDUCTION,
  TAX_YEAR,
} from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const INCOME_FIELDS = [
  { key: 'socialSecurity', label: 'Social Security', taxedAs: 'Up to 85% taxable', info: 'Annual Social Security benefits. Only a portion is federally taxable, based on your other income (the “provisional income” test).' },
  { key: 'pension', label: 'Pension', taxedAs: 'Ordinary income', info: 'Annual pension income. Generally taxed as ordinary income.' },
  { key: 'traditionalIra', label: 'Traditional IRA / 401(k)', taxedAs: 'Ordinary income', info: 'Annual distributions from pre-tax retirement accounts. Taxed as ordinary income.' },
  { key: 'rothIra', label: 'Roth IRA', taxedAs: 'Tax-free', info: 'Annual qualified Roth withdrawals. Not included in taxable income.' },
  { key: 'taxableInvestments', label: 'Taxable investments', taxedAs: 'Qualified dividend / LTCG', info: 'Annual income from a taxable brokerage account. Modeled here as qualified dividends / long-term capital gains taxed at preferential rates.' },
  { key: 'rental', label: 'Rental income', taxedAs: 'Ordinary income', info: 'Net annual rental income. Taxed as ordinary income here.' },
  { key: 'business', label: 'Business income', taxedAs: 'Ordinary income', info: 'Net annual business income. Taxed as ordinary income here.' },
  { key: 'k1', label: 'K-1 income (partnership / S-corp)', taxedAs: 'Ordinary income', info: 'Ordinary income passed through on Schedule K-1 from a partnership or S corporation. Taxed as ordinary income here; passive-loss limits and the QBI deduction are not modeled.' },
]

const FILING_OPTIONS = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const blankScenario = () =>
  INCOME_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})

const SAMPLE_A = {
  socialSecurity: '48000',
  pension: '30000',
  traditionalIra: '70000',
  rothIra: '0',
  taxableInvestments: '20000',
  rental: '24000',
  business: '0',
  k1: '0',
}
const SAMPLE_B = {
  socialSecurity: '48000',
  pension: '30000',
  traditionalIra: '35000',
  rothIra: '35000',
  taxableInvestments: '20000',
  rental: '24000',
  business: '0',
  k1: '0',
}

function computeScenario(s, filing, stateCode) {
  const g = (k) => toNumber(s[k])
  const st = getState(stateCode)

  const ss = g('socialSecurity')
  const roth = g('rothIra')
  const ltcg = g('taxableInvestments')
  const ordinaryNonSS = g('pension') + g('traditionalIra') + g('rental') + g('business') + g('k1')

  const gross =
    ss + roth + ltcg + ordinaryNonSS // all seven sources

  // Social Security taxation via provisional income.
  const otherForSS = ordinaryNonSS + ltcg
  const taxableSS = taxableSocialSecurity(ss, otherForSS, 0, filing)

  const ordinaryAGI = ordinaryNonSS + taxableSS
  const agi = ordinaryAGI + ltcg

  // Standard deduction reduces ordinary income first, spilling into gains.
  const stdDed = STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married']
  const ordinaryTaxable = Math.max(0, ordinaryAGI - stdDed)
  const leftoverDed = Math.max(0, stdDed - ordinaryAGI)
  const ltcgTaxable = Math.max(0, ltcg - leftoverDed)
  const taxableIncome = ordinaryTaxable + ltcgTaxable

  const fedOrdinary = ordinaryTax(ordinaryTaxable, filing)
  const fedGains = capitalGainsTax(ltcgTaxable, ordinaryTaxable, filing)
  const niit = niitTax(ltcg, agi, filing)
  const federalTax = fedOrdinary + fedGains + niit

  const stateTax =
    ordinaryTaxable * (st.wage / 100) + ltcgTaxable * (st.capGains / 100)

  const totalTax = federalTax + stateTax
  const irmaa = irmaaSurcharge(agi, filing)
  const irmaaNext = irmaaHeadroom(agi, filing)
  const afterTaxCashFlow = gross - totalTax

  return {
    gross,
    taxableSS,
    ssTaxablePct: ss > 0 ? (taxableSS / ss) * 100 : 0,
    agi,
    taxableIncome,
    federalTax,
    stateTax,
    totalTax,
    effectiveRate: gross > 0 ? totalTax / gross : 0,
    irmaa,
    irmaaNext,
    afterTaxCashFlow,
    stateName: st.name,
  }
}

function ScenarioInputs({ title, values, onChange }) {
  return (
    <Panel title={title}>
      {INCOME_FIELDS.map((f) => (
        <MoneyField
          key={f.key}
          label={f.label}
          info={f.info}
          value={values[f.key]}
          onChange={(v) => onChange(f.key, v)}
        />
      ))}
    </Panel>
  )
}

function signedMoney(n) {
  if (Math.round(n) === 0) return '—'
  return `${n > 0 ? '+' : '−'}${money(Math.abs(n))}`
}

const OUTPUT_ROWS = [
  { label: 'Gross income', get: (r) => money(r.gross), diff: (x, y) => signedMoney(y.gross - x.gross) },
  { label: 'Taxable Social Security', get: (r) => `${money(r.taxableSS)} (${percent(r.ssTaxablePct, 0)})`, diff: (x, y) => signedMoney(y.taxableSS - x.taxableSS) },
  { label: 'Adjusted gross income', get: (r) => money(r.agi), diff: (x, y) => signedMoney(y.agi - x.agi) },
  { label: 'Estimated taxable income', get: (r) => money(r.taxableIncome), diff: (x, y) => signedMoney(y.taxableIncome - x.taxableIncome) },
  { label: 'Estimated federal tax', get: (r) => money(r.federalTax), diff: (x, y) => signedMoney(y.federalTax - x.federalTax) },
  { label: 'Estimated state tax', get: (r) => money(r.stateTax), diff: (x, y) => signedMoney(y.stateTax - x.stateTax) },
  { label: 'Estimated total tax', get: (r) => money(r.totalTax), strong: true, diff: (x, y) => signedMoney(y.totalTax - x.totalTax) },
  {
    label: 'Effective tax rate',
    get: (r) => percent(r.effectiveRate * 100),
    diff: (x, y) => {
      const d = (y.effectiveRate - x.effectiveRate) * 100
      return Math.abs(d) < 0.05 ? '—' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pts`
    },
  },
  {
    label: 'Estimated IRMAA exposure (annual)',
    get: (r) => (r.irmaa.tierApplies ? money(r.irmaa.annualHousehold) : 'None'),
    diff: (x, y) => signedMoney(y.irmaa.annualHousehold - x.irmaa.annualHousehold),
  },
  { label: 'Estimated after-tax cash flow', get: (r) => money(r.afterTaxCashFlow), strong: true, diff: (x, y) => signedMoney(y.afterTaxCashFlow - x.afterTaxCashFlow) },
]

// Colour swatch shared by the print legend note and the income-sources table.
const SWATCH = { display: 'inline-block', width: 8, height: 8, borderRadius: 2, flex: '0 0 auto', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }

// Currency with a true minus sign for net losses (money() alone prints a hyphen).
function moneyNeg(n) {
  return n < 0 ? `−${money(-n)}` : money(n)
}

// Share of gross income; negative for a net loss, dash for an empty field.
function shareOfGross(v, gross) {
  if (v === 0 || gross <= 0) return '—'
  return `${v < 0 ? '−' : ''}${Math.round((Math.abs(v) / gross) * 100)}%`
}

const hasLoss = (s) => INCOME_FIELDS.some((f) => toNumber(s[f.key]) < 0)

// Fixed 9-row (8 sources + gross) composition table used on print page 2. The
// row count never changes with the inputs, so page 2 fits by design; the swatch
// ties each row to its segment in the stacked bar above.
function compositionRows({ a, b, ra, rb, compareB }) {
  const rows = INCOME_FIELDS.map((f, i) => {
    const va = toNumber(a[f.key])
    const cells = [
      <span key="l" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ ...SWATCH, background: PALETTE[i % PALETTE.length] }} />
        {f.label}
      </span>,
      f.taxedAs,
      moneyNeg(va),
      shareOfGross(va, ra.gross),
    ]
    if (compareB) {
      const vb = toNumber(b[f.key])
      cells.push(moneyNeg(vb), shareOfGross(vb, rb.gross))
    }
    return cells
  })
  const total = ['Gross income', '', moneyNeg(ra.gross), ra.gross > 0 ? '100%' : '—']
  if (compareB) total.push(moneyNeg(rb.gross), rb.gross > 0 ? '100%' : '—')
  rows.push(total)
  return rows
}

// One-line legend that sits in a PrintSection's head note, so the chart keeps the full section height.
function LegendNote({ items }) {
  const total = items.reduce((s, d) => s + (d.value || 0), 0)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 16, fontStyle: 'normal', fontSize: 9.5, color: '#454650' }}>
      {items.map((d, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontStyle: 'normal' }}>
          <span style={{ ...SWATCH, background: d.color }} />
          <span style={{ fontStyle: 'normal', fontSize: 9.5, color: '#454650' }}>{d.label}</span>
          {d.value != null ? (
            <span style={{ fontStyle: 'normal', fontSize: 9.5, fontWeight: 600, color: '#0f2440', fontVariantNumeric: 'tabular-nums' }}>
              {money(d.value)}{total > 0 ? ` · ${Math.round((d.value / total) * 100)}%` : ''}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  )
}

function OutputRows({ a, b, compareB }) {
  const rows = OUTPUT_ROWS
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Output</th>
          <th className="num">Scenario A</th>
          {compareB ? <th className="num">Scenario B</th> : null}
          {compareB ? <th className="num">Difference</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const va = row.get(a)
          const vb = compareB ? row.get(b) : null
          return (
            <tr key={row.label} style={row.strong ? { fontWeight: 600 } : undefined}>
              <td>{row.label}</td>
              <td className="num">{va}</td>
              {compareB ? <td className="num">{vb}</td> : null}
              {compareB ? <td className="num">{row.diff ? row.diff(a, b) : ''}</td> : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function RetirementTaxMap() {
  const [filing, setFiling] = useState('married')
  const [stateCode, setStateCode] = useState('NH')
  const [a, setA] = useState(blankScenario())
  const [b, setB] = useState(blankScenario())
  const [compareB, setCompareB] = useState(false)

  const setAField = (k, v) => setA((s) => ({ ...s, [k]: v }))
  const setBField = (k, v) => setB((s) => ({ ...s, [k]: v }))

  const ra = useMemo(() => computeScenario(a, filing, stateCode), [a, filing, stateCode])
  const rb = useMemo(() => computeScenario(b, filing, stateCode), [b, filing, stateCode])
  const steps = useMemo(() => {
    const block = (tag, x) => [
      { label: `${tag}Gross income`, formula: 'all seven sources', result: money(x.gross, 2) },
      { label: `${tag}Taxable Social Security`, formula: 'provisional-income test (50% / 85% tiers)', result: `${money(x.taxableSS, 2)} (${percent(x.ssTaxablePct, 0)} of benefit)` },
      { label: `${tag}Adjusted gross income`, formula: 'ordinary income + taxable SS + capital gains (Roth excluded)', result: money(x.agi, 2) },
      { label: `${tag}Taxable income`, formula: `AGI − standard deduction ${money(STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married'])}`, result: money(x.taxableIncome, 2) },
      { label: `${tag}Federal tax`, formula: `${TAX_YEAR} ordinary brackets + capital-gains breakpoints + NIIT`, result: money(x.federalTax, 2) },
      { label: `${tag}State tax`, formula: `${x.stateName} rates on ordinary and gains`, result: money(x.stateTax, 2) },
      { label: `${tag}Total tax · effective rate`, formula: `total ÷ gross`, result: `${money(x.totalTax, 2)} · ${percent(x.effectiveRate * 100, 1)}` },
      { label: `${tag}IRMAA surcharge (annual, household)`, formula: `${TAX_YEAR} Part B + D schedule at AGI ${money(x.agi)} × ${x.irmaa.people}`, result: money(x.irmaa.annualHousehold, 2) },
      { label: `${tag}After-tax cash flow`, formula: 'gross − total tax', result: money(x.afterTaxCashFlow, 2) },
    ]
    return [...block(compareB ? 'A · ' : '', ra), ...(compareB ? block('B · ', rb) : [])]
  }, [ra, rb, compareB, filing])

  const reset = () => {
    setA(blankScenario())
    setB(blankScenario())
    setCompareB(false)
  }
  const sample = () => {
    setA(SAMPLE_A)
    setB(SAMPLE_B)
    setCompareB(true)
  }

  const scenarioRows = (x) => [
    { label: 'Total tax', value: money(x.totalTax) },
    { label: 'Effective rate', value: percent(x.effectiveRate * 100) },
    { label: 'IRMAA (annual)', value: x.irmaa.tierApplies ? money(x.irmaa.annualHousehold) : 'None' },
  ]

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const filingLabel = filing === 'single' ? 'Single' : 'Married filing jointly'
  const assumptions = [
    'Uses 2026 federal brackets, standard deduction, and long-term capital-gains breakpoints.',
    'The 2026 senior deduction ($6,000 per person 65+, phased out above $75,000 / $150,000) and the raised $40,400 SALT cap are not applied here because age and itemized deductions are not collected; both would lower the tax shown for clients they apply to.',
    'Traditional IRA/401(k), pension, rental, and business income are treated as ordinary income. Roth withdrawals are treated as tax-free.',
    'Taxable-investment income is modeled as qualified dividends / long-term capital gains taxed at preferential rates.',
    'Social Security taxability uses the standard provisional-income formula (up to 85% taxable).',
    'IRMAA exposure uses the 2026 income-related surcharge schedule and, for married filers, reflects two enrolled individuals. It shows the surcharge above the base premium.',
    'State tax applies simplified rates for the selected state and does not reflect state-specific retirement-income exclusions.',
    'The standard deduction is assumed; itemized deductions, credits, and QBI are not modeled.',
    'The IRMAA breakeven shows the income room left under the current Medicare surcharge tier (2026 Part B and D schedule) and the annual household cost of crossing into the next one. Premiums are set by the return filed two years earlier.',
  ]
  // Income amounts for A and B appear in the page-2 income-sources table (all eight fields, both scenarios).
  const inputs = [
    ['Filing status', filingLabel],
    ['State of residence', ra.stateName],
    ['Scenarios', compareB ? 'A and B compared' : 'A only'],
  ]
  const compositionData = (s) =>
    INCOME_FIELDS.map((f, i) => ({ label: f.label, value: toNumber(s[f.key]), color: PALETTE[i % PALETTE.length] }))
  const anyLoss = hasLoss(a) || (compareB && hasLoss(b))
  const cashDiff = rb.afterTaxCashFlow - ra.afterTaxCashFlow
  // "…, $7,575 more than Scenario A" / "…, $17,351 less than Scenario A" / "…, the same as Scenario A"
  const cashDiffPhrase =
    Math.round(cashDiff) === 0 ? 'the same as Scenario A' : cashDiff > 0 ? `${money(cashDiff)} more than Scenario A` : `${money(-cashDiff)} less than Scenario A`
  const printTiles = [
    { label: 'Estimated total tax', value: money(ra.totalTax), note: 'federal + state' },
    { label: 'Taxable Social Security', value: percent(ra.ssTaxablePct, 0), note: `${money(ra.taxableSS)} of benefit` },
    { label: 'IRMAA exposure', value: ra.irmaa.tierApplies ? money(ra.irmaa.annualHousehold) : 'None', note: ra.irmaaNext.atTop ? 'top tier · annual, household' : `${money(ra.irmaaNext.headroom)} of room before +${money(ra.irmaaNext.stepUp)}/yr` },
    ...(compareB
      ? [{ label: 'Scenario B cash flow', value: money(rb.afterTaxCashFlow), note: `after tax · ${cashDiffPhrase.replace('Scenario A', 'A')}`, best: cashDiff > 0 }]
      : []),
  ]
  // The winner is always marked: the B tile is highlighted when B wins; when A wins the headline says so.
  const featureNote = `On ${money(ra.gross)} gross · ${percent(ra.effectiveRate * 100)} effective tax rate${compareB && cashDiff < 0 ? ` · ${money(-cashDiff)} more than Scenario B` : ''}`
  const printReport = (
    <PrintDoc>
      <PrintPage compact>
        <PrintBand
          title="Retirement Income Tax Map"
          subtitle="Taxable income, Social Security taxation, IRMAA, and after-tax cash flow by income source."
          meta={`${compareB ? 'Scenario A vs. Scenario B' : 'Scenario A'} · ${filingLabel} · ${ra.stateName}`}
          metaRight={today}
        />
        <PrintFeature
          label="Estimated after-tax cash flow (Scenario A)"
          value={money(ra.afterTaxCashFlow)}
          note={featureNote}
        />
        <PrintTiles items={printTiles} />
        <PrintSection title="Scenario A — from gross income to after-tax cash flow" note="annual">
          <PrintRows
            rows={[
              { label: 'Gross income', value: money(ra.gross) },
              { label: 'Adjusted gross income', value: money(ra.agi) },
              { label: 'Estimated taxable income', value: money(ra.taxableIncome) },
              { label: 'Estimated federal tax', value: `(${money(ra.federalTax)})` },
              { label: 'Estimated state tax', value: `(${money(ra.stateTax)})` },
              { label: 'Estimated total tax', value: `(${money(ra.totalTax)})` },
              { label: 'Estimated after-tax cash flow', value: money(ra.afterTaxCashFlow), total: true },
              ...(!ra.irmaaNext.atTop
                ? [{ label: `IRMAA breakeven — next tier starts at ${money(ra.irmaaNext.threshold)} of income`, value: `${money(ra.irmaaNext.headroom)} of room · +${money(ra.irmaaNext.stepUp)}/yr if crossed`, sub: true }]
                : []),
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>
            In Scenario A, {money(ra.gross)} of gross income results in an estimated {money(ra.taxableIncome)} of taxable income and{' '}
            {money(ra.totalTax)} in total taxes, leaving {money(ra.afterTaxCashFlow)} of after-tax cash flow. About {percent(ra.ssTaxablePct, 0)} of Social
            Security benefits are taxable at this income level
            {ra.irmaa.tierApplies
              ? `, and an IRMAA surcharge of about ${money(ra.irmaa.annualHousehold)} per year applies`
              : ', with no IRMAA surcharge at this level'}
            .
            {compareB
              ? ` Scenario B produces ${money(rb.totalTax)} in total taxes (${percent(rb.effectiveRate * 100)} effective) and ${money(rb.afterTaxCashFlow)} of after-tax cash flow, ${cashDiffPhrase}${rb.irmaa.tierApplies ? `, with an IRMAA surcharge of about ${money(rb.irmaa.annualHousehold)} per year` : ''}.`
              : ''}
          </PrintProse>
        </PrintSection>
        <PrintSection
          title={compareB ? 'Scenario comparison' : 'Taxes vs. after-tax cash flow'}
          note={
            <LegendNote
              items={
                compareB
                  ? [{ label: 'After-tax cash flow', color: TONE.net }, { label: 'Total tax', color: TONE.tax }]
                  : [{ label: 'After-tax cash flow', value: ra.afterTaxCashFlow, color: TONE.net }, { label: 'Estimated total tax', value: ra.totalTax, color: TONE.tax }]
              }
            />
          }
          className="pr-chart"
        >
          {compareB ? (
            <BarCompare
              height={185}
              legend={false}
              groups={[
                {
                  label: 'Scenario A',
                  bars: [
                    { label: 'After-tax cash flow', value: ra.afterTaxCashFlow, color: TONE.net },
                    { label: 'Total tax', value: ra.totalTax, color: TONE.tax },
                  ],
                },
                {
                  label: 'Scenario B',
                  bars: [
                    { label: 'After-tax cash flow', value: rb.afterTaxCashFlow, color: TONE.net },
                    { label: 'Total tax', value: rb.totalTax, color: TONE.tax },
                  ],
                },
              ]}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
              <DonutChart
                size={196}
                thickness={30}
                legend={false}
                centerValue={percent(ra.effectiveRate * 100)}
                centerLabel="Effective rate"
                data={[
                  { label: 'After-tax cash flow', value: ra.afterTaxCashFlow, color: TONE.net },
                  { label: 'Estimated total tax', value: ra.totalTax, color: TONE.tax },
                ]}
              />
            </div>
          )}
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="Retirement Income Tax Map" right={today} />
        {compareB ? (
          <PrintCols>
            <PrintSection title="Income composition — Scenario A" note={`${money(ra.gross)} gross`} className="pr-chart">
              <StackedBar data={compositionData(a)} legend={false} />
            </PrintSection>
            <PrintSection title="Income composition — Scenario B" note={`${money(rb.gross)} gross`} className="pr-chart">
              <StackedBar data={compositionData(b)} legend={false} />
            </PrintSection>
          </PrintCols>
        ) : (
          <PrintSection title="Income composition — Scenario A" note={`${money(ra.gross)} gross`} className="pr-chart">
            <StackedBar data={compositionData(a)} legend={false} />
          </PrintSection>
        )}
        <PrintSection
          title="Income sources — amount and share of gross"
          note={anyLoss ? 'a net loss reduces gross income but has no segment in the bar' : 'the inputs behind the bar above'}
        >
          <PrintTable
            head={compareB ? ['Source', 'Taxed as', 'Scenario A', 'Share', 'Scenario B', 'Share'] : ['Source', 'Taxed as', 'Amount', 'Share of gross']}
            widths={compareB ? ['30%', '20%', '14%', '11%', '14%', '11%'] : ['36%', '28%', '20%', '16%']}
            align={compareB ? ['left', 'left', 'right', 'right', 'right', 'right'] : ['left', 'left', 'right', 'right']}
            rows={compositionRows({ a, b, ra, rb, compareB })}
            rowClass={(row, i) => (i === INCOME_FIELDS.length ? 'is-strong' : '')}
          />
        </PrintSection>
        {compareB ? (
          <PrintSection title="Scenario A vs. Scenario B" note="annual estimates">
            <PrintTable
              head={['Output', 'Scenario A', 'Scenario B', 'Difference']}
              widths={['40%', '20%', '20%', '20%']}
              align={['left', 'right', 'right', 'right']}
              rows={OUTPUT_ROWS.map((row) => [row.label, row.get(ra), row.get(rb), row.diff ? row.diff(ra, rb) : ''])}
              rowClass={(row, i) => (OUTPUT_ROWS[i].strong ? 'is-strong' : '')}
            />
          </PrintSection>
        ) : (
          <PrintSection title="How the estimate was built" note="Scenario A · annual">
            <PrintTable
              head={['Line', 'Method', 'Result']}
              widths={['31%', '45%', '24%']}
              align={['left', 'left', 'right']}
              rows={steps.map((s) => [s.label, s.formula, s.result])}
            />
          </PrintSection>
        )}
        <PrintNote title="Reading the result">
          Notice how ordinary sources (pension, Traditional IRA, rental, business) raise both taxable income and the share of Social Security that becomes taxable, while Roth withdrawals do not. This tool illustrates those relationships only — it does not sequence withdrawals, estimate the probability of outcomes, advise on when to claim Social Security, or make investment recommendations.
        </PrintNote>
        <PrintSection title="Inputs used in this estimate" note="income amounts are listed in the income-sources table above">
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
      title="Retirement Income Tax Map"
      subtitle="Illustrate how each retirement income source contributes to taxable income, how Social Security becomes taxable, and where IRMAA and after-tax cash flow land. Build a second scenario to compare two income mixes side by side."
      onReset={reset}
      onSample={sample}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Household Settings">
            <SegmentedField label="Filing status" value={filing} onChange={setFiling} options={FILING_OPTIONS} />
            <label className="field-label" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={compareB}
                onChange={(e) => setCompareB(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Compare a second scenario
            </label>
          </Panel>

          <ScenarioInputs title="Scenario A — Annual Income" values={a} onChange={setAField} />
          {compareB ? (
            <ScenarioInputs title="Scenario B — Annual Income" values={b} onChange={setBField} />
          ) : null}

          <RefinePanel summary="state of residence">
            <SelectField
              label="State of residence"
              value={stateCode}
              onChange={setStateCode}
              options={STATES.map((s) => ({ value: s.code, label: s.name }))}
            />
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Retirement Income Tax Summary"
              meta={compareB ? 'Scenario A vs. Scenario B' : 'Scenario A'}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="Estimated after-tax cash flow (Scenario A)"
              value={money(ra.afterTaxCashFlow)}
              note={`On ${money(ra.gross)} gross · ${percent(ra.effectiveRate * 100)} effective tax rate`}
            />
            <StatTiles
              items={[
                { label: 'Estimated total tax', value: money(ra.totalTax), tone: ra.totalTax > 0 ? 'bad' : undefined, note: 'federal + state' },
                { label: 'Taxable Social Security', value: percent(ra.ssTaxablePct, 0), note: `${money(ra.taxableSS)} of benefit` },
                { label: 'IRMAA exposure', value: ra.irmaa.tierApplies ? money(ra.irmaa.annualHousehold) : 'None', tone: ra.irmaa.tierApplies ? 'bad' : undefined, note: ra.irmaaNext.atTop ? 'top tier · annual, household' : `${money(ra.irmaaNext.headroom)} of income room before +${money(ra.irmaaNext.stepUp)}/yr` },
              ]}
            />

            <div className="result-list">
              <ResultRow label="Gross income" value={ra.gross} />
              <ResultRow label="Taxable Social Security" raw={`${money(ra.taxableSS)} (${percent(ra.ssTaxablePct, 0)})`} sub />
              <ResultRow label="Adjusted gross income" value={ra.agi} />
              <ResultRow label="Estimated taxable income" value={ra.taxableIncome} />
              <ResultRow label="Estimated federal tax" raw={`(${money(ra.federalTax)})`} negative />
              <ResultRow label="Estimated state tax" raw={`(${money(ra.stateTax)})`} negative />
              <ResultRow label="Estimated total tax" raw={`(${money(ra.totalTax)})`} negative />
              <ResultRow label="Estimated after-tax cash flow" value={ra.afterTaxCashFlow} total />
              {!ra.irmaaNext.atTop ? (
                <ResultRow label={`IRMAA breakeven — next tier starts at ${money(ra.irmaaNext.threshold)} of income`} raw={`${money(ra.irmaaNext.headroom)} of room · +${money(ra.irmaaNext.stepUp)}/yr if crossed`} sub info="Medicare premiums two years from now are set by this year's income. Keep a Roth conversion or capital gain inside the room, or expect the household surcharge to step up by the amount shown." />
              ) : null}
            </div>

            <Narrative>
              In Scenario A, {money(ra.gross)} of gross income results in an
              estimated {money(ra.taxableIncome)} of taxable income and{' '}
              {money(ra.totalTax)} in total taxes, leaving {money(ra.afterTaxCashFlow)}{' '}
              of after-tax cash flow. About {percent(ra.ssTaxablePct, 0)} of Social
              Security benefits are taxable at this income level
              {ra.irmaa.tierApplies
                ? `, and an IRMAA surcharge of about ${money(ra.irmaa.annualHousehold)} per year applies`
                : ', with no IRMAA surcharge at this level'}
              .{compareB ? ' Scenario B is shown alongside for comparison.' : ''}
            </Narrative>

            {compareB ? (
              <ScenarioCards
                sub="after-tax cash flow"
                scenarios={[
                  { label: 'Scenario A', value: money(ra.afterTaxCashFlow), rows: scenarioRows(ra) },
                  { label: 'Scenario B', value: money(rb.afterTaxCashFlow), rows: scenarioRows(rb) },
                ]}
              />
            ) : null}

            <div className="chart-block" style={{ marginTop: 22 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Income Composition — Scenario A
              </div>
              <StackedBar data={compositionData(a)} />
              {hasLoss(a) ? (
                <p className="chart-caption">
                  A net loss (negative rental or business income) reduces gross income but has no segment in the bar, so the bar and its percentages are drawn on positive sources only.
                </p>
              ) : null}
            </div>

            <div className="chart-block" style={{ marginTop: 20 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                {compareB ? 'Scenario Comparison' : 'Taxes vs. After-Tax Cash Flow'}
              </div>
              {compareB ? (
                <BarCompare
                  groups={[
                    {
                      label: 'Scenario A',
                      bars: [
                        { label: 'After-tax cash flow', value: ra.afterTaxCashFlow, color: TONE.net },
                        { label: 'Total tax', value: ra.totalTax, color: TONE.tax },
                      ],
                    },
                    {
                      label: 'Scenario B',
                      bars: [
                        { label: 'After-tax cash flow', value: rb.afterTaxCashFlow, color: TONE.net },
                        { label: 'Total tax', value: rb.totalTax, color: TONE.tax },
                      ],
                    },
                  ]}
                />
              ) : (
                <DonutChart
                  centerValue={percent(ra.effectiveRate * 100)}
                  centerLabel="Effective rate"
                  data={[
                    { label: 'After-tax cash flow', value: ra.afterTaxCashFlow, color: TONE.net },
                    { label: 'Estimated total tax', value: ra.totalTax, color: TONE.tax },
                  ]}
                />
              )}
            </div>

            {compareB ? (
              <div style={{ overflowX: 'auto', marginTop: 20 }}>
                <OutputRows a={ra} b={rb} compareB={compareB} />
              </div>
            ) : null}
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the map">
        Notice how ordinary sources (pension, Traditional IRA, rental, business)
        raise both taxable income and the share of Social Security that becomes
        taxable, while Roth withdrawals do not. This tool illustrates those
        relationships only — it does not sequence withdrawals, estimate the
        probability of outcomes, advise on when to claim Social Security, or make
        investment recommendations.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
