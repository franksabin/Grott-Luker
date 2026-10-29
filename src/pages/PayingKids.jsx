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
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, LineChart, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent, number } from '../lib/format.js'
import { ordinaryTax, STANDARD_DEDUCTION, TAX_YEAR, SS_WAGE_BASE } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'
import { computeKids as compute, IRA_LIMIT, FUTA_BASE, ROTH_DEFAULTS } from '../lib/payingKids.js'

const ENTITY = [
  { value: 'soleprop', label: 'Sole proprietor / spouses’ partnership' },
  { value: 'scorp', label: 'S-corporation' },
  { value: 'ccorp', label: 'C-corporation' },
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
const SE_BASE = [
  { value: 'below', label: 'Under about $200,000' },
  { value: 'above', label: 'About $200,000 or more' },
]

const QBI_OPTIONS = [
  { value: 'yes', label: 'Yes, the full 20%' },
  { value: 'no', label: 'No' },
]

const blankKid = (i) => ({ id: `k${i}`, age: '', hours: '', rate: '' })

// Roth projections run 40+ years at one steady rate, so show them to the nearest $100: exact digits would imply a precision the assumption cannot support.
const about = (v) => money(Math.round(v / 100) * 100)
// 0.07 → "7%", 0.025 → "2.5%".
const pct = (v) => `${+(v * 100).toFixed(2)}%`

const BLANK = {
  entity: 'soleprop',
  bracket: '32',
  state: 'NH',
  planMinAge: '21',
  seBase: 'below',
  qbi: 'yes',
  ...ROTH_DEFAULTS,
  kids: [blankKid(1), blankKid(2), blankKid(3)],
}
const SAMPLE = {
  entity: 'soleprop',
  bracket: '32',
  state: 'NH',
  planMinAge: '21',
  seBase: 'above',
  qbi: 'no', // a 32% sole proprietor with about $200,000 of profit is usually above the QBI threshold
  ...ROTH_DEFAULTS,
  kids: [
    { id: 'k1', age: '17', hours: '500', rate: '16' },
    { id: 'k2', age: '15', hours: '400', rate: '15' },
    blankKid(3),
  ],
}

// ?sample=1 wins (ToolShell also applies it); in dev, ?state=<base64 JSON> merges over BLANK
// (a test hook, dead code in a production build).
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

export default function PayingKids() {
  const [form, setForm] = useState(initialForm)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const setKid = (id, key) => (v) => setForm((f) => ({ ...f, kids: f.kids.map((k) => (k.id === id ? { ...k, [key]: v } : k)) }))
  const r = useMemo(() => compute(form), [form])
  // Which child the Roth chart follows when there are several; clamped so removing a child never leaves it dangling.
  const [chartKid, setChartKid] = useState('0')

  const steps = useMemo(() => [
    ...r.kids.map((k, i) => ({ label: `Child ${i + 1} (age ${k.age}) wages`, formula: `${form.kids.find((x) => x.id === k.id).hours} hours × ${money(toNumber(form.kids.find((x) => x.id === k.id).rate), 2)}`, result: money(k.wages, 2) })),
    { label: 'Owner income tax saved', formula: `(${money(r.wages, 2)}${r.entity === 'soleprop' ? ` − ½ × ${money(r.ownerSe, 2)} SE tax saved` : ''}) × ${percent(r.ownerFed * 100, 0)} federal${r.qbiShare ? ' × (1 − 20% QBI deduction)' : ''} + ${money(r.wages, 2)} × ${percent(r.st.wage, 1)} ${r.st.name}`, result: money(r.ownerIncomeTax, 2) },
    ...(r.entity === 'soleprop' ? [{
      label: 'Owner self-employment tax saved',
      formula: r.seAbove
        ? `${money(r.wages, 2)} × 92.35% × 3.8% (2.9% Medicare + 0.9% Additional Medicare; net profit of about $200,000 or more puts the owner above the ${money(SS_WAGE_BASE)} Social Security wage base)`
        : `${money(r.wages, 2)} × 92.35% × 15.3% (net profit under about $200,000 keeps the owner below the ${money(SS_WAGE_BASE)} Social Security wage base)`,
      result: money(r.ownerSe, 2),
    }] : []),
    ...r.kids.map((k, i) => ({ label: `Child ${i + 1} income tax`, formula: `${TAX_YEAR} single brackets on max(0, ${money(k.wages, 2)} − ${money(r.std)} standard deduction)${r.stateRate ? ` + ${percent(r.st.wage, 1)} state` : ''}`, result: money(k.childFed + k.childState, 2) })),
    { label: 'Social Security & Medicare on the children’s wages', formula: r.entity === 'soleprop' ? 'exempt under 18 in a parent’s sole proprietorship or spouses’ partnership; 15.3% otherwise' : '15.3% (7.65% employee + 7.65% employer) — a corporation gets no family exemption', result: money(r.fica, 2) },
    { label: 'Federal unemployment (FUTA)', formula: r.entity === 'soleprop' ? 'exempt under 21 in a parent’s business; 0.6% of the first $7,000 otherwise' : '0.6% of the first $7,000 per child', result: money(r.futa, 2) },
    { label: 'Net family tax saved', formula: 'owner taxes saved − children’s income tax − payroll taxes', result: money(r.net, 2) },
    { label: 'Roth IRA room created', formula: `each child: lesser of wages and ${money(IRA_LIMIT)}`, result: money(r.roth, 2) },
    ...r.kids.flatMap((k, i) => {
      const p = k.proj
      if (!p) return []
      return [
        {
          label: `Child ${i + 1} Roth IRA at age ${p.retireAge}`,
          formula: `${money(p.annual)} a year at ages ${k.age}–${p.last} (${p.years} ${p.years === 1 ? 'year' : 'years'}, ${money(p.contributed)} put in), deposited at each year’s end and grown ${pct(p.growth)} a year to age ${p.retireAge}`,
          result: money(p.balance),
        },
        { label: `Child ${i + 1} income at age ${p.retireAge}`, formula: `${money(p.balance)} × ${pct(p.incomeRate)}`, result: money(p.income) },
        { label: `Child ${i + 1} income in today’s dollars`, formula: `${money(p.income)} ÷ (1 + ${pct(p.inflation)})^${p.yearsOut} years`, result: money(p.incomeReal) },
      ]
    }),
  ], [r, form.kids])

  const ready = r.kids.length > 0
  const entityLabel = ENTITY.find((e) => e.value === r.entity)?.label

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  // Same formatter as the screen's ResultRow (money(-x) → "-$X"), so page 1 never mixes minus glyphs.
  const cost = (v) => money(v > 0 ? -v : 0)
  const ficaKids = r.kids.filter((k) => k.fica > 0).length
  // What the headline number assumes, shown beside it on screen and on page 1 of the print.
  const featureNote = [
    `${money(r.wages)} of wages moved from a ${percent(r.ownerFed * 100, 0)} bracket to the children`,
    ...(r.entity === 'soleprop' ? [`owner’s profit ${r.seAbove ? 'about $200,000 or more' : 'under about $200,000'}`] : []),
    r.entity === 'ccorp' ? 'assumes the owner would otherwise have been paid these dollars' : r.qbiShare ? 'assumes the full 20% QBI deduction' : 'no QBI deduction assumed',
  ].join(' · ')
  // Blank-state planning table: hours a child can work before owing income tax, at common rates.
  const headroomRows = [15, 18, 20, 25, 30].map((rate) => [
    `${money(rate, 2)}/hr`,
    `${number(r.std / rate)} hours`,
    `${number(r.std / rate / 50, 1)} hrs/wk`,
    `${number(IRA_LIMIT / rate)} hours`,
  ])
  const assumptions = [
    `${TAX_YEAR} single standard deduction of ${money(STANDARD_DEDUCTION.single)} and ordinary brackets for each child, with no other income; earned income is not subject to the kiddie tax.`,
    `Owner saving is the wages × the owner’s federal bracket plus a flat state rate. A sole proprietor also saves self-employment tax: 15.3% × 92.35% below the Social Security wage base (${money(SS_WAGE_BASE)}), 3.8% × 92.35% above it (net profit of about $200,000 or more is above; you choose). The saving also reflects the deduction for half the self-employment tax and, if you choose it, the 20% QBI deduction, both of which shrink as profit falls (QBI is assumed fully available; above about $200,000 of taxable income single or $400,000 joint it can be limited). Not modeled: the deductible employer share of payroll tax, which raises the saving. For an S- or C-corporation the dollars are assumed to have reached the owner at that bracket; a C-corporation that would have kept them saves only 21%.`,
    'Wages to a child under 18 from a parent’s sole proprietorship, a parents-only partnership, or a single-member LLC without a corporate election (T.D. 9554) are exempt from Social Security and Medicare, and from FUTA under 21; an S- or C-corporation pays 15.3% and FUTA on every employee. Age is entered as one number for the year; wages after an 18th birthday are taxable.',
    `Roth room is the lesser of wages and the ${money(IRA_LIMIT)} limit; anyone may contribute if the child had that much earned income. Earnings are tax-free after five years and age 59½ (or for death, disability or a first home up to $10,000); contributions can be withdrawn at any time; a child under 18 needs a custodial Roth IRA.`,
    `Roth illustration: each year the child puts in the lesser of wages and the limit, from this year through age ${r.rothPlan.stopAge}, at year-end and held flat, at a steady ${pct(r.rothPlan.growth)} with no fees or down years: a what-if, not a forecast. Income is the balance at ${r.rothPlan.retireAge} × ${pct(r.rothPlan.incomeRate)}, a planning rule for about 30 years, not a promise for life. Today’s dollars use ${pct(r.rothPlan.inflation)} inflation.`,
    'The state rate is one flat figure applied above the federal standard deduction, and FUTA assumes the full state unemployment credit. Not modeled: 401(k) service rules, state unemployment, workers’ compensation, payroll fees, the child’s own filing, and New Hampshire’s Business Profits and Business Enterprise Taxes (a profitable NH business also saves BPT on the wages).',
    'Baseline model. Not reviewed by Grott Luker & Co.',
  ]
  const inputs = [
    ['Entity type', entityLabel],
    ['Owner’s federal bracket', percent(r.ownerFed * 100, 0)],
    ['State', r.st.name],
    ['401(k) plan minimum age', `${r.planMinAge} years`],
    ...(r.entity === 'soleprop' ? [['Owner’s net business profit', r.seAbove ? 'about $200,000 or more' : 'under about $200,000']] : []),
    ...(r.entity !== 'ccorp' ? [['QBI deduction', r.qbiShare ? 'full 20% assumed' : 'none assumed']] : []),
    ['Roth: paid through · retire at', `age ${r.rothPlan.stopAge} (at least this year) · ${r.rothPlan.retireAge}`],
    ['Growth · income rate · inflation', `${pct(r.rothPlan.growth)} · ${pct(r.rothPlan.incomeRate)} · ${pct(r.rothPlan.inflation)}`],
    // Only the children that were entered; a blank row says nothing on paper.
    ...r.kids.map((k, i) => [
      `Child ${i + 1}`,
      `age ${k.age} · ${toNumber(k.hours).toLocaleString()} hours × ${money(toNumber(k.rate), 2)}/hr`,
    ]),
  ]
  const narrative = ready ? (
    <>
      Paying {r.kids.length === 1 ? 'one child' : `${r.kids.length} children`} {money(r.wages)} for real work shifts that income out of the owner’s {percent(r.ownerFed * 100, 0)} bracket, saving about {money(r.ownerIncomeTax)} in income tax{r.entity === 'soleprop' ? ` and ${money(r.ownerSe)} in self-employment tax` : ''}.
      {r.entity === 'ccorp' ? ' This assumes those dollars would otherwise have been paid to the owner at that bracket; if the corporation would have kept them, the saving is closer to 21% of the wages.' : ''}
      {' '}
      {r.childFed + r.childState > 0
        ? `The children owe about ${money(r.childFed + r.childState)} on the portion above the ${money(r.std)} standard deduction.`
        : `Each child’s wages sit under the ${money(r.std)} standard deduction, so they owe no income tax.`}
      {' '}
      {r.fica > 0
        ? r.entity === 'soleprop'
          ? `Because ${r.kids.length === 1 ? 'the child is' : ficaKids === 1 ? 'one child is' : `${ficaKids} of the children are`} 18 or older, Social Security and Medicare of ${money(r.fica)} apply to ${ficaKids === 1 ? 'that child’s' : 'their'} wages, which eats into the benefit.`
          : `Because the business is a corporation, Social Security and Medicare of ${money(r.fica)} apply to all of the wages, which eats into the benefit.`
        : 'Under 18 in a parent’s business, the wages are exempt from Social Security and Medicare, so nothing is lost to payroll tax.'}
      {' '}The wages also create {money(r.roth)} of Roth IRA room{r.eligibleKids ? `, and ${r.eligibleKids === 1 ? 'one child meets' : `${r.eligibleKids} children meet`} the plan’s age ${r.planMinAge} minimum for the company 401(k)` : ''}.
    </>
  ) : (
    'Enter a child’s age, hours for the year, and an hourly rate. The estimate updates as you type.'
  )
  // The Roth illustration follows one child at a time; with several children a pill picks which.
  const rothKids = r.kids.filter((k) => k.proj)
  const shown = rothKids[Math.min(Number(chartKid) || 0, rothKids.length - 1)]
  const sp = shown ? shown.proj : null
  const taxFree = !sp || sp.retireAge >= 60 // earnings come out tax free only from age 59½
  const rothMissing = r.kids.filter((k) => !k.proj)
  const shownName = shown ? `Child ${r.kids.indexOf(shown) + 1}` : ''
  const shownLabel = shown ? `${shownName}, age ${shown.age}` : ''
  const axisMoney = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : money(v))
  const rothLine = sp ? (
    <>
      {rothKids.length > 1 ? `${shownName}’s` : 'The child’s'} {money(sp.annual)} a year, put in through age {sp.last}, comes to {money(sp.contributed)}. Growing at {pct(sp.growth)} a year it reaches about {about(sp.balance)} by age {sp.retireAge}. Taking {pct(sp.incomeRate)} of that each year would support about {about(sp.income)} a year{taxFree ? ', tax free,' : ' (before any tax and early-withdrawal penalty)'} or about {about(sp.incomeReal)} in today’s dollars.
      {rothKids.length > 1 ? ` Across the ${rothKids.length} children shown that is about ${about(r.rothIncomeReal)} a year in today’s dollars.` : ''}
    </>
  ) : null
  const rothLineChart = sp ? (
    <LineChart
      xStart={`Age ${sp.age}`}
      xEnd={`Age ${sp.retireAge}`}
      format={axisMoney}
      series={[
        { label: 'Roth IRA balance', color: TONE.net, points: sp.balances },
        { label: 'Total put in', color: TONE.cost, points: sp.contributedSeries },
      ]}
    />
  ) : null
  const printNote = (
    <PrintNote title="Reading the result">
      The work has to be real and age-appropriate, the pay has to match what a stranger would earn for it, and there has to be a record: a timesheet, a written job description, pay through payroll with a W-2, and the money landing in the child’s own account, not back in the parent’s. Paying a six-year-old $16,000 to “model” for the website does not survive. Paying a 15-year-old $6,000 to do bookkeeping and social media on a timesheet does.
    </PrintNote>
  )
  const printInputsCols = (
    <PrintCols>
      <PrintSection title="Inputs used in this estimate">
        <PrintInputs items={inputs} />
      </PrintSection>
      <PrintSection title="Assumptions">
        <PrintAssumptions items={assumptions} />
      </PrintSection>
    </PrintCols>
  )
  const printReport = ready ? (
    <PrintDoc>
      <PrintPage compact>
        <PrintBand
          title="Family Payroll Illustration"
          subtitle="What the family saves when the children are paid for real work, and what payroll tax costs."
          meta={`${entityLabel} · ${r.kids.length} ${r.kids.length === 1 ? 'child' : 'children'} · ${money(r.wages)} in wages`}
          metaRight={today}
        />
        <PrintFeature
          label="Net family tax saved this year"
          value={money(r.net)}
          note={featureNote}
        />
        <PrintTiles
          items={[
            { label: 'Owner taxes saved', value: money(r.ownerIncomeTax + r.ownerSe), note: r.entity === 'soleprop' ? 'income + self-employment tax' : 'income tax on the deduction', best: r.net > 0 },
            { label: 'Taxes the children pay', value: money(r.taxIfKidsPaid), note: 'income + payroll' },
            { label: 'Roth IRA room created', value: money(r.roth), note: `up to ${money(IRA_LIMIT)} per child` },
            ...(sp ? [{ label: `${taxFree ? 'Tax-free income' : 'Income'} at ${sp.retireAge}`, value: about(r.rothIncomeReal), note: `a year, in today’s dollars${rothKids.length > 1 ? `, all ${rothKids.length} children` : ''}`, best: true }] : []),
          ]}
        />
        <PrintSection title="Where the saving comes from" note="this tax year">
          <PrintRows
            rows={[
              { label: r.entity === 'soleprop' ? `Owner income and self-employment tax saved on ${money(r.wages)} of wages` : `Owner income tax saved on ${money(r.wages)} of wages`, value: money(r.ownerIncomeTax + r.ownerSe) },
              { label: 'Children’s income tax', value: cost(r.childFed + r.childState), sub: true },
              { label: 'Social Security, Medicare & FUTA on their wages', value: cost(r.fica + r.futa), sub: true },
              { label: 'Net family tax saved', value: money(r.net), total: true },
            ]}
          />
        </PrintSection>
        {sp ? (
          <PrintSection title={`Roth IRA to retirement — ${shownLabel}`} note={`${about(sp.income)} a year${taxFree ? ' tax free' : ''} at ${sp.retireAge}, ${about(sp.incomeReal)} in today’s dollars`} className="pr-chart">
            {rothLineChart}
            <PrintProse>Illustration at {pct(sp.growth)} steady growth and a {pct(sp.incomeRate)} income rate; not a forecast. See page 2.</PrintProse>
          </PrintSection>
        ) : (
          <PrintSection title="Wages against the standard deduction" note={`each child owes no income tax on the first ${money(r.std)}`} className="pr-chart">
            <BarCompare
              height={230}
              groups={r.kids.map((k, i) => ({
                label: `Child ${i + 1}, age ${k.age}`,
                bars: [
                  { label: 'Wages', value: k.wages, color: TONE.net },
                  { label: 'Standard deduction', value: r.std, color: TONE.cost },
                ],
              }))}
            />
          </PrintSection>
        )}
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="Family Payroll Illustration" right={today} />
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        {rothKids.length ? (
          <PrintSection title="What the Roth IRA could become" note={`${pct(sp.growth)} growth · ${pct(sp.incomeRate)} income rate · ${pct(sp.inflation)} inflation`}>
            <PrintTable
              head={['Child', 'Paid through', 'Put in', `Balance at ${sp.retireAge}`, 'Income a year', 'Today’s dollars']}
              widths={['20%', '15%', '15%', '18%', '16%', '16%']}
              align={['left', 'left', 'right', 'right', 'right', 'right']}
              rows={rothKids.map((k) => [
                `Child ${r.kids.indexOf(k) + 1}, age ${k.age}`,
                `age ${k.proj.last}`,
                money(k.proj.contributed),
                about(k.proj.balance),
                about(k.proj.income),
                about(k.proj.incomeReal),
              ])}
            />
            <PrintProse>A what-if, not a forecast or a promise of income for life: markets fall, and {pct(sp.incomeRate)} is a planning rule for about 30 years. It assumes the child keeps earning this much through age {sp.last}; in a sole proprietorship wages after 18 cost 15.3% in payroll tax, not deducted here.{rothMissing.length ? ` ${rothMissing.map((k) => `Child ${r.kids.indexOf(k) + 1}`).join(' and ')} ${rothMissing.length > 1 ? 'are' : 'is'} at or past the retirement age and not shown.` : ''}</PrintProse>
          </PrintSection>
        ) : null}
        <PrintSection title="Child by child" note={`family net = owner saving − child’s tax − payroll tax · 401(k) uses the plan’s age ${r.planMinAge} minimum`}>
          <PrintTable
            head={['Child', 'Wages', 'Their tax', 'Payroll tax', 'Family net', 'Roth room', '401(k)']}
            widths={['22%', '13%', '13%', '13%', '13%', '13%', '13%']}
            align={['left', 'right', 'right', 'right', 'right', 'right', 'left']}
            rows={r.kids.map((k, i) => [
              `Child ${i + 1}, age ${k.age}`,
              money(k.wages),
              money(k.childFed + k.childState),
              money(k.fica + k.futa),
              money(k.net),
              money(k.roth),
              k.planEligible ? 'Eligible' : `Under ${r.planMinAge}`,
            ])}
          />
        </PrintSection>
        {sp ? null : (
          <PrintSection title="Tax on the same dollars" note={r.taxIfKidsPaid > 0 ? 'owner keeps the income vs. children are paid' : 'the children owe nothing — every dollar of tax on these wages disappears'} className="pr-chart">
            <BarCompare
              height={110}
              legend={false}
              groups={[
                { label: 'Owner keeps the income', bars: [{ label: 'Tax', value: r.taxIfOwnerKeeps, color: TONE.tax }] },
                { label: 'Children are paid', bars: [{ label: 'Tax', value: r.taxIfKidsPaid, color: TONE.tax }] },
              ]}
            />
          </PrintSection>
        )}
        {printNote}
        {printInputsCols}
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  ) : (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="Family Payroll Illustration"
          subtitle="What the family saves when the children are paid for real work, and what payroll tax costs."
          meta="No children entered yet"
          metaRight={today}
        />
        <PrintFeature
          label="Net family tax saved this year"
          value="—"
          note="Enter at least one child’s age, hours for the year, and hourly rate; the estimate fills in as you type"
        />
        <PrintSection title="How the estimate is built" note={`${TAX_YEAR} rules`}>
          <PrintRows
            rows={[
              { label: 'Owner income tax saved', value: 'wages × federal bracket + state rate' },
              { label: 'Owner self-employment tax saved (sole proprietor)', value: 'wages × 92.35% × 15.3%, or 3.8% above the wage base' },
              { label: 'Child’s income tax', value: `$0 on the first ${money(r.std)}; single brackets above`, sub: true },
              { label: 'Social Security & Medicare on the child’s wages', value: 'exempt under 18 in a parent’s sole proprietorship', sub: true },
              { label: 'Federal unemployment (FUTA)', value: `exempt under 21; otherwise 0.6% of the first ${money(FUTA_BASE)}`, sub: true },
              { label: 'Roth IRA room created', value: `lesser of wages and ${money(IRA_LIMIT)} per child` },
              { label: 'Roth IRA at retirement', value: 'room × years paid, grown at the assumed rate, × the income rate' },
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>
            {narrative} Wages paid to a child for real work are a business deduction to the owner and, up to the standard deduction, tax-free income to the child. In a parent’s sole proprietorship or a partnership owned only by the parents, a child under 18 also escapes Social Security and Medicare; a corporation gets no family exemption, so the payroll tax has to be weighed against the income-tax saving.
          </PrintProse>
        </PrintSection>
        <PrintSection title="Payroll-tax rules by entity type" note="what the business pays on a child’s wages">
          <PrintTable
            head={['', 'Sole proprietor / parents’ partnership', 'S- or C-corporation']}
            widths={['34%', '33%', '33%']}
            rows={[
              ['Social Security & Medicare (15.3%)', 'Exempt while the child is under 18', 'Due on every dollar, any age'],
              ['Federal unemployment (FUTA)', 'Exempt while the child is under 21', `0.6% of the first ${money(FUTA_BASE)}`],
              ['Owner self-employment tax saved', 'Yes — the wages come out of net self-employment earnings', 'No — the owner is on W-2 salary'],
              ['Child’s income tax', `$0 up to the ${money(r.std)} standard deduction`, `$0 up to the ${money(r.std)} standard deduction`],
              ['Roth IRA room for the child', `Lesser of wages and ${money(IRA_LIMIT)}`, `Lesser of wages and ${money(IRA_LIMIT)}`],
            ]}
          />
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last>
        <PrintPageHead title="Family Payroll Illustration" right={today} />
        <PrintSection title="Tax-free wage capacity per child" note={`hours to reach the ${money(r.std)} standard deduction and the ${money(IRA_LIMIT)} Roth IRA limit`}>
          <PrintTable
            head={['Hourly rate', 'Hours to the standard deduction', 'Over a 50-week year', `Hours to fund a ${money(IRA_LIMIT)} Roth IRA`]}
            widths={['22%', '28%', '22%', '28%']}
            align={['left', 'right', 'right', 'right']}
            rows={headroomRows}
          />
          <PrintProse>
            The rate has to be what a stranger would be paid for the same work; the hours have to be real and recorded. Below the standard deduction the child owes no federal income tax, and in most states little or no state tax, while the owner deducts every dollar.
          </PrintProse>
        </PrintSection>
        <PrintSection title="What has to be in the file" note="the records that carry the deduction on audit">
          <PrintTable
            head={['Record', 'Why it matters']}
            widths={['30%', '70%']}
            rows={[
              ['Written job description', 'Shows the work is real, age-appropriate, and needed by the business'],
              ['Timesheet or hours log', 'Ties the wages to hours actually worked; estimates after the fact do not hold up'],
              ['Pay rate comparison', 'Documents that the rate matches what an unrelated worker would earn'],
              ['Payroll run and Form W-2', 'The wages have to go through payroll and be reported like any employee’s'],
              ['Deposit to the child’s own account', 'Money that lands back in the parent’s account is not the child’s wages'],
            ]}
          />
        </PrintSection>
        {printNote}
        {printInputsCols}
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="What If I Pay My Kids Through the Business?"
      subtitle="Put a child on the payroll and the wages move from the owner’s bracket to the child’s, often tax-free up to the standard deduction, and open a Roth IRA. What the family saves, what it costs in payroll tax by entity type, and what has to be documented."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="The business">
            <PillField label="Entity type" value={form.entity} onChange={set('entity')} options={ENTITY} info="The family payroll-tax exemption applies only to a parent’s sole proprietorship (a single-member LLC that has not elected corporate tax counts) or a partnership owned solely by the child’s parents. A corporation pays Social Security and Medicare on every employee, family or not." />
            <PillField label="Owner’s federal bracket" value={form.bracket} onChange={set('bracket')} options={BRACKET} />
            {form.entity === 'soleprop' ? (
              <PillField
                label="Owner’s net business profit"
                value={form.seBase}
                onChange={set('seBase')}
                options={SE_BASE}
                hint="Decides how much self-employment tax the wages save. At a 32% bracket or higher it is almost always the second choice."
                info={`Self-employment tax is 15.3% up to the Social Security wage base (${money(SS_WAGE_BASE)} of earnings, about $200,000 of net profit) and only 2.9% Medicare above it, plus 0.9% Additional Medicare over $200,000 single or $250,000 married. Wages shifted to a child come off the top, so they save the rate that applies at the margin. Near $200,000 neither choice is exact: run both and use the lower figure.`}
              />
            ) : null}
            {form.entity !== 'ccorp' ? (
              <PillField
                label="Owner gets the QBI deduction"
                value={form.qbi}
                onChange={set('qbi')}
                options={QBI_OPTIONS}
                hint="Below about $200,000 of taxable income (single) or $400,000 (joint) it is usually yes. Above that it depends on the business: choose No for a specified service business, a loss year, or if wages and property do not support it."
                info="Wages paid to the children reduce the owner’s qualified business income, so the 20% deduction under section 199A shrinks with it and the tax saved is smaller. A C-corporation has no QBI deduction."
              />
            ) : null}
          </Panel>
          <Panel title="The children">
            {form.kids.map((k, i) => (
              <div key={k.id} className="field-row" style={{ gridTemplateColumns: '80px 1fr 1fr' }}>
                <NumberField label="Age" value={k.age} onChange={setKid(k.id, 'age')} placeholder="—" info="The child’s age for most of the work year. A child who turns 18 during the year owes Social Security and Medicare only on wages paid after the birthday (21 for FUTA); this tool treats the whole year as one age." />
                <NumberField label="Hours this year" value={k.hours} onChange={setKid(k.id, 'hours')} placeholder="0" />
                <MoneyField label="Hourly rate" value={k.rate} onChange={setKid(k.id, 'rate')} placeholder="0.00" hint={i === 0 ? 'What you would pay a stranger for the same work.' : undefined} />
              </div>
            ))}
          </Panel>
          <Panel title="Roth IRA to retirement">
            <div className="field-row">
              <NumberField label="Pay through age" value={form.stopAge} onChange={set('stopAge')} suffix="yrs" placeholder="22" info="The last age at which the child is paid and the Roth IRA is funded. Change it to see a shorter or longer run. This year’s wages always count, even for a child already past this age." />
              <NumberField label="Retire at age" value={form.retireAge} onChange={set('retireAge')} suffix="yrs" placeholder="65" info="The age when the balance is measured and the income begins. Earnings come out tax free only from age 59½. Between 1 and 120." />
            </div>
            <div className="field-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <NumberField label="Growth a year" value={form.growth} onChange={set('growth')} suffix="%" placeholder="7" info="A steady yearly return before fees, between −20% and 30%. Real markets swing; 7% is a common long-run stock assumption, not a promise." />
              <NumberField label="Income rate" value={form.incomeRate} onChange={set('incomeRate')} suffix="%" placeholder="4" info="The share of the balance taken as income each year. 4% is the usual planning rule for a retirement of about 30 years; it is not a guarantee of income for life." />
              <NumberField label="Inflation" value={form.inflation} onChange={set('inflation')} suffix="%" placeholder="3" info="Used only to restate the income in today’s dollars." />
            </div>
          </Panel>
          <RefinePanel summary="state, 401(k) plan minimum age">
            <div className="field-row">
              <SelectField label="State" value={form.state} onChange={set('state')} options={STATES.map((s) => ({ value: s.code, label: s.name }))} info="A single flat rate, applied to the owner’s deduction and to the child’s wages above the federal standard deduction. Many states tax a child’s wages from the first dollar, which would lower the saving by about the state rate times the wages. New Hampshire has no wage tax." />
              <NumberField label="401(k) plan minimum age" value={form.planMinAge} onChange={set('planMinAge')} suffix="yrs" info="Most plans require age 21 and a year of service; a plan can be written to admit younger employees. Check the plan document." />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Family Payroll Illustration"
              meta={ready ? `${entityLabel} · ${r.kids.length} ${r.kids.length === 1 ? 'child' : 'children'} · ${money(r.wages)} in wages` : 'Enter at least one child’s age, hours, and rate'}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="Net family tax saved this year"
              value={money(r.net)}
              note={featureNote}
            />
            <StatTiles
              items={[
                { label: 'Owner taxes saved', value: money(r.ownerIncomeTax + r.ownerSe), tone: 'good', note: r.entity === 'soleprop' ? 'income + self-employment tax' : 'income tax on the deduction' },
                { label: 'Taxes the children pay', value: money(r.taxIfKidsPaid), tone: r.taxIfKidsPaid > 0 ? 'bad' : undefined, note: 'income + payroll' },
                { label: 'Roth IRA room created', value: money(r.roth), note: `up to ${money(IRA_LIMIT)} per child` },
              ]}
            />
            <div className="result-list">
              <ResultRow label="Wages paid to the children (business deduction)" value={r.wages} />
              <ResultRow label="Owner income tax saved" value={r.ownerIncomeTax} positive sub />
              {r.entity === 'soleprop' ? <ResultRow label="Owner self-employment tax saved" value={r.ownerSe} positive sub /> : null}
              <ResultRow label="Children’s income tax" value={-(r.childFed + r.childState) || 0} negative sub />
              <ResultRow label="Social Security & Medicare on their wages" value={-r.fica || 0} negative={r.fica > 0} sub />
              <ResultRow label="Federal unemployment tax" value={-r.futa || 0} negative={r.futa > 0} sub />
              <ResultRow label="Net family tax saved" value={r.net} total positive={r.net > 0} negative={r.net < 0} />
            </div>

            <Narrative>{narrative}</Narrative>

            <ScenarioCards
              sub="tax on the same dollars"
              scenarios={[
                { label: 'Owner keeps the income', value: money(r.taxIfOwnerKeeps), rows: [{ label: 'Income tax', value: money(r.ownerIncomeTax) }, { label: 'Self-employment tax', value: money(r.ownerSe) }, { label: 'Roth room created', value: '$0' }] },
                { label: 'Children are paid', value: money(r.taxIfKidsPaid), best: r.net > 0, rows: [{ label: 'Children’s income tax', value: money(r.childFed + r.childState) }, { label: 'Payroll taxes', value: money(r.fica + r.futa) }, { label: 'Roth room created', value: money(r.roth) }] },
              ]}
            />

            {ready ? (
              <div className="chart-block">
                <BarCompare
                  height={150}
                  groups={[
                    { label: 'Owner keeps the income', bars: [{ label: 'Tax', value: r.taxIfOwnerKeeps, color: TONE.tax }] },
                    { label: 'Children are paid', bars: [{ label: 'Tax', value: r.taxIfKidsPaid, color: TONE.tax }] },
                  ]}
                />
              </div>
            ) : null}

            {r.kids.length ? (
              <table className="data-table" style={{ marginTop: 14 }}>
                <thead><tr><th>Child</th><th className="num">Wages</th><th className="num">Their tax</th><th className="num">Payroll tax</th><th className="num">Roth room</th><th>401(k)</th></tr></thead>
                <tbody>
                  {r.kids.map((k, i) => (
                    <tr key={k.id}>
                      <td>Child {i + 1}, age {k.age}</td>
                      <td className="num">{money(k.wages)}</td>
                      <td className="num">{money(k.childFed + k.childState)}</td>
                      <td className="num">{money(k.fica + k.futa)}</td>
                      <td className="num">{money(k.roth)}</td>
                      <td>{k.planEligible ? 'Eligible' : `Under ${r.planMinAge}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {sp ? (
              <div className="chart-block">
                <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Roth IRA to retirement</div>
                {rothKids.length > 1 ? (
                  <PillField
                    label="Follow"
                    value={String(rothKids.indexOf(shown))}
                    onChange={setChartKid}
                    options={rothKids.map((k, i) => ({ value: String(i), label: `Child ${r.kids.indexOf(k) + 1}, age ${k.age}` }))}
                  />
                ) : null}
                <StatTiles
                  items={[
                    { label: 'Put in', value: money(sp.contributed), note: `${money(sp.annual)} a year, ages ${sp.age}–${sp.last}` },
                    { label: `Balance at ${sp.retireAge}`, value: about(sp.balance), tone: 'good', note: `${pct(sp.growth)} a year` },
                    { label: taxFree ? 'Tax-free income a year' : 'Income a year', value: about(sp.income), tone: 'good', note: `${about(sp.incomeReal)} in today’s dollars` },
                  ]}
                />
                {rothLineChart}
                <div className="report-narrative">
                  <div className="report-narrative-label">What it could become</div>
                  <p>{rothLine}</p>
                </div>
                <Note title="A what-if, not a promise">
                  Growth is a steady {pct(sp.growth)} with no fees or down years, and the contribution stays level, which assumes the child keeps earning at least this much through age {sp.last}. In a sole proprietorship wages after the 18th birthday cost 15.3% in Social Security and Medicare (FUTA after 21); this illustration does not deduct that. The {pct(sp.incomeRate)} income rate is a planning rule for about 30 years of retirement, so “for life” is not guaranteed; an annuity would pay a different amount. The child needs earned income at least equal to each contribution, and a child under 18 needs a custodial Roth IRA. Earnings are tax-free after five years and age 59½ (or for death, disability or a first home up to $10,000); contributions can be withdrawn at any time.{taxFree ? '' : ' Withdrawals of earnings before 59½ are generally taxable and may carry a 10% penalty.'}
                </Note>
                {rothMissing.length ? <div className="hint">{rothMissing.map((k) => `Child ${r.kids.indexOf(k) + 1}`).join(' and ')} {rothMissing.length > 1 ? 'are' : 'is'} at or past the retirement age, so no projection is shown.</div> : null}
              </div>
            ) : ready ? (
              <Note title="Roth IRA to retirement">No projection is shown because every child is at or past the retirement age ({r.rothPlan.retireAge}). Change “Retire at age” to see one.</Note>
            ) : null}
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="What holds this up on audit">
        The work has to be real and age-appropriate, the pay has to match what a stranger would earn for it, and there has to be a record: a timesheet, a written job description, pay through payroll with a W-2, and the money landing in the child’s own account, not back in the parent’s. Paying a six-year-old $16,000 to “model” for the website does not survive. Paying a 15-year-old $6,000 to do bookkeeping and social media on a timesheet does.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
