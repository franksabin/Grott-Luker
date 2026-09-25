import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
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
import { money, toNumber, percent } from '../lib/format.js'
import { TAX_YEAR, rmdStartAge } from '../lib/tax.js'
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
  state: '0',
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
  state: '0',
}

const RATE_COLORS = { 0.1: '#c9d6e6', 0.12: '#9fb8d6', 0.22: '#5a93cf', 0.24: '#2f6099', 0.32: '#1d4576', 0.35: '#0f2440', 0.37: '#08162b' }

// Stacked columns: dollars of taxable income in each bracket, one column per year.
function BracketBars({ rows, height = 200 }) {
  const max = Math.max(1, ...rows.map((r) => r.taxable))
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]
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
        <span><i className="bracket-conv-key" />conversion year</span>
      </div>
    </div>
  )
}

export default function MultiYearProjection() {
  // ?sample=1 opens the page with the sample loaded (handy for screenshots and review links).
  const [form, setForm] = useState(() => (new URLSearchParams(window.location.search).get('sample') ? SAMPLE : BLANK))
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

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
    stateRate: toNumber(form.state) / 100,
    mode: form.mode,
    flatAmount: toNumber(form.flatAmount),
    flatYears: Math.round(toNumber(form.flatYears)) || 0,
    fillBracket: Math.round(toNumber(form.fillBracket)) || 24,
    fillUntilAge: Math.round(toNumber(form.fillUntilAge)) || rmdAge - 1,
    beneficiaryRate: toNumber(form.beneficiaryRate) / 100,
  }), [form, birthYear, startAge, rmdAge])

  const r = useMemo(() => computeMultiYear(inputs), [inputs])
  const { plan, none } = r
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
    { label: 'Lifetime tax · plan vs. do nothing', formula: 'sum of every year, federal + state', result: `${money(plan.lifetimeTax)} vs. ${money(none.lifetimeTax)}` },
    { label: `Balances at ${inputs.endAge} · plan`, formula: 'pre-tax · Roth · taxable', result: `${money(plan.endPretax)} · ${money(plan.endRoth)} · ${money(plan.endSide)}` },
    { label: `Balances at ${inputs.endAge} · do nothing`, formula: 'pre-tax · Roth · taxable', result: `${money(none.endPretax)} · ${money(none.endRoth)} · ${money(none.endSide)}` },
    { label: 'Heirs’ tax on what is still pre-tax', formula: `pre-tax balance × beneficiary rate ${percent(inputs.beneficiaryRate * 100, 0)} (10-year rule)`, result: `${money(plan.heirsTax)} plan · ${money(none.heirsTax)} do nothing` },
    { label: `After-tax family wealth at ${inputs.endAge}`, formula: 'pre-tax × (1 − heirs’ rate) + Roth + taxable', result: `${money(plan.familyWealth)} plan · ${money(none.familyWealth)} do nothing` },
    { label: 'Difference', formula: 'plan − do nothing', result: money(r.delta) },
  ], [r, plan, none, inputs, form.mode, form.fillBracket, birthYear, startAge, rmdAge, hasPlan])

  const ready = inputs.pretax > 0 && toNumber(form.birthYear) > 0
  const chartRows = plan.rows
  const label = hasPlan ? (form.mode === 'fill' ? `Fill to ${form.fillBracket}%` : 'Convert each year') : 'As entered'

  return (
    <ToolShell
      title="Multi-Year Tax Projection Planner"
      subtitle="Year by year to the end of the plan: RMDs from the right age, Social Security, Roth conversions that fill a bracket or run at a set amount, and the picture the client's heirs inherit — what the family keeps if you do nothing versus if you act."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
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
              <MoneyField label="Taxable / cash" value={form.taxable} onChange={set('taxable')} info="Pays the tax on conversions and receives RMDs. If it runs out, tax is withheld from the conversion." />
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
          <RefinePanel summary={`${form.ret}% return, ${form.index === 'no' ? 'no' : `${form.infl}%`} indexing, ${form.state}% state`}>
            <div className="field-row">
              <NumberField label="Annual return, all accounts" value={form.ret} onChange={set('ret')} suffix="%" info={`The taxable account earns ${percent((1 - TAXABLE_DRAG) * 100, 0)} of this after tax drag.`} />
              <NumberField label="State income tax rate" value={form.state} onChange={set('state')} suffix="%" />
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
              meta={ready ? `Age ${startAge} to ${inputs.endAge} · ${form.filing === 'single' ? 'single' : 'MFJ'} · RMDs from ${rmdAge} · ${label}` : 'Enter a year of birth and a pre-tax balance'}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={`After-tax family wealth at ${inputs.endAge} — ${hasPlan ? 'plan vs. do nothing' : 'as entered'}`}
              value={hasPlan ? `${r.delta >= 0 ? '+' : '−'}${money(Math.abs(r.delta))}` : money(none.familyWealth)}
              note={hasPlan ? `${money(plan.familyWealth)} with the plan · ${money(none.familyWealth)} doing nothing` : `Choose a conversion approach to compare against doing nothing`}
            />
            <StatTiles
              items={[
                { label: 'Lifetime tax paid', value: money(plan.lifetimeTax), note: hasPlan ? `vs. ${money(none.lifetimeTax)} doing nothing` : 'through the end of the plan' },
                { label: `Heirs’ tax at ${inputs.endAge}`, value: money(plan.heirsTax), tone: plan.heirsTax < none.heirsTax ? 'good' : undefined, note: hasPlan ? `vs. ${money(none.heirsTax)} doing nothing` : `${percent(inputs.beneficiaryRate * 100, 0)} on what is pre-tax` },
                { label: 'Converted in total', value: money(plan.totalConverted), note: hasPlan ? `Roth at ${inputs.endAge}: ${money(plan.endRoth)}` : 'no conversions' },
              ]}
            />

            <Narrative>
              {ready ? (
                <>
                  Born in {birthYear}, the client is {startAge} and must start RMDs at {rmdAge}.
                  {' '}
                  {hasPlan
                    ? `${form.mode === 'fill' ? `Filling the ${form.fillBracket}% bracket each year through age ${inputs.fillUntilAge}` : `Converting ${money(inputs.flatAmount)} a year for ${inputs.flatYears} years`} moves ${money(plan.totalConverted)} to Roth and raises lifetime tax by ${money(r.taxDelta)}, from ${money(none.lifetimeTax)} to ${money(plan.lifetimeTax)}. In return, the pre-tax balance at ${inputs.endAge} falls from ${money(none.endPretax)} to ${money(plan.endPretax)}, so the heirs’ tax bill at ${percent(inputs.beneficiaryRate * 100, 0)} drops from ${money(none.heirsTax)} to ${money(plan.heirsTax)}. After everyone’s tax, the family keeps ${money(plan.familyWealth)} with the plan against ${money(none.familyWealth)} doing nothing — ${better ? 'ahead' : 'behind'} by ${money(Math.abs(r.delta))}.`
                    : `Doing nothing, RMDs begin at ${rmdAge} and lifetime tax through ${inputs.endAge} is ${money(none.lifetimeTax)}. The ${money(none.endPretax)} still pre-tax at ${inputs.endAge} would cost the heirs ${money(none.heirsTax)} at ${percent(inputs.beneficiaryRate * 100, 0)}, leaving the family ${money(none.familyWealth)}.`}
                </>
              ) : (
                'Enter the year of birth, the balances, and income. The plan compares Roth conversions against doing nothing, through the end of the plan and into the heirs’ hands.'
              )}
            </Narrative>

            <ScenarioCards
              sub={`at age ${inputs.endAge}, after all tax`}
              scenarios={[
                { label: 'Do nothing', value: money(none.familyWealth), best: hasPlan && !better, rows: [{ label: 'Lifetime tax', value: money(none.lifetimeTax) }, { label: 'Still pre-tax', value: money(none.endPretax) }, { label: 'Heirs’ tax', value: money(none.heirsTax) }, { label: 'Roth', value: money(none.endRoth) }] },
                { label: hasPlan ? label : 'With a plan', value: hasPlan ? money(plan.familyWealth) : '—', best: hasPlan && better, rows: [{ label: 'Lifetime tax', value: hasPlan ? money(plan.lifetimeTax) : '—' }, { label: 'Still pre-tax', value: hasPlan ? money(plan.endPretax) : '—' }, { label: 'Heirs’ tax', value: hasPlan ? money(plan.heirsTax) : '—' }, { label: 'Roth', value: hasPlan ? money(plan.endRoth) : '—' }] },
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
                <thead><tr><th>Year</th><th>Age</th><th className="num">RMD</th><th className="num">Conversion</th><th className="num">Taxable income</th><th className="num">Bracket</th><th className="num">Tax</th><th className="num">Pre-tax</th><th className="num">Roth</th></tr></thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr key={row.t} className={row.conversion > 0 ? 'is-conv' : undefined}>
                      <td>{row.year}</td><td>{row.age}</td>
                      <td className="num">{row.rmd ? money(row.rmd) : '—'}</td>
                      <td className="num">{row.conversion ? money(row.conversion) : '—'}</td>
                      <td className="num">{money(row.taxable)}</td>
                      <td className="num">{percent(row.marginal * 100, 0)}</td>
                      <td className="num">{money(row.tax)}</td>
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

      <Note title="Reading the result">
        The comparison that matters is the family’s after-tax wealth at the end of the plan, not the tax paid this year. Converting costs tax now at the client’s rate; not converting leaves a larger pre-tax balance that the heirs must empty within ten years at their rate, often while they are still working and in a higher bracket. Filling a bracket each year before RMDs begin is the usual sweet spot: the years between retirement and Social Security, and again before the RMD age, are where the low-bracket room lives. Watch the two lines cross.
      </Note>

      <Assumptions
        items={[
          `${TAX_YEAR} federal brackets, standard deduction, and senior deduction (65+, through 2028). With indexing on, brackets, deduction, Social Security, pension, and other income grow with inflation each year; with it off, the ${TAX_YEAR} tables are held flat.`,
          'RMDs begin at 73 for clients born 1951–1959 and 75 for those born 1960 or later, using the IRS Uniform Lifetime Table on the prior year-end balance. RMDs cannot be converted; conversions come on top of the RMD.',
          'Social Security is taxed through the provisional-income test each year; wages stop at the retirement age entered.',
          'Fill-a-bracket conversions are sized so taxable income reaches the top of the chosen bracket after Social Security taxation and the senior deduction phase-out, limited by the pre-tax balance.',
          `All accounts earn the same return; the taxable account is reduced by a ${percent(TAXABLE_DRAG * 100, 0)} tax drag. Tax is paid from the taxable account first, then withheld from the conversion (which reduces what reaches the Roth; the gross-up on withheld tax is not modeled).`,
          'The heirs’ tax applies the beneficiary rate to the pre-tax balance at the end of the plan, as if withdrawn under the 10-year rule; the growth during those ten years and the heirs’ own bracket creep are not modeled. Roth and taxable balances pass without income tax (the taxable account gets a basis step-up).',
          'IRMAA, capital gains, itemized deductions, QCDs, and estate tax are not modeled. State tax is a flat rate on taxable income.',
          'Baseline model. Not reviewed by Grott Luker & Co.',
        ]}
      />
    </ToolShell>
  )
}
