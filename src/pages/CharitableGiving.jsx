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
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ordinaryTax, STANDARD_DEDUCTION, TAX_YEAR, saltCap, CHARITY_AGI_FLOOR, NONITEMIZER_CHARITY, itemizedAfterCap, seniorDeduction } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const YEARS = [
  { value: '2', label: '2 years' },
  { value: '3', label: '3 years' },
]

const SENIOR_START = { single: 75000, married: 150000 }
const QCD_LIMIT = 111000 // per person, 2026 (IRS Notice 2025-67; indexed)

// The refine-panel inputs (SALT, mortgage, other itemized, bunching window) carry
// defaults so the tool computes without the panel being opened.
const BLANK = {
  filing: 'married',
  income: '',
  annualGiving: '',
  saltPaid: '0',
  mortgageInterest: '0',
  otherItemized: '0',
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
  const saltPaid = toNumber(form.saltPaid)
  const mortgage = toNumber(form.mortgageInterest)
  const otherItem = toNumber(form.otherItemized)
  const age = toNumber(form.age)
  const rmd = toNumber(form.rmd)
  const N = Math.max(2, Math.min(3, Math.round(toNumber(form.bunchYears) || 2)))
  const std = STANDARD_DEDUCTION[filing]
  const seniors = age >= 65 ? 1 : 0

  // Deductions and tax for one year, given the cash gifts made that year and
  // the AGI for that year (a QCD lowers AGI). Applies the 2026 rules: SALT cap
  // with phase-down, 0.5%-of-AGI floor on itemized charitable gifts, the §68
  // 35-cent cap for top-bracket filers, the non-itemizer charitable deduction,
  // and the senior deduction.
  const year = (gifts, agi = income) => {
    const cap = saltCap(agi)
    const salt = Math.min(cap, saltPaid)
    const floor = CHARITY_AGI_FLOOR * agi
    const charitable = Math.max(0, gifts - floor)
    const itemizedRaw = salt + mortgage + otherItem + charitable
    const senior = seniorDeduction(agi, filing, seniors)
    const taxableIfItemizing = Math.max(0, agi - itemizedRaw - senior)
    const { allowed: itemized, reduction: capReduction } = itemizedAfterCap(itemizedRaw, taxableIfItemizing, filing)
    const nonItemizer = Math.min(gifts, NONITEMIZER_CHARITY[filing])
    const itemizes = itemized > std + nonItemizer
    const deduction = (itemizes ? itemized : std + nonItemizer) + senior
    const tax = ordinaryTax(Math.max(0, agi - deduction), filing)
    return { agi, cap, salt, floor, charitable, itemizedRaw, itemized, capReduction, nonItemizer, senior, itemizes, deduction, tax }
  }

  const base = year(0) // no giving at all
  const baseTax = base.tax

  // A. Give the same amount every year.
  const annual = year(giving)
  const savedAnnual = (baseTax - annual.tax) * N

  // B. Bunch N years of giving into year 1 (e.g., fund a donor-advised fund).
  const bunchY1 = year(giving * N)
  const off = year(0)
  const taxBunch = bunchY1.tax + off.tax * (N - 1)
  const savedBunch = baseTax * N - taxBunch

  // C. Qualified charitable distribution (70½+): comes out of the IRA before AGI.
  const qcdEligible = age >= 70.5
  const qcdAmt = qcdEligible ? Math.min(giving, QCD_LIMIT, rmd > 0 ? rmd : giving) : 0
  const remainderGift = giving - qcdAmt
  const qcd = qcdEligible ? year(remainderGift, income - qcdAmt) : null
  const savedQcd = qcdEligible ? (baseTax - qcd.tax) * N : null

  const options = [
    { id: 'annual', label: 'Give annually', saved: savedAnnual, tone: TONE.navy, note: annual.itemizes ? 'Itemizes each year' : `Standard deduction each year — only the ${money(annual.nonItemizer)} non-itemizer deduction applies` },
    { id: 'bunch', label: `Bunch ${N} years (DAF)`, saved: savedBunch, tone: TONE.accent, note: `Itemize year 1 (${money(bunchY1.deduction)}), standard after` },
    ...(qcdEligible ? [{ id: 'qcd', label: 'QCD from IRA', saved: savedQcd, tone: TONE.debt, note: `${money(qcdAmt)} per year excluded from income` }] : []),
  ]
  const best = options.reduce((a, b) => (b.saved > a.saved ? b : a), options[0])
  const marginal = (() => {
    const t1 = ordinaryTax(Math.max(0, income - std), filing); const t2 = ordinaryTax(Math.max(0, income - std - 1000), filing); return (t1 - t2) / 1000
  })()

  return { filing, income, giving, std, N, age, rmd, baseTax, base, annual, savedAnnual, itemizesAnnually: annual.itemizes,
    bunchY1, off, taxBunch, savedBunch, qcdEligible, qcdAmt, remainderGift, qcd, savedQcd, options, best, marginal,
    totalGiving: giving * N, dedAnnual: annual.deduction, dedBunchY1: bunchY1.deduction, otherItemized: annual.salt + mortgage + otherItem, salt: annual.salt, saltCapApplied: annual.cap }
}

export default function CharitableGiving() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'SALT cap for this income', formula: `$40,400 − 30% × max(0, AGI ${money(r.income, 2)} − $505,000), floor $10,000`, result: money(r.saltCapApplied, 2) },
    { label: 'Charitable floor', formula: `0.5% × AGI ${money(r.income, 2)} (only gifts above this are deductible when itemizing)`, result: money(r.annual.floor, 2) },
    ...(r.age >= 65 ? [{ label: 'Senior deduction', formula: `$6,000 − 6% × max(0, AGI − ${money(SENIOR_START[r.filing])})`, result: money(r.annual.senior, 2) }] : []),
    { label: 'Baseline tax (no gifts)', formula: `${TAX_YEAR} brackets on AGI − deduction ${money(r.base.deduction, 2)}`, result: money(r.baseTax, 2) },
    { label: 'A · Give annually — itemized deductions', formula: `SALT ${money(r.annual.salt, 2)} + mortgage + other + (gifts ${money(r.giving, 2)} − floor ${money(r.annual.floor, 2)})${r.annual.capReduction > 0 ? ` − §68 top-bracket haircut ${money(r.annual.capReduction, 2)}` : ''}`, result: money(r.annual.itemized, 2) },
    { label: 'A · Deduction used', formula: r.annual.itemizes ? 'itemized exceeds standard + non-itemizer gift deduction' : `standard ${money(r.std, 2)} + non-itemizer gift deduction ${money(r.annual.nonItemizer, 2)}`, result: money(r.annual.deduction, 2) },
    { label: 'A · Tax saved over the window', formula: `(${money(r.baseTax, 2)} − ${money(r.annual.tax, 2)}) × ${r.N}`, result: money(r.savedAnnual, 2) },
    { label: `B · Bunch ${r.N} years — year-1 itemized`, formula: `SALT + mortgage + other + (${r.N} × ${money(r.giving, 2)} − floor)${r.bunchY1.capReduction > 0 ? ` − §68 haircut ${money(r.bunchY1.capReduction, 2)}` : ''}`, result: money(r.bunchY1.itemized, 2) },
    { label: 'B · Year-1 deduction · off-year deduction', formula: 'larger of itemized or standard, each year', result: `${money(r.bunchY1.deduction, 2)} · ${money(r.off.deduction, 2)}` },
    { label: 'B · Tax saved over the window', formula: `${r.N} × ${money(r.baseTax, 2)} − [${money(r.bunchY1.tax, 2)} + ${r.N - 1} × ${money(r.off.tax, 2)}]`, result: money(r.savedBunch, 2) },
    ...(r.qcdEligible ? [
      { label: 'C · QCD amount per year', formula: `min(giving ${money(r.giving, 2)}, RMD ${money(r.rmd, 2)}, limit ${money(QCD_LIMIT)})`, result: money(r.qcdAmt, 2) },
      { label: 'C · AGI after QCD · deduction', formula: `${money(r.income, 2)} − ${money(r.qcdAmt, 2)} · remaining gifts ${money(r.remainderGift, 2)} run through the same rules`, result: `${money(r.qcd.agi, 2)} · ${money(r.qcd.deduction, 2)}` },
      { label: 'C · Tax saved over the window', formula: `(${money(r.baseTax, 2)} − ${money(r.qcd.tax, 2)}) × ${r.N}`, result: money(r.savedQcd, 2), note: 'A QCD is never subject to the 0.5% floor or the §68 haircut, and lowering AGI can also raise the SALT cap.' },
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
            <MoneyField label="Charitable giving per year" value={form.annualGiving} onChange={set('annualGiving')} />
            <div className="field-row">
              <NumberField label="Age" value={form.age} onChange={set('age')} info="Qualified charitable distributions are available from age 70½. At 65+ the $6,000 senior deduction (2025–2028) is applied." />
              <MoneyField label="Annual IRA required distribution" value={form.rmd} onChange={set('rmd')} info="Used to size a QCD. Leave blank if not yet taking RMDs — a QCD can still be made from 70½." />
            </div>
          </Panel>
          <RefinePanel summary="other itemized deductions, bunching window">
            <div className="field-row">
              <MoneyField label="State & local taxes paid" value={form.saltPaid} onChange={set('saltPaid')} hint={`2026 cap ${money(r.saltCapApplied)} at this income`} />
              <MoneyField label="Mortgage interest" value={form.mortgageInterest} onChange={set('mortgageInterest')} />
            </div>
            <div className="field-row">
              <MoneyField label="Other itemized deductions" value={form.otherItemized} onChange={set('otherItemized')} info="Deductible medical above the AGI floor, etc." />
              <PillField label="Bunching window" value={form.bunchYears} onChange={set('bunchYears')} options={YEARS} />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="Charitable Giving Comparison" meta={`${r.N}-year view · ${money(r.totalGiving)} given either way`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label={`Most tax saved over ${r.N} years`}
              value={money(r.best.saved)}
              note={`${r.best.label} · vs. ${money(r.savedAnnual)} giving annually`}
            />
            <StatTiles
              items={[
                { label: 'Extra saved vs. giving annually', value: `+${money(r.best.saved - r.savedAnnual)}`, tone: 'good', note: r.best.label },
                { label: 'Year-1 deduction if bunched', value: money(r.dedBunchY1), note: `vs. ${money(r.std)} standard` },
                { label: `Given over ${r.N} years`, value: money(r.totalGiving), note: 'either way' },
              ]}
            />
            <div className="result-list">
              {r.options.map((o) => (
                <ResultRow key={o.id} label={`${o.label} — ${o.note}`} value={o.saved} total={o.id === r.best.id} positive={o.id === r.best.id} />
              ))}
              <ResultRow label={`Marginal rate used (approx.)`} raw={percent(r.marginal * 100, 0)} sub />
            </div>
            <Narrative>
              Other itemized deductions total {money(r.otherItemized)} (SALT capped at {money(r.saltCapApplied)}) against a {money(r.std)} standard deduction, and only gifts above the {money(r.annual.floor)} floor (0.5% of AGI) count when itemizing, so{' '}
              {r.itemizesAnnually
                ? `giving ${money(r.giving)} a year does push the client over the standard deduction each year.`
                : `giving ${money(r.giving)} a year never clears the standard deduction — spread out, the gifts earn only the ${money(r.annual.nonItemizer)} non-itemizer deduction.`}{' '}
              Bunching {r.N} years of gifts into one year creates a {money(r.dedBunchY1)} deduction in that year and the standard deduction after, saving about {money(r.savedBunch)} over the window.
              {r.qcdEligible
                ? ` Because the client is ${r.age}, a qualified charitable distribution of ${money(r.qcdAmt)} a year comes straight out of the IRA before income is counted — worth about ${money(r.savedQcd)} over ${r.N} years, and it keeps the standard deduction intact.`
                : ' Qualified charitable distributions become available at 70½ and are often the strongest route once RMDs begin.'}
            </Narrative>

            <ScenarioCards
              sub={`tax saved over ${r.N} years`}
              scenarios={r.options.map((o) => ({
                label: o.label,
                value: money(o.saved),
                best: o.id === r.best.id,
                rows:
                  o.id === 'annual'
                    ? [
                        { label: 'Deduction each year', value: money(r.dedAnnual) },
                        { label: 'Itemizes', value: r.itemizesAnnually ? 'Yes' : 'No' },
                      ]
                    : o.id === 'bunch'
                      ? [
                          { label: 'Year-1 deduction', value: money(r.dedBunchY1) },
                          { label: 'Off-year deduction', value: money(r.off.deduction) },
                        ]
                      : [
                          { label: 'Excluded from income', value: `${money(r.qcdAmt)} / yr` },
                          { label: 'Deduction each year', value: money(r.qcd.deduction) },
                        ],
              }))}
            />

            <div className="chart-block" style={{ marginTop: 6 }}>
              <BarCompare height={170} groups={r.options.map((o) => ({ label: o.label, bars: [{ label: 'Tax saved', value: Math.max(0, o.saved), color: o.tone }] }))} />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the result">
        Bunching helps when itemized deductions hover near the standard deduction. A donor-advised fund lets the client take the deduction in the bunching year and still grant to charities on their usual schedule. A QCD counts toward the RMD, never touches AGI (which also helps IRMAA and Social Security taxation), and does not require itemizing — for most clients past 70½ it beats both other routes.
      </Note>

      <Panel title="Donor-advised fund vs. giving from the IRA (QCD)" style={{ marginTop: 18 }}>
        <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 14 }}>
          The two routes work differently. A DAF is a <em>deduction</em>: it only helps if the client itemizes. A QCD is an <em>exclusion</em>: the money leaves the IRA and is never counted as income, so it works whether or not the client itemizes and it satisfies the RMD dollar for dollar.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Donor-advised fund</th>
              <th>QCD from an IRA</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Who can use it', 'Anyone', 'IRA owners 70½ or older (not from a 401(k) or an active SEP/SIMPLE)'],
              ['How the tax benefit works', 'Itemized deduction in the year funded; nothing if the client takes the standard deduction', `Excluded from income; no deduction needed. Up to ${money(QCD_LIMIT)} per person per year`],
              ['Effect on the RMD', 'None — the RMD is still taxable income', 'Counts toward the RMD; the distribution is not taxed'],
              ['Effect on AGI', 'None — AGI is unchanged, only taxable income falls', 'Lowers AGI, which can reduce IRMAA surcharges, Social Security taxation, and the 0.5% charitable floor'],
              ['Appreciated stock', 'Yes — deduct fair value and avoid the capital gain; the strongest DAF use', 'No — QCDs are cash from the IRA only'],
              ['Timing of the gift to charity', 'Deduct now, grant to charities over years', 'Goes directly to the charity in the year made; a DAF cannot receive a QCD'],
              ['Best fit', 'Under 70½, or itemizing anyway, or holding appreciated securities', '70½ or older with an RMD the client does not need for spending'],
            ].map(([k, a, b]) => (
              <tr key={k}>
                <td style={{ fontWeight: 600 }}>{k}</td>
                <td>{a}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: '12px 0 0', color: 'var(--ink-soft)', fontSize: 13 }}>
          {r.qcdEligible
            ? `For this client, a QCD of ${money(r.qcdAmt)} a year against a ${money(r.rmd)} RMD is modeled above; any giving beyond the QCD can still be bunched through a DAF.`
            : 'This client is under 70½, so the QCD column is not yet available; the DAF route (bunching) is the relevant comparison until then. Deductible IRA contributions after age 70½ reduce future QCD exclusions dollar for dollar.'}
        </p>
      </Panel>

      <Assumptions
        items={[
          `${TAX_YEAR} federal brackets and standard deduction; state tax not modeled.`,
          '2026 law changes modeled: SALT cap of $40,400 phased down 30% of AGI over $505,000 (floor $10,000); itemized charitable gifts deductible only above 0.5% of AGI; itemized deductions limited to a 35% benefit for 37%-bracket filers (§68); $1,000 / $2,000 cash-gift deduction for non-itemizers; $6,000 senior deduction at 65+ (one person, phased out 6% of AGI over $75k / $150k).',
          'Gifts are assumed to be cash to public charities within AGI limits (the non-itemizer deduction is cash-only); appreciated securities (which add avoided capital gains) are not modeled here.',
          `QCD limited to the lesser of giving, the annual RMD entered, and ${money(QCD_LIMIT)} per person; married clients may each make a QCD from their own IRA.`,
          'Income is held constant across the window; the tax saved is the difference from a no-giving, standard-deduction baseline.',
        ]}
      />
    </ToolShell>
  )
}
