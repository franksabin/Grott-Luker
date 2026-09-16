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
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ordinaryTax, STANDARD_DEDUCTION, TAX_YEAR, SS_WAGE_BASE } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const ENTITY = [
  { value: 'soleprop', label: 'Sole proprietor / spouses’ partnership' },
  { value: 'scorp', label: 'S-corporation' },
  { value: 'ccorp', label: 'C-corporation' },
]
const BRACKET = [
  { value: '22', label: '22%' },
  { value: '24', label: '24%' },
  { value: '32', label: '32%' },
  { value: '35', label: '35%' },
  { value: '37', label: '37%' },
]
const IRA_LIMIT = 7500 // 2026 IRA contribution limit (under 50)
const FICA = 0.153 // employee 7.65% + employer 7.65%
const FUTA_RATE = 0.006
const FUTA_BASE = 7000
const SE_FACTOR = 0.9235

const blankKid = (i) => ({ id: `k${i}`, age: '', hours: '', rate: '' })

const BLANK = {
  entity: 'soleprop',
  bracket: '32',
  state: 'NH',
  planMinAge: '21',
  kids: [blankKid(1), blankKid(2), blankKid(3)],
}
const SAMPLE = {
  entity: 'soleprop',
  bracket: '32',
  state: 'NH',
  planMinAge: '21',
  kids: [
    { id: 'k1', age: '17', hours: '500', rate: '16' },
    { id: 'k2', age: '15', hours: '400', rate: '15' },
    blankKid(3),
  ],
}

function compute(form) {
  const entity = form.entity
  const ownerFed = toNumber(form.bracket) / 100
  const st = getState(form.state)
  const stateRate = st.wage / 100
  const planMinAge = toNumber(form.planMinAge) || 21
  const std = STANDARD_DEDUCTION.single

  const kids = form.kids
    .map((k) => {
      const age = toNumber(k.age)
      const wages = Math.max(0, toNumber(k.hours) * toNumber(k.rate))
      if (!wages || !age) return null
      // Payroll taxes on the child's wages.
      const ficaExempt = entity === 'soleprop' && age < 18
      const futaExempt = entity === 'soleprop' && age < 21
      const fica = ficaExempt ? 0 : wages * FICA
      const futa = futaExempt ? 0 : Math.min(wages, FUTA_BASE) * FUTA_RATE
      // Child's own income tax: single filer, standard deduction, ordinary brackets.
      const childTaxable = Math.max(0, wages - std)
      const childFed = ordinaryTax(childTaxable, 'single')
      const childState = childTaxable * stateRate
      // Owner's saving: the wages are a business deduction.
      const ownerIncomeTax = wages * (ownerFed + stateRate)
      // Sole proprietor also saves self-employment tax on the shifted income (below the wage base).
      const ownerSe = entity === 'soleprop' ? wages * SE_FACTOR * FICA : 0
      const roth = Math.min(wages, IRA_LIMIT)
      const planEligible = age >= planMinAge
      const net = ownerIncomeTax + ownerSe - childFed - childState - fica - futa
      return { ...k, age, wages, ficaExempt, futaExempt, fica, futa, childTaxable, childFed, childState, ownerIncomeTax, ownerSe, roth, planEligible, net }
    })
    .filter(Boolean)

  const sum = (f) => kids.reduce((s, k) => s + f(k), 0)
  return {
    entity, ownerFed, st, stateRate, planMinAge, std, kids,
    wages: sum((k) => k.wages),
    ownerIncomeTax: sum((k) => k.ownerIncomeTax),
    ownerSe: sum((k) => k.ownerSe),
    childFed: sum((k) => k.childFed),
    childState: sum((k) => k.childState),
    fica: sum((k) => k.fica),
    futa: sum((k) => k.futa),
    roth: sum((k) => k.roth),
    net: sum((k) => k.net),
    eligibleKids: kids.filter((k) => k.planEligible).length,
    taxIfOwnerKeeps: sum((k) => k.ownerIncomeTax + k.ownerSe),
    taxIfKidsPaid: sum((k) => k.childFed + k.childState + k.fica + k.futa),
  }
}

export default function PayingKids() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const setKid = (id, key) => (v) => setForm((f) => ({ ...f, kids: f.kids.map((k) => (k.id === id ? { ...k, [key]: v } : k)) }))
  const r = useMemo(() => compute(form), [form])

  const steps = useMemo(() => [
    ...r.kids.map((k, i) => ({ label: `Child ${i + 1} (age ${k.age}) wages`, formula: `${form.kids.find((x) => x.id === k.id).hours} hours × ${money(toNumber(form.kids.find((x) => x.id === k.id).rate), 2)}`, result: money(k.wages, 2) })),
    { label: 'Owner income tax saved', formula: `${money(r.wages, 2)} × (${percent(r.ownerFed * 100, 0)} federal + ${percent(r.st.wage, 1)} ${r.st.name})`, result: money(r.ownerIncomeTax, 2) },
    ...(r.entity === 'soleprop' ? [{ label: 'Owner self-employment tax saved', formula: `${money(r.wages, 2)} × 92.35% × 15.3% (below the ${money(SS_WAGE_BASE)} wage base)`, result: money(r.ownerSe, 2) }] : []),
    ...r.kids.map((k, i) => ({ label: `Child ${i + 1} income tax`, formula: `${TAX_YEAR} single brackets on max(0, ${money(k.wages, 2)} − ${money(r.std)} standard deduction)${r.stateRate ? ` + ${percent(r.st.wage, 1)} state` : ''}`, result: money(k.childFed + k.childState, 2) })),
    { label: 'Social Security & Medicare on the children’s wages', formula: r.entity === 'soleprop' ? 'exempt under 18 in a parent’s sole proprietorship or spouses’ partnership; 15.3% otherwise' : '15.3% (7.65% employee + 7.65% employer) — a corporation gets no family exemption', result: money(r.fica, 2) },
    { label: 'Federal unemployment (FUTA)', formula: r.entity === 'soleprop' ? 'exempt under 21 in a parent’s business; 0.6% of the first $7,000 otherwise' : '0.6% of the first $7,000 per child', result: money(r.futa, 2) },
    { label: 'Net family tax saved', formula: 'owner taxes saved − children’s income tax − payroll taxes', result: money(r.net, 2) },
    { label: 'Roth IRA room created', formula: `each child: lesser of wages and ${money(IRA_LIMIT)}`, result: money(r.roth, 2) },
  ], [r, form.kids])

  const ready = r.kids.length > 0
  const entityLabel = ENTITY.find((e) => e.value === r.entity)?.label

  return (
    <ToolShell
      title="What If I Pay My Kids Through the Business?"
      subtitle="Put a child on the payroll and the wages move from the owner’s bracket to the child’s, often tax-free up to the standard deduction, and open a Roth IRA. What the family saves, what it costs in payroll tax by entity type, and what has to be documented."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="The business">
            <PillField label="Entity type" value={form.entity} onChange={set('entity')} options={ENTITY} info="The family payroll-tax exemption applies only to a parent’s sole proprietorship or a partnership owned solely by the child’s parents. A corporation pays Social Security and Medicare on every employee, family or not." />
            <PillField label="Owner’s federal bracket" value={form.bracket} onChange={set('bracket')} options={BRACKET} />
          </Panel>
          <Panel title="The children">
            {form.kids.map((k, i) => (
              <div key={k.id} className="field-row" style={{ gridTemplateColumns: '80px 1fr 1fr' }}>
                <NumberField label={i === 0 ? 'Age' : `Age`} value={k.age} onChange={setKid(k.id, 'age')} placeholder="—" />
                <NumberField label="Hours this year" value={k.hours} onChange={setKid(k.id, 'hours')} placeholder="0" />
                <MoneyField label="Hourly rate" value={k.rate} onChange={setKid(k.id, 'rate')} placeholder="0.00" hint={i === 0 ? 'What you would pay a stranger for the same work.' : undefined} />
              </div>
            ))}
          </Panel>
          <RefinePanel summary="state, 401(k) plan minimum age">
            <div className="field-row">
              <SelectField label="State" value={form.state} onChange={set('state')} options={STATES.map((s) => ({ value: s.code, label: s.name }))} info="Applied to the owner’s deduction and to the child’s taxable wages." />
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
              note={`${money(r.wages)} of wages moved from a ${percent(r.ownerFed * 100, 0)} bracket to the children`}
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
              <ResultRow label="Children’s income tax" value={-(r.childFed + r.childState)} negative sub />
              <ResultRow label="Social Security & Medicare on their wages" value={-r.fica} negative={r.fica > 0} sub />
              <ResultRow label="Federal unemployment tax" value={-r.futa} negative={r.futa > 0} sub />
              <ResultRow label="Net family tax saved" value={r.net} total positive={r.net > 0} negative={r.net < 0} />
            </div>

            <Narrative>
              {ready ? (
                <>
                  Paying {r.kids.length === 1 ? 'one child' : `${r.kids.length} children`} {money(r.wages)} for real work shifts that income out of the owner’s {percent(r.ownerFed * 100, 0)} bracket, saving about {money(r.ownerIncomeTax)} in income tax{r.entity === 'soleprop' ? ` and ${money(r.ownerSe)} in self-employment tax` : ''}.
                  {' '}
                  {r.childFed + r.childState > 0
                    ? `The children owe about ${money(r.childFed + r.childState)} on the portion above the ${money(r.std)} standard deduction.`
                    : `Each child’s wages sit under the ${money(r.std)} standard deduction, so they owe no income tax.`}
                  {' '}
                  {r.fica > 0
                    ? `Because the business is ${r.entity === 'soleprop' ? 'paying a child 18 or older' : 'a corporation'}, Social Security and Medicare of ${money(r.fica)} apply to the wages, which eats into the benefit.`
                    : 'Under 18 in a parent’s business, the wages are exempt from Social Security and Medicare, so nothing is lost to payroll tax.'}
                  {' '}The wages also create {money(r.roth)} of Roth IRA room{r.eligibleKids ? `, and ${r.eligibleKids === 1 ? 'one child meets' : `${r.eligibleKids} children meet`} the plan’s age ${r.planMinAge} minimum for the company 401(k)` : ''}.
                </>
              ) : (
                'Enter a child’s age, hours for the year, and an hourly rate. The estimate updates as you type.'
              )}
            </Narrative>

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
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="What holds this up on audit">
        The work has to be real and age-appropriate, the pay has to match what a stranger would earn for it, and there has to be a record: a timesheet, a written job description, pay through payroll with a W-2, and the money landing in the child’s own account, not back in the parent’s. Paying a six-year-old $16,000 to “model” for the website does not survive. Paying a 15-year-old $6,000 to do bookkeeping and social media on a timesheet does.
      </Note>

      <Assumptions
        items={[
          `${TAX_YEAR} single standard deduction of ${money(STANDARD_DEDUCTION.single)} and ordinary brackets for each child; the child is assumed to have no other income. Earned income is not subject to the kiddie tax.`,
          'Owner saving is the wages times the owner’s federal bracket plus a flat state rate; for a sole proprietor, self-employment tax at 15.3% × 92.35% is also saved, assuming net earnings stay below the Social Security wage base.',
          'Payroll-tax exemption: wages to a child under 18 from a parent’s sole proprietorship or a partnership owned only by the parents are exempt from Social Security and Medicare; under 21, from FUTA. An S- or C-corporation pays 15.3% and FUTA on every employee.',
          `Roth IRA room is the lesser of wages and the ${money(IRA_LIMIT)} limit. Contributions can come from anyone, including the parent, as long as the child had that much earned income.`,
          'Company 401(k) eligibility uses the plan’s minimum age as entered; service requirements and entry dates are not modeled.',
          'State unemployment and workers’ compensation, payroll service fees, and the child’s own filing requirement are not modeled.',
          'Baseline model. Not reviewed by Grott Luker & Co.',
        ]}
      />
    </ToolShell>
  )
}
