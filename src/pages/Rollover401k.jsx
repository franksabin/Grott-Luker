import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
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
import { BarCompare, TONE, PALETTE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'

const YESNO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]

// Fee and tax-rate assumptions live in the refine panel, so they carry defaults
// and the tool computes before the panel is opened.
const BLANK = {
  balance: '',
  currentFee: '0.85',
  newPlanFee: '0.45',
  iraFee: '0.25',
  age: '',
  employed: 'no',
  newPlanAvailable: 'no',
  employerStock: 'no',
  taxRate: '24',
}

const SAMPLE = {
  balance: '450000',
  currentFee: '0.85',
  newPlanFee: '0.45',
  iraFee: '0.25',
  age: '58',
  employed: 'no',
  newPlanAvailable: 'yes',
  employerStock: 'no',
  taxRate: '24',
}

const HORIZON = 20
const GROWTH = 0.06
const EARLY_WITHDRAWAL_PENALTY = 0.1
const MILESTONES = [5, 10, 15, 20]

// Rates typed as whole numbers print as "24%", fractional ones keep their
// decimals ("22.5%") so the printed rate reproduces the printed tax.
function rateText(value) {
  const n = toNumber(value)
  return percent(n, Number.isInteger(n) ? 0 : Number.isInteger(n * 10) ? 1 : 2)
}

// Project the drag of an annual fee on a growing balance over N years.
// path[y] is the balance at the end of year y (path[0] = starting balance).
function feeDrag(balance, feePct, years) {
  let bal = balance
  let totalFees = 0
  const path = [bal]
  for (let i = 0; i < years; i++) {
    const fee = bal * feePct
    totalFees += fee
    bal = (bal - fee) * (1 + GROWTH)
    path.push(bal)
  }
  return { totalFees, ending: bal, path }
}

function compute(form) {
  const balance = toNumber(form.balance)
  const currentFeePct = toNumber(form.currentFee)
  const iraFeePct = toNumber(form.iraFee)
  const currentFee = currentFeePct / 100
  const newPlanFee = toNumber(form.newPlanFee) / 100
  const iraFee = iraFeePct / 100
  const age = toNumber(form.age)
  const taxRate = toNumber(form.taxRate) / 100
  const stillEmployed = form.employed === 'yes'

  const leaveInPlan = feeDrag(balance, currentFee, HORIZON)
  const rollNewPlan = feeDrag(balance, newPlanFee, HORIZON)
  const rollIra = feeDrag(balance, iraFee, HORIZON)

  // Cash out: pay ordinary tax now, plus the 10% early-withdrawal penalty if
  // under 59½ — unless the age-55 rule applies (separated from the employer,
  // 55 or older; assumes separation in or after the year of turning 55). The
  // after-tax remainder is assumed invested in a taxable account, fee-free,
  // at the same growth rate, for a comparable ending value.
  const rule55 = !stillEmployed && age >= 55 && age < 59.5
  const penaltyRate = age >= 59.5 || rule55 ? 0 : EARLY_WITHDRAWAL_PENALTY
  const cashOutCost = balance * (taxRate + penaltyRate)
  const cashOutRemainder = balance - cashOutCost
  const cashOutPath = Array.from({ length: HORIZON + 1 }, (_, y) => cashOutRemainder * Math.pow(1 + GROWTH, y))
  const cashOut = { totalFees: 0, ending: cashOutPath[HORIZON], path: cashOutPath }

  const cashOutNote = penaltyRate > 0
    ? 'Taxable now, plus a 10% early-withdrawal penalty'
    : rule55
      ? 'Taxable now; no penalty under the age-55 rule'
      : 'Taxable now as ordinary income'
  const options = [
    ...(form.newPlanAvailable === 'yes'
      ? [{ id: 'new-401k', label: 'Roll to new 401(k)', ending: rollNewPlan.ending, path: rollNewPlan.path, note: 'Consolidates accounts; depends on new plan quality' }]
      : []),
    { id: 'leave', label: 'Leave in old plan', ending: leaveInPlan.ending, path: leaveInPlan.path, note: 'Simple, but tied to old plan fees' },
    { id: 'ira', label: 'Roll to IRA', ending: rollIra.ending, path: rollIra.path, note: 'Full investment menu; fees vary by provider' },
    { id: 'cash-out', label: 'Cash out', ending: cashOut.ending, path: cashOut.path, note: cashOutNote },
  ]
  const best = options.reduce((a, b) => (b.ending > a.ending ? b : a))

  const feeSavings = leaveInPlan.totalFees - rollIra.totalFees
  const balanceDelta = rollIra.ending - leaveInPlan.ending

  const annualCurrent = balance * currentFee
  const annualIra = balance * iraFee
  const annualSavings = annualCurrent - annualIra

  return {
    balance,
    currentFeePct,
    iraFeePct,
    annualCurrent,
    annualIra,
    annualSavings,
    currentFees: leaveInPlan.totalFees,
    iraFees: rollIra.totalFees,
    feeSavings,
    balanceDelta,
    age,
    stillEmployed,
    hasEmployerStock: form.employerStock === 'yes',
    options,
    best,
    rule55,
    penaltyRate,
    cashOutCost,
    cashOutRemainder,
  }
}

// Qualitative planning considerations (no hard recommendation).
function considerations(r) {
  const past595 = r.age >= 59.5
  const age55Leave = past595
    ? 'Not needed — no early-withdrawal penalty after 59½'
    : r.stillEmployed
      ? (r.age >= 55 ? 'Penalty-free access if you separate now (55 or older)' : 'Penalty-free access if you separate in or after the year you turn 55')
      : (r.age >= 55 ? 'Penalty-free if you separated in or after the year you turned 55' : 'Not available — separated before 55')
  const age55Roll = past595 ? 'Not needed — no early-withdrawal penalty after 59½' : 'Lost on rollover — IRA withdrawals wait until 59½'
  return [
    {
      factor: 'Investment flexibility',
      leave: 'Limited to the plan’s fund menu',
      roll: 'Full range of investments in an IRA',
    },
    {
      factor: 'Fees',
      leave: `${percent(r.currentFeePct, 2)} of assets per year (all-in)`,
      roll: `${percent(r.iraFeePct, 2)} of assets per year (all-in)`,
    },
    {
      factor: 'Creditor protection',
      leave: 'Strong federal ERISA protection',
      roll: 'Varies by state for IRAs',
    },
    {
      factor: 'Age 55 rule',
      leave: age55Leave,
      roll: age55Roll,
    },
    {
      factor: 'Employer stock (NUA)',
      leave: r.hasEmployerStock ? 'May qualify for favorable NUA tax treatment' : 'Not applicable',
      roll: r.hasEmployerStock ? 'Rolling to an IRA can forfeit NUA treatment' : 'Not applicable',
    },
    {
      factor: 'Consolidation & RMDs',
      leave: 'Another account to track',
      roll: 'Simpler to manage and aggregate RMDs',
    },
  ]
}

export default function Rollover401k() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Annual fee today', formula: `${money(r.balance, 2)} × current plan fee`, result: money(r.annualCurrent, 2) },
    { label: 'Annual fee in an IRA', formula: `${money(r.balance, 2)} × IRA fee`, result: money(r.annualIra, 2) },
    { label: `Fees over ${HORIZON} years · leave in plan`, formula: `fee charged each year on a balance growing ${percent(GROWTH * 100, 0)} net of fees`, result: money(r.currentFees, 2) },
    { label: `Fees over ${HORIZON} years · IRA`, formula: 'same method at the IRA fee', result: money(r.iraFees, 2) },
    { label: 'Fee savings from rolling to an IRA', formula: `${money(r.currentFees, 2)} − ${money(r.iraFees, 2)}`, result: money(r.feeSavings, 2) },
    ...r.options.map((o) => ({ label: `Ending balance · ${o.label}`, formula: o.id === 'cash-out' ? `(balance − ${r.penaltyRate > 0 ? 'tax and penalty' : 'tax'} ${money(r.cashOutCost, 2)}) × (1 + ${percent(GROWTH * 100, 0)})^${HORIZON}` : `balance compounding ${HORIZON} years at ${percent(GROWTH * 100, 0)} after fees`, result: money(o.ending, 2) })),
    { label: 'Highest ending balance', formula: 'largest of the above', result: r.best.label },
  ], [r])
  const items = considerations(r)

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const yesNo = (v) => (v === 'yes' ? 'Yes' : 'No')
  const inputs = [
    ['Current 401(k) balance', money(r.balance)],
    ['Current age', form.age ? `${form.age} yrs` : '—'],
    ['Still employed there?', yesNo(form.employed)],
    ['New employer plan available?', yesNo(form.newPlanAvailable)],
    ['Holds employer stock?', yesNo(form.employerStock)],
    ['Current plan fees', percent(toNumber(form.currentFee), 2)],
    ['New employer plan fees', form.newPlanAvailable === 'yes' ? percent(toNumber(form.newPlanFee), 2) : 'n/a'],
    ['IRA fees', percent(toNumber(form.iraFee), 2)],
    ['Tax rate if cashed out', rateText(form.taxRate)],
  ]
  const assumptions = [
    `Each option's projected balance grows at an assumed ${percent(GROWTH * 100, 0)} per year over a fixed ${HORIZON}-year window regardless of your age; annual fees are deducted from the balance each year before growth is applied.`,
    'Cashing out assumes the full balance is taxed at the entered ordinary rate, plus a 10% early-withdrawal penalty if you are under 59½. The penalty is waived under the age-55 rule when you are 55 or older and no longer employed there, which assumes you separated from service in or after the year you turned 55. The after-tax remainder is invested in a taxable account at the same assumed return, fee-free, for a comparable ending value.',
    'The considerations table is educational and general; creditor protection, the age-55 rule, and NUA treatment depend on your specific facts and state law.',
    'No investment performance difference between the plan and the IRA is assumed — only fees differ.',
    `This tool does not model Roth 401(k) balances, outstanding plan loans, state taxes on a cash-out, after-tax contributions, or required minimum distributions, which would begin at 73 within the ${HORIZON}-year window for anyone 53 or older today.`,
    'This is a decision-support illustration, not a recommendation to roll over, retain, or cash out any account.',
  ]
  const hasPenalty = r.penaltyRate > 0
  const cashOutLabel = hasPenalty ? 'Tax and penalty paid now' : 'Tax paid now'
  const penaltyText = hasPenalty ? '10%' : r.rule55 ? 'None (age-55 rule)' : 'None (59½ or older)'
  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="401(k) Rollover Comparison"
          subtitle={`Leave it, roll it to a new plan or an IRA, or cash out — the ${HORIZON}-year cost of fees, and the factors beyond fees.`}
          meta={`${money(r.balance)} balance · age ${r.age || '—'} · ${r.options.length} options over ${HORIZON} years`}
          metaRight={today}
        />
        <PrintFeature
          label={`Estimated value in ${HORIZON} years — ${r.best.label}`}
          value={money(r.best.ending)}
          note="Highest of the illustrated options below, based on the figures entered"
        />
        <PrintTiles
          items={r.options.map((o) => ({ label: o.label, value: money(o.ending), note: o.note, best: o.id === r.best.id }))}
        />
        <PrintSection title="Fees and fee savings" note={`over ${HORIZON} years`}>
          <PrintRows
            rows={[
              { label: `Fees over ${HORIZON} years · leave in plan`, value: money(r.currentFees) },
              { label: `Fees over ${HORIZON} years · IRA`, value: money(r.iraFees) },
              { label: 'Fee savings from rolling to an IRA', value: money(r.feeSavings) },
              { label: `Ending balance difference, IRA vs. leave (${HORIZON} years)`, value: money(r.balanceDelta), total: true },
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>
            On a {money(r.balance)} balance, cashing out now costs an estimated{' '}
            {money(r.cashOutCost)} in taxes{hasPenalty ? ' and penalty' : ''}{r.rule55 ? ' (no penalty under the age-55 rule)' : ''}. Of the
            options compared, "{r.best.label}" projects the highest illustrated
            value after {HORIZON} years — but fees are only one factor. Review
            the planning considerations on the next page before deciding.
          </PrintProse>
        </PrintSection>
        <PrintSection title={`Illustrative value in ${HORIZON} years, by option`} className="pr-chart">
          <BarCompare
            height={230}
            legend={false}
            groups={r.options.map((o, i) => ({
              label: o.label,
              bars: [{ label: o.label, value: o.ending, color: o.id === r.best.id ? TONE.net : PALETTE[i % PALETTE.length] }],
            }))}
          />
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last>
        <PrintPageHead title="401(k) Rollover Comparison" right={today} />
        <PrintSection title="Planning considerations" note="beyond the fee math">
          <PrintTable
            head={['Factor', 'Leave in 401(k)', 'Roll to IRA']}
            widths={['26%', '37%', '37%']}
            rows={items.map((it) => [it.factor, it.leave, it.roll])}
          />
        </PrintSection>
        <PrintCols>
          <PrintSection title="Fee detail" note="per year on today's balance">
            <PrintRows
              rows={[
                { label: 'Annual fee today (current plan)', value: money(r.annualCurrent) },
                { label: 'Current plan fee rate', value: percent(r.currentFeePct, 2), sub: true },
                { label: 'Annual fee in an IRA', value: money(r.annualIra) },
                { label: 'IRA fee rate', value: percent(r.iraFeePct, 2), sub: true },
                { label: 'Annual fee difference, year one', value: money(r.annualSavings), total: true },
              ]}
            />
          </PrintSection>
          <PrintSection title="Cash-out detail" note="if taken today">
            <PrintRows
              rows={[
                { label: 'Balance withdrawn', value: money(r.balance) },
                { label: 'Ordinary income tax rate', value: rateText(form.taxRate), sub: true },
                { label: 'Early-withdrawal penalty', value: penaltyText, sub: true },
                { label: cashOutLabel, value: money(r.cashOutCost) },
                { label: 'After-tax amount left to invest', value: money(r.cashOutRemainder), total: true },
              ]}
            />
          </PrintSection>
        </PrintCols>
        <PrintSection title="Projected balance by option" note={`at ${percent(GROWTH * 100, 0)} growth, after fees · best option shaded`}>
          <PrintTable
            head={['Option', ...MILESTONES.map((y) => `Year ${y}`)]}
            widths={['32%', '17%', '17%', '17%', '17%']}
            align={['left', 'right', 'right', 'right', 'right']}
            rows={r.options.map((o) => [o.label, ...MILESTONES.map((y) => money(o.path[y]))])}
            rowClass={(row) => (row[0] === r.best.label ? 'is-tint' : '')}
          />
        </PrintSection>
        <PrintNote title="Reading the result">
          Fees are the easiest factor to quantify, but rarely the whole story. Creditor protection, the age-55 separation rule, and NUA treatment for employer stock can each outweigh fee differences. Use the planning considerations above to frame the conversation.
        </PrintNote>
        <PrintSection title="Inputs used in this estimate">
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
      title="Should I Roll Over My 401(k)?"
      subtitle="Weigh leaving a 401(k) in place against rolling it to an IRA — comparing the long-run cost of fees alongside the flexibility, protection, and tax considerations that matter to the decision."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Your 401(k)">
            <MoneyField label="Current 401(k) balance" value={form.balance} onChange={set('balance')} />
            <NumberField label="Current age" value={form.age} onChange={set('age')} suffix="yrs" />
            <div className="field-row">
              <SegmentedField label="Still employed there?" value={form.employed} onChange={set('employed')} options={YESNO} />
              <SegmentedField label="New employer plan available?" value={form.newPlanAvailable} onChange={set('newPlanAvailable')} options={YESNO} />
            </div>
            <SegmentedField label="Holds employer stock?" value={form.employerStock} onChange={set('employerStock')} options={YESNO} />
          </Panel>
          <RefinePanel summary="plan and IRA fees, tax rate if cashed out">
            <div className="field-row">
              <NumberField label="Current plan fees" value={form.currentFee} onChange={set('currentFee')} suffix="%" info="Approximate all-in annual fees / expense ratio in the current plan." />
              <NumberField label="New employer plan fees" value={form.newPlanFee} onChange={set('newPlanFee')} suffix="%" info="Approximate all-in annual fees of a new employer's 401(k), if available." />
            </div>
            <div className="field-row">
              <NumberField label="IRA fees" value={form.iraFee} onChange={set('iraFee')} suffix="%" info="Approximate annual fees of the IRA option you'd roll into." />
              <NumberField label="Tax rate if cashed out" value={form.taxRate} onChange={set('taxRate')} suffix="%" info="Your marginal ordinary income tax rate, applied to the full balance if cashed out." />
            </div>
          </RefinePanel>
          <Note title="Not just about fees">
            Fees are the easiest factor to quantify, but rarely the whole story.
            Creditor protection, the age-55 separation rule, and NUA treatment for
            employer stock can each outweigh fee differences. Use the comparison
            below to frame the conversation.
          </Note>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Four Options, Compared"
              meta={`Best illustrated outcome: ${r.best.label}`}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={`Estimated value in ${HORIZON} years — ${r.best.label}`}
              value={money(r.best.ending)}
              note="Highest of the illustrated options below, based on the figures entered"
            />
            <StatTiles
              items={[
                { label: 'Fees saved rolling to an IRA', value: money(r.feeSavings), tone: r.feeSavings > 0 ? 'good' : undefined, note: `over ${HORIZON} years vs. leaving` },
                { label: hasPenalty ? 'Cash-out tax and penalty' : 'Cash-out tax', value: money(r.cashOutCost), tone: r.cashOutCost > 0 ? 'bad' : undefined, note: r.rule55 ? 'paid now · no penalty (age-55 rule)' : 'paid now' },
                { label: 'Annual fee today', value: money(r.annualCurrent), note: `vs. ${money(r.annualIra)} in an IRA` },
              ]}
            />

            <div className="result-list">
              <ResultRow label="Annual fee today (current plan)" value={r.annualCurrent} />
              <ResultRow label="Annual fee in an IRA" value={r.annualIra} sub />
              <ResultRow label={`Fees over ${HORIZON} years · leave in plan`} value={r.currentFees} negative />
              <ResultRow label={`Fees over ${HORIZON} years · IRA`} value={r.iraFees} negative />
              <ResultRow label="Fee savings from rolling to an IRA" value={r.feeSavings} positive />
              <ResultRow label={`Ending balance difference, IRA vs. leave (${HORIZON} years)`} value={r.balanceDelta} total />
            </div>

            <Narrative>
              On a {money(r.balance)} balance, cashing out now costs an estimated{' '}
              {money(r.cashOutCost)} in taxes{hasPenalty ? ' and penalty' : ''}{r.rule55 ? ' (no penalty under the age-55 rule)' : ''}. Of the
              options compared, "{r.best.label}" projects the highest illustrated
              value after {HORIZON} years — but fees are only one factor. Review
              the considerations below before deciding.
            </Narrative>

            <ScenarioCards
              sub={`in ${HORIZON} years`}
              scenarios={r.options.map((o) => ({
                label: o.label,
                value: money(o.ending),
                best: o.id === r.best.id,
              }))}
            />
            <ul className="assumptions" style={{ marginTop: 14, paddingLeft: 18 }}>
              {r.options.map((o) => (
                <li key={o.id}>
                  <strong>{o.label}:</strong> {o.note}
                </li>
              ))}
            </ul>

            <div className="chart-block" style={{ marginTop: 12 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Illustrative value in {HORIZON} years, by option
              </div>
              <BarCompare
                groups={[
                  {
                    label: 'Options',
                    bars: r.options.map((o, i) => ({
                      label: o.label,
                      value: o.ending,
                      color: o.id === r.best.id ? TONE.net : PALETTE[i % PALETTE.length],
                    })),
                  },
                ]}
              />
            </div>

            <div className="section-heading" style={{ fontSize: 15 }}>Planning considerations</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th>Leave in 401(k)</th>
                    <th>Roll to IRA</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.factor}>
                      <td><strong>{it.factor}</strong></td>
                      <td>{it.leave}</td>
                      <td>{it.roll}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-footer">Prepared with Grott Luker &amp; Co. · Planning by BlueLine Advisors</div>
          </section>
        </div>
      </div>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
