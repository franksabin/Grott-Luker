import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
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
import { ordinaryTax, STANDARD_DEDUCTION, TAX_YEAR } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const YEARS = [
  { value: '2', label: '2 years' },
  { value: '3', label: '3 years' },
]

const QCD_LIMIT = 108000 // per person, 2025 (indexed)
const SALT_CAP = 10000

const BLANK = {
  filing: 'married',
  income: '',
  annualGiving: '',
  saltPaid: '',
  mortgageInterest: '',
  otherItemized: '',
  age: '',
  rmd: '',
  bunchYears: '2',
}

const SAMPLE = {
  filing: 'married',
  income: '240000',
  annualGiving: '18000',
  saltPaid: '14000',
  mortgageInterest: '9500',
  otherItemized: '0',
  age: '72',
  rmd: '32000',
  bunchYears: '2',
}

function compute(form) {
  const filing = form.filing === 'single' ? 'single' : 'married'
  const income = toNumber(form.income)
  const giving = toNumber(form.annualGiving)
  const salt = Math.min(SALT_CAP, toNumber(form.saltPaid))
  const mortgage = toNumber(form.mortgageInterest)
  const otherItem = toNumber(form.otherItemized)
  const age = toNumber(form.age)
  const rmd = toNumber(form.rmd)
  const N = Math.max(2, Math.min(3, Math.round(toNumber(form.bunchYears) || 2)))
  const std = STANDARD_DEDUCTION[filing]
  const otherItemized = salt + mortgage + otherItem

  const taxWith = (ded, incomeAdj = income) => ordinaryTax(Math.max(0, incomeAdj - ded), filing)
  const baseTax = taxWith(std) // no giving at all, standard deduction

  // A. Give the same amount every year.
  const dedAnnual = Math.max(std, otherItemized + giving)
  const taxAnnual = taxWith(dedAnnual)
  const savedAnnual = (baseTax - taxAnnual) * N
  const itemizesAnnually = otherItemized + giving > std

  // B. Bunch N years of giving into year 1 (e.g., fund a donor-advised fund), standard deduction after.
  const dedBunchY1 = Math.max(std, otherItemized + giving * N)
  const dedOff = Math.max(std, otherItemized)
  const taxBunch = taxWith(dedBunchY1) + taxWith(dedOff) * (N - 1)
  const savedBunch = baseTax * N - taxBunch

  // C. Qualified charitable distribution (70½+): giving comes out of the IRA before AGI.
  const qcdEligible = age >= 70.5
  const qcdAmt = qcdEligible ? Math.min(giving, QCD_LIMIT, rmd > 0 ? rmd : giving) : 0
  const remainderGift = giving - qcdAmt
  const dedQcd = Math.max(std, otherItemized + remainderGift)
  const taxQcd = qcdEligible ? taxWith(dedQcd, income - qcdAmt) : null
  const savedQcd = qcdEligible ? (baseTax - taxQcd) * N : null

  const options = [
    { id: 'annual', label: 'Give annually', saved: savedAnnual, tone: TONE.navy, note: itemizesAnnually ? 'Itemizes each year' : 'Standard deduction each year — gifts add no deduction' },
    { id: 'bunch', label: `Bunch ${N} years (DAF)`, saved: savedBunch, tone: TONE.accent, note: `Itemize year 1 (${money(dedBunchY1)}), standard after` },
    ...(qcdEligible ? [{ id: 'qcd', label: 'QCD from IRA', saved: savedQcd, tone: TONE.debt, note: `${money(qcdAmt)} per year excluded from income` }] : []),
  ]
  const best = options.reduce((a, b) => (b.saved > a.saved ? b : a), options[0])
  const marginal = (() => {
    const t1 = taxWith(std); const t2 = taxWith(std + 1000); return (t1 - t2) / 1000
  })()

  return { filing, income, giving, salt, otherItemized, std, N, age, rmd, baseTax,
    dedAnnual, taxAnnual, savedAnnual, itemizesAnnually, dedBunchY1, dedOff, taxBunch, savedBunch,
    qcdEligible, qcdAmt, remainderGift, savedQcd, options, best, marginal, totalGiving: giving * N }
}

export default function CharitableGiving() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Other itemized deductions', formula: `SALT ${money(r.salt, 2)} (capped) + mortgage interest + other`, result: money(r.otherItemized, 2) },
    { label: 'Baseline tax (no gifts, standard deduction)', formula: `tax(${money(r.income, 2)} − ${money(r.std, 2)})`, result: money(r.baseTax, 2) },
    { label: 'A · Give annually — deduction', formula: `max(standard ${money(r.std, 2)}, ${money(r.otherItemized, 2)} + ${money(r.giving, 2)})`, result: money(r.dedAnnual, 2) },
    { label: 'A · Tax saved over the window', formula: `(${money(r.baseTax, 2)} − tax(income − ${money(r.dedAnnual, 2)})) × ${r.N}`, result: money(r.savedAnnual, 2) },
    { label: `B · Bunch ${r.N} years — year-1 deduction`, formula: `max(${money(r.std, 2)}, ${money(r.otherItemized, 2)} + ${r.N} × ${money(r.giving, 2)})`, result: money(r.dedBunchY1, 2) },
    { label: 'B · Off-year deduction', formula: `max(${money(r.std, 2)}, ${money(r.otherItemized, 2)})`, result: money(r.dedOff, 2) },
    { label: 'B · Tax saved over the window', formula: `${r.N} × ${money(r.baseTax, 2)} − [tax(year 1) + ${r.N - 1} × tax(off-year)]`, result: money(r.savedBunch, 2) },
    ...(r.qcdEligible ? [
      { label: 'C · QCD amount per year', formula: `min(giving ${money(r.giving, 2)}, RMD ${money(r.rmd, 2)}, limit ${money(QCD_LIMIT)})`, result: money(r.qcdAmt, 2) },
      { label: 'C · Tax saved over the window', formula: `(${money(r.baseTax, 2)} − tax(${money(r.income - r.qcdAmt, 2)} − deduction)) × ${r.N}`, result: money(r.savedQcd, 2), note: 'The QCD is excluded from income before AGI; the standard deduction still applies.' },
    ] : [{ label: 'C · QCD', formula: `age ${r.age || '—'} < 70½`, result: 'not available' }]),
    { label: 'Best route', formula: 'largest tax saved', result: r.best.label },
  ], [r])

  return (
    <ToolShell
      title="Charitable Giving Optimizer"
      subtitle="Same gifts, different tax result. Compare giving every year against bunching several years into one (often through a donor-advised fund), and — for clients 70½ or older — giving directly from an IRA as a qualified charitable distribution."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Client">
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            <MoneyField label="Adjusted gross income (before any gifts)" value={form.income} onChange={set('income')} />
            <div className="field-row">
              <NumberField label="Age" value={form.age} onChange={set('age')} info="Qualified charitable distributions are available from age 70½." />
              <MoneyField label="Annual IRA required distribution" value={form.rmd} onChange={set('rmd')} info="Used to size a QCD. Leave blank if not yet taking RMDs — a QCD can still be made from 70½." />
            </div>
          </Panel>
          <Panel title="Giving & other deductions">
            <MoneyField label="Charitable giving per year" value={form.annualGiving} onChange={set('annualGiving')} />
            <div className="field-row">
              <MoneyField label="State & local taxes paid" value={form.saltPaid} onChange={set('saltPaid')} hint={`Capped at ${money(SALT_CAP)}`} />
              <MoneyField label="Mortgage interest" value={form.mortgageInterest} onChange={set('mortgageInterest')} />
            </div>
            <div className="field-row">
              <MoneyField label="Other itemized deductions" value={form.otherItemized} onChange={set('otherItemized')} info="Deductible medical above the AGI floor, etc." />
              <SelectField label="Bunching window" value={form.bunchYears} onChange={set('bunchYears')} options={YEARS} />
            </div>
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="Charitable Giving Comparison" meta={`${r.N}-year view · ${money(r.totalGiving)} given either way`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label={`Most tax saved over ${r.N} years`}
              value={money(r.best.saved)}
              note={`${r.best.label} · vs. ${money(r.savedAnnual)} giving annually`}
            />
            <Narrative>
              Other itemized deductions total {money(r.otherItemized)} against a {money(r.std)} standard deduction, so{' '}
              {r.itemizesAnnually
                ? `giving ${money(r.giving)} a year does push the client over the standard deduction each year.`
                : `giving ${money(r.giving)} a year never clears the standard deduction — the gifts produce no tax benefit at all when spread out.`}{' '}
              Bunching {r.N} years of gifts into one year creates a {money(r.dedBunchY1)} deduction in that year and the standard deduction after, saving about {money(r.savedBunch)} over the window.
              {r.qcdEligible
                ? ` Because the client is ${r.age}, a qualified charitable distribution of ${money(r.qcdAmt)} a year comes straight out of the IRA before income is counted — worth about ${money(r.savedQcd)} over ${r.N} years, and it keeps the standard deduction intact.`
                : ' Qualified charitable distributions become available at 70½ and are often the strongest route once RMDs begin.'}
            </Narrative>

            <div className="chart-block" style={{ marginTop: 6 }}>
              <BarCompare height={170} groups={r.options.map((o) => ({ label: o.label, bars: [{ label: 'Tax saved', value: Math.max(0, o.saved), color: o.tone }] }))} />
            </div>

            <div className="result-list">
              {r.options.map((o) => (
                <ResultRow key={o.id} label={`${o.label} — ${o.note}`} value={o.saved} total={o.id === r.best.id} positive={o.id === r.best.id} />
              ))}
              <ResultRow label={`Marginal rate used (approx.)`} raw={percent(r.marginal * 100, 0)} sub />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the result">
        Bunching helps when itemized deductions hover near the standard deduction. A donor-advised fund lets the client take the deduction in the bunching year and still grant to charities on their usual schedule. A QCD counts toward the RMD, never touches AGI (which also helps IRMAA and Social Security taxation), and does not require itemizing — for most clients past 70½ it beats both other routes.
      </Note>

      <Assumptions
        items={[
          `${TAX_YEAR} federal brackets and standard deduction; state tax not modeled.`,
          'Gifts are assumed to be cash to public charities within AGI limits; appreciated securities (which add avoided capital gains) are not modeled here.',
          `QCD limited to the lesser of giving, the annual RMD entered, and ${money(QCD_LIMIT)} per person; married clients may each make a QCD from their own IRA.`,
          'Income is held constant across the window; the tax saved is the difference from a no-giving, standard-deduction baseline.',
          'The additional 0.5% AGI floor on itemized charitable deductions and the 35% cap on the value of itemized deductions for top-bracket taxpayers (effective 2026) are not yet modeled.',
        ]}
      />
    </ToolShell>
  )
}
