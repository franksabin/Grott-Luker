import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, MoneyField, SelectField, SegmentedField, Assumptions, Note, ReportHeader, FeatureBlock, Narrative } from '../components/ui.jsx'
import { StackedBar, DonutChart, BarCompare, PALETTE, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import {
  ordinaryTax,
  capitalGainsTax,
  niitTax,
  taxableSocialSecurity,
  irmaaSurcharge,
  STANDARD_DEDUCTION,
  TAX_YEAR,
} from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const INCOME_FIELDS = [
  { key: 'socialSecurity', label: 'Social Security', info: 'Annual Social Security benefits. Only a portion is federally taxable, based on your other income (the “provisional income” test).' },
  { key: 'pension', label: 'Pension', info: 'Annual pension income. Generally taxed as ordinary income.' },
  { key: 'traditionalIra', label: 'Traditional IRA / 401(k)', info: 'Annual distributions from pre-tax retirement accounts. Taxed as ordinary income.' },
  { key: 'rothIra', label: 'Roth IRA', info: 'Annual qualified Roth withdrawals. Not included in taxable income.' },
  { key: 'taxableInvestments', label: 'Taxable investments', info: 'Annual income from a taxable brokerage account. Modeled here as qualified dividends / long-term capital gains taxed at preferential rates.' },
  { key: 'rental', label: 'Rental income', info: 'Net annual rental income. Taxed as ordinary income here.' },
  { key: 'business', label: 'Business income', info: 'Net annual business income. Taxed as ordinary income here.' },
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
}
const SAMPLE_B = {
  socialSecurity: '48000',
  pension: '30000',
  traditionalIra: '35000',
  rothIra: '35000',
  taxableInvestments: '20000',
  rental: '24000',
  business: '0',
}

function computeScenario(s, filing, stateCode) {
  const g = (k) => toNumber(s[k])
  const st = getState(stateCode)

  const ss = g('socialSecurity')
  const roth = g('rothIra')
  const ltcg = g('taxableInvestments')
  const ordinaryNonSS = g('pension') + g('traditionalIra') + g('rental') + g('business')

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

function OutputRows({ a, b, compareB }) {
  const rows = [
    { label: 'Gross income', get: (r) => money(r.gross), diff: (x, y) => signedMoney(y.gross - x.gross) },
    { label: 'Taxable Social Security', get: (r) => `${money(r.taxableSS)} (${percent(r.ssTaxablePct, 0)})`, diff: (x, y) => signedMoney(y.taxableSS - x.taxableSS) },
    { label: 'Adjusted gross income', get: (r) => money(r.agi), diff: (x, y) => signedMoney(y.agi - x.agi) },
    { label: 'Estimated taxable income', get: (r) => money(r.taxableIncome), diff: (x, y) => signedMoney(y.taxableIncome - x.taxableIncome) },
    { label: 'Estimated federal tax', get: (r) => money(r.federalTax), diff: (x, y) => signedMoney(y.federalTax - x.federalTax) },
    { label: 'Estimated state tax', get: (r) => money(r.stateTax), diff: (x, y) => signedMoney(y.stateTax - x.stateTax) },
    { label: 'Estimated total tax', get: (r) => money(r.totalTax), strong: true, diff: (x, y) => signedMoney(y.totalTax - x.totalTax) },
    { label: 'Effective tax rate', get: (r) => percent(r.effectiveRate * 100) },
    {
      label: 'Estimated IRMAA exposure (annual)',
      get: (r) => (r.irmaa.tierApplies ? money(r.irmaa.annualHousehold) : 'None'),
      diff: (x, y) => signedMoney(y.irmaa.annualHousehold - x.irmaa.annualHousehold),
    },
    { label: 'Estimated after-tax cash flow', get: (r) => money(r.afterTaxCashFlow), strong: true, diff: (x, y) => signedMoney(y.afterTaxCashFlow - x.afterTaxCashFlow) },
  ]
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

  return (
    <ToolShell
      title="Retirement Income Tax Map"
      subtitle="Illustrate how each retirement income source contributes to taxable income, how Social Security becomes taxable, and where IRMAA and after-tax cash flow land. Build a second scenario to compare two income mixes side by side."
      onReset={reset}
      onSample={sample}
      steps={steps}
    >
      <Panel title="Household Settings">
        <div className="field-row">
          <SegmentedField label="Filing status" value={filing} onChange={setFiling} options={FILING_OPTIONS} />
          <SelectField
            label="State of residence"
            value={stateCode}
            onChange={setStateCode}
            options={STATES.map((s) => ({ value: s.code, label: s.name }))}
          />
        </div>
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

      <div className={compareB ? 'scenario-cols' : ''}>
        <ScenarioInputs title="Scenario A — Annual Income" values={a} onChange={setAField} />
        {compareB ? (
          <ScenarioInputs title="Scenario B — Annual Income" values={b} onChange={setBField} />
        ) : null}
      </div>

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

        <OutputRows a={ra} b={rb} compareB={compareB} />
        <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
      </section>

      <div className="tool-grid">
        <Panel title="Income Composition — Scenario A">
          <StackedBar
            data={INCOME_FIELDS.map((f, i) => ({
              label: f.label,
              value: toNumber(a[f.key]),
              color: PALETTE[i % PALETTE.length],
            }))}
          />
        </Panel>

        <Panel title={compareB ? 'Scenario Comparison' : 'Taxes vs. After-Tax Cash Flow'}>
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
        </Panel>
      </div>

      <Note title="Reading the map">
        Notice how ordinary sources (pension, Traditional IRA, rental, business)
        raise both taxable income and the share of Social Security that becomes
        taxable, while Roth withdrawals do not. This tool illustrates those
        relationships only — it does not sequence withdrawals, estimate the
        probability of outcomes, advise on when to claim Social Security, or make
        investment recommendations.
      </Note>

      <Assumptions
        items={[
          'Uses 2026 federal brackets, standard deduction, and long-term capital-gains breakpoints.',
          'Traditional IRA/401(k), pension, rental, and business income are treated as ordinary income. Roth withdrawals are treated as tax-free.',
          'Taxable-investment income is modeled as qualified dividends / long-term capital gains taxed at preferential rates.',
          'Social Security taxability uses the standard provisional-income formula (up to 85% taxable).',
          'IRMAA exposure uses the 2026 income-related surcharge schedule and, for married filers, reflects two enrolled individuals. It shows the surcharge above the base premium.',
          'State tax applies simplified rates for the selected state and does not reflect state-specific retirement-income exclusions.',
          'The standard deduction is assumed; itemized deductions, credits, and QBI are not modeled.',
        ]}
      />
    </ToolShell>
  )
}
