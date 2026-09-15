import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  SelectField,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ordinaryTax, marginalOrdinaryRate, STANDARD_DEDUCTION, rmdDivisor, seniorDeduction, SENIOR_DEDUCTION, TAX_YEAR } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const HORIZON = 10
const GROWTH = 0.05

const BLANK = {
  age: '',
  filing: 'married',
  wages: '',
  retireAge: '',
  ssStartAge: '',
  ssAnnual: '',
  iraBalance: '',
  rothConversion: '',
  conversionYears: '0',
}

const SAMPLE = {
  age: '63',
  filing: 'married',
  wages: '120000',
  retireAge: '65',
  ssStartAge: '70',
  ssAnnual: '48000',
  iraBalance: '1400000',
  rothConversion: '90000',
  conversionYears: '7',
}

function project(form, withConversions) {
  const startAge = toNumber(form.age) || 63
  const filing = form.filing
  const stdDed = STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married']
  const wages = toNumber(form.wages)
  const retireAge = toNumber(form.retireAge) || 65
  const ssStartAge = toNumber(form.ssStartAge) || 67
  const ssAnnual = toNumber(form.ssAnnual)
  const conversionYears = Math.max(0, Math.round(toNumber(form.conversionYears)))
  const conversionAmt = withConversions ? toNumber(form.rothConversion) : 0

  let iraBalance = toNumber(form.iraBalance)
  const rows = []
  let totalTax = 0

  for (let y = 0; y < HORIZON; y++) {
    const age = startAge + y
    const yearWages = age < retireAge ? wages : 0
    const taxableSS = age >= ssStartAge ? ssAnnual * 0.85 : 0

    const divisor = rmdDivisor(age)
    const rmd = divisor ? iraBalance / divisor : 0

    const conversion = y < conversionYears ? Math.min(conversionAmt, iraBalance) : 0

    const ordinaryIncome = yearWages + taxableSS + rmd + conversion
    // Senior deduction applies for tax years through 2028 once the client is 65+
    // (one person for single, two for married — spouse assumed the same age).
    const taxYear = TAX_YEAR + y
    const senior = age >= 65 && taxYear <= SENIOR_DEDUCTION.lastYear ? seniorDeduction(ordinaryIncome, filing, filing === 'married' ? 2 : 1) : 0
    const taxable = Math.max(0, ordinaryIncome - stdDed - senior)
    const tax = ordinaryTax(taxable, filing)
    const marginal = marginalOrdinaryRate(taxable, filing)
    totalTax += tax

    rows.push({ age, taxYear, yearWages, taxableSS, rmd, conversion, ordinaryIncome, senior, taxable, tax, marginal })

    // Update IRA: remove RMD + conversion, then grow.
    iraBalance = Math.max(0, iraBalance - rmd - conversion) * (1 + GROWTH)
  }

  return { rows, totalTax, endingIra: iraBalance }
}

export default function MultiYearProjection() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const withConv = useMemo(() => project(form, true), [form])
  const withoutConv = useMemo(() => project(form, false), [form])
  const convActive = toNumber(form.rothConversion) > 0 && toNumber(form.conversionYears) > 0
  const taxDelta = withConv.totalTax - withoutConv.totalTax
  const steps = useMemo(() => {
    const scenario = convActive ? withConv : withoutConv
    const std = STANDARD_DEDUCTION[form.filing === 'single' ? 'single' : 'married']
    return [
      { label: 'Method', formula: `${HORIZON} years · ${TAX_YEAR} brackets held flat · IRA grows ${percent(GROWTH * 100, 0)} · RMDs from 73 · Social Security 85% taxable`, result: convActive ? 'with conversions' : 'no conversions' },
      ...scenario.rows.map((row) => ({
        label: `${row.taxYear} · age ${row.age}`,
        formula: `wages ${money(row.yearWages)} + taxable SS ${money(row.taxableSS)} + RMD ${money(row.rmd)}${row.conversion > 0 ? ` + conversion ${money(row.conversion)}` : ''} − ${money(std)}${row.senior > 0 ? ` − senior ${money(row.senior)}` : ''} = taxable ${money(row.taxable)} (${percent(row.marginal * 100, 0)} bracket)`,
        result: money(row.tax, 2),
      })),
      { label: `Total federal tax · ${convActive ? 'with' : 'without'} conversions`, formula: 'sum of the ten years', result: money(scenario.totalTax, 2) },
      ...(convActive ? [
        { label: 'Total federal tax · without conversions', formula: 'same projection, no conversions', result: money(withoutConv.totalTax, 2) },
        { label: 'Ten-year tax difference', formula: `${money(withConv.totalTax, 2)} − ${money(withoutConv.totalTax, 2)}`, result: money(taxDelta, 2) },
        { label: 'Ending IRA balance · with vs. without', formula: 'after RMDs, conversions, and growth', result: `${money(withConv.endingIra)} vs. ${money(withoutConv.endingIra)}` },
      ] : [{ label: 'Ending IRA balance', formula: 'after RMDs and growth', result: money(scenario.endingIra) }]),
    ]
  }, [withConv, withoutConv, convActive, taxDelta, form.filing])

  return (
    <ToolShell
      title="Multi-Year Tax Projection Planner"
      subtitle="Project taxable income and federal tax across the next ten years to reveal low-bracket planning windows and to see how a series of Roth conversions reshapes lifetime tax."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Household & Timeline">
            <div className="field-row">
              <NumberField label="Current age" value={form.age} onChange={set('age')} suffix="yrs" />
              <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            </div>
            <div className="field-row">
              <MoneyField label="Current wages / income" value={form.wages} onChange={set('wages')} />
              <NumberField label="Stop working at age" value={form.retireAge} onChange={set('retireAge')} suffix="yrs" />
            </div>
            <div className="field-row">
              <MoneyField label="Social Security (annual)" value={form.ssAnnual} onChange={set('ssAnnual')} />
              <NumberField label="Claim Social Security at" value={form.ssStartAge} onChange={set('ssStartAge')} suffix="yrs" />
            </div>
          </Panel>

          <Panel title="Retirement Accounts & Conversions">
            <MoneyField
              label="Traditional IRA / 401(k) balance"
              value={form.iraBalance}
              onChange={set('iraBalance')}
              info="Pre-tax balance today. RMDs begin at age 73 using the IRS Uniform Lifetime Table."
            />
            <div className="field-row">
              <MoneyField
                label="Annual Roth conversion"
                value={form.rothConversion}
                onChange={set('rothConversion')}
                info="A planned yearly conversion amount, applied for the number of years below."
              />
              <NumberField label="For how many years" value={form.conversionYears} onChange={set('conversionYears')} suffix="yrs" />
            </div>
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Ten-Year Tax Projection"
              meta={convActive ? 'With planned Roth conversions' : 'Baseline projection'}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="Projected total federal tax over 10 years"
              value={money(withConv.totalTax)}
              note={
                convActive
                  ? `${taxDelta >= 0 ? 'Increases' : 'Reduces'} 10-yr tax by ${money(Math.abs(taxDelta))} vs. no conversions`
                  : 'Baseline — add a conversion plan to compare'
              }
            />
            <Narrative>
              Over the next ten years, we project {money(withConv.totalTax)} of
              total federal tax
              {convActive
                ? `. Without the planned conversions, the ten-year total would be about ${money(withoutConv.totalTax)} — the conversions shift ${money(Math.abs(taxDelta))} ${taxDelta >= 0 ? 'of tax earlier, in exchange for lower future RMDs and a larger tax-free Roth balance' : 'off the ten-year total by filling lower brackets before RMDs and Social Security begin'}.`
                : '. Filling lower-bracket years before RMDs and Social Security begin is often where the opportunity lies — add a Roth conversion plan on the left to test it.'}
            </Narrative>

            <div className="chart-block" style={{ marginTop: 12 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Projected taxable income by year
              </div>
              <BarCompare
                height={200}
                legend={false}
                groups={withConv.rows.slice(0, 8).map((row) => ({
                  label: String(row.age),
                  bars: [{ label: 'Taxable', value: row.taxable, color: TONE.navy }],
                }))}
              />
              <p className="chart-caption">Bars show projected taxable income at each age (first 8 years shown).</p>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Age</th>
                    <th className="num">Wages</th>
                    <th className="num">Taxable SS</th>
                    <th className="num">RMD</th>
                    <th className="num">Conversion</th>
                    <th className="num">Taxable income</th>
                    <th className="num">Fed tax</th>
                    <th className="num">Marginal</th>
                  </tr>
                </thead>
                <tbody>
                  {withConv.rows.map((row) => (
                    <tr key={row.age}>
                      <td>{row.age}</td>
                      <td className="num">{money(row.yearWages)}</td>
                      <td className="num">{money(row.taxableSS)}</td>
                      <td className="num">{money(row.rmd)}</td>
                      <td className="num">{money(row.conversion)}</td>
                      <td className="num">{money(row.taxable)}</td>
                      <td className="num">{money(row.tax)}</td>
                      <td className="num">{percent(row.marginal * 100, 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>10-year total federal tax</td>
                    <td className="num" colSpan={2}>{money(withConv.totalTax)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Assumptions
        items={[
          'Projects ten years using 2026 federal ordinary brackets and the standard deduction held constant; brackets are not inflation-adjusted forward.',
          'The $6,000-per-person senior deduction (2025–2028) is applied from age 65 through tax year 2028, phased out 6% of income over $75,000 / $150,000; married filers are assumed to be the same age.',
          'Retirement account grows at an assumed 5% per year; RMDs begin at age 73 using the IRS Uniform Lifetime Table divisors.',
          'Social Security is included at 85% taxable once claimed — a simplification of the provisional-income formula.',
          'Wages stop at the age entered. Capital gains, other income, state tax, IRMAA, and future law changes are not modeled here.',
          'Conversions are applied at the annual amount entered for the number of years entered, limited by the remaining balance. This is an illustration, not a recommendation.',
        ]}
      />
    </ToolShell>
  )
}
