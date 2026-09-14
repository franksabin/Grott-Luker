import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE, PALETTE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'

const YESNO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]

const BLANK = {
  balance: '',
  currentFee: '',
  newPlanFee: '',
  iraFee: '',
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

// Project the drag of an annual fee on a growing balance over N years.
function feeDrag(balance, feePct, years) {
  let bal = balance
  let totalFees = 0
  for (let i = 0; i < years; i++) {
    const fee = bal * feePct
    totalFees += fee
    bal = (bal - fee) * (1 + GROWTH)
  }
  return { totalFees, ending: bal }
}

function compute(form) {
  const balance = toNumber(form.balance)
  const currentFee = toNumber(form.currentFee) / 100
  const newPlanFee = toNumber(form.newPlanFee) / 100
  const iraFee = toNumber(form.iraFee) / 100
  const age = toNumber(form.age)
  const taxRate = toNumber(form.taxRate) / 100

  const leaveInPlan = feeDrag(balance, currentFee, HORIZON)
  const rollNewPlan = feeDrag(balance, newPlanFee, HORIZON)
  const rollIra = feeDrag(balance, iraFee, HORIZON)

  // Cash out: pay ordinary tax (+ 10% penalty if under 59½) now, then the
  // after-tax remainder is assumed invested in a taxable account, fee-free,
  // at the same growth rate, for a comparable ending value.
  const penaltyRate = age < 59.5 ? EARLY_WITHDRAWAL_PENALTY : 0
  const cashOutCost = balance * (taxRate + penaltyRate)
  const cashOutRemainder = balance - cashOutCost
  const cashOut = { totalFees: 0, ending: cashOutRemainder * Math.pow(1 + GROWTH, HORIZON) }

  const options = [
    ...(form.newPlanAvailable === 'yes'
      ? [{ id: 'new-401k', label: 'Roll to new 401(k)', ending: rollNewPlan.ending, note: 'Consolidates accounts; depends on new plan quality' }]
      : []),
    { id: 'leave', label: 'Leave in old plan', ending: leaveInPlan.ending, note: 'Simple, but tied to old plan fees' },
    { id: 'ira', label: 'Roll to IRA', ending: rollIra.ending, note: 'Full investment menu; fees vary by provider' },
    { id: 'cash-out', label: 'Cash out', ending: cashOut.ending, note: penaltyRate > 0 ? 'Taxable now, plus a 10% early-withdrawal penalty' : 'Taxable now as ordinary income' },
  ]
  const best = options.reduce((a, b) => (b.ending > a.ending ? b : a))

  const feeSavings = leaveInPlan.totalFees - rollIra.totalFees
  const balanceDelta = rollIra.ending - leaveInPlan.ending

  const annualCurrent = balance * currentFee
  const annualIra = balance * iraFee

  return {
    balance,
    annualCurrent,
    annualIra,
    currentFees: leaveInPlan.totalFees,
    iraFees: rollIra.totalFees,
    feeSavings,
    balanceDelta,
    age,
    stillEmployed: form.employed === 'yes',
    hasEmployerStock: form.employerStock === 'yes',
    options,
    best,
    cashOutCost,
  }
}

// Qualitative planning considerations (no hard recommendation).
function considerations(r) {
  return [
    {
      factor: 'Investment flexibility',
      leave: 'Limited to the plan’s fund menu',
      roll: 'Full range of investments in an IRA',
    },
    {
      factor: 'Fees',
      leave: `~${money(r.annualCurrent)} / year at current rate`,
      roll: `~${money(r.annualIra)} / year at IRA rate`,
    },
    {
      factor: 'Creditor protection',
      leave: 'Strong federal ERISA protection',
      roll: 'Varies by state for IRAs',
    },
    {
      factor: 'Age 55 rule',
      leave: r.stillEmployed ? 'Penalty-free access at 55 if you separate' : 'May allow penalty-free access at 55',
      roll: 'Generally must wait until 59½',
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
  const items = considerations(r)

  return (
    <ToolShell
      title="Should I Roll Over My 401(k)?"
      subtitle="Weigh leaving a 401(k) in place against rolling it to an IRA — comparing the long-run cost of fees alongside the flexibility, protection, and tax considerations that matter to the decision."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Your 401(k)">
            <MoneyField label="Current 401(k) balance" value={form.balance} onChange={set('balance')} />
            <div className="field-row">
              <NumberField label="Current plan fees" value={form.currentFee} onChange={set('currentFee')} suffix="%" info="Approximate all-in annual fees / expense ratio in the current plan." />
              <NumberField label="New employer plan fees" value={form.newPlanFee} onChange={set('newPlanFee')} suffix="%" info="Approximate all-in annual fees of a new employer's 401(k), if available." />
            </div>
            <div className="field-row">
              <NumberField label="IRA fees" value={form.iraFee} onChange={set('iraFee')} suffix="%" info="Approximate annual fees of the IRA option you'd roll into." />
              <NumberField label="Tax rate if cashed out" value={form.taxRate} onChange={set('taxRate')} suffix="%" info="Your marginal ordinary income tax rate, applied to the full balance if cashed out." />
            </div>
            <NumberField label="Current age" value={form.age} onChange={set('age')} suffix="yrs" />
            <div className="field-row">
              <SegmentedField label="Still employed there?" value={form.employed} onChange={set('employed')} options={YESNO} />
              <SegmentedField label="New employer plan available?" value={form.newPlanAvailable} onChange={set('newPlanAvailable')} options={YESNO} />
            </div>
            <SegmentedField label="Holds employer stock?" value={form.employerStock} onChange={set('employerStock')} options={YESNO} />
          </Panel>
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
              label={`Estimated value at retirement in ${HORIZON} years — ${r.best.label}`}
              value={money(r.best.ending)}
              note="Highest of the illustrated options below, based on the figures entered"
            />
            <Narrative>
              On a {money(r.balance)} balance, cashing out now costs an estimated{' '}
              {money(r.cashOutCost)} in taxes{r.age < 59.5 ? ' and penalty' : ''}. Of the
              options compared, "{r.best.label}" projects the highest illustrated
              value after {HORIZON} years — but fees are only one factor. Review
              the considerations below before deciding.
            </Narrative>

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
              <ul className="assumptions" style={{ marginTop: 14, paddingLeft: 18 }}>
                {r.options.map((o) => (
                  <li key={o.id}>
                    <strong>{o.label}:</strong> {o.note}
                  </li>
                ))}
              </ul>
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

      <Assumptions
        items={[
          `Each option's projected balance grows at an assumed ${percent(GROWTH * 100, 0)} per year over ${HORIZON} years; annual fees are deducted from the balance each year before growth is applied.`,
          'Cashing out assumes the full balance is taxed at the entered ordinary rate (plus a 10% early-withdrawal penalty if you are under 59½), and the after-tax remainder is invested in a taxable account at the same assumed return, fee-free, for a comparable ending value.',
          'The considerations table is educational and general; creditor protection, the age-55 rule, and NUA treatment depend on your specific facts and state law.',
          'No investment performance difference between the plan and the IRA is assumed — only fees differ.',
          'This tool does not model Roth 401(k) balances, outstanding plan loans, state taxes on a cash-out, or after-tax contributions.',
          'This is a decision-support illustration, not a recommendation to roll over, retain, or cash out any account.',
        ]}
      />
    </ToolShell>
  )
}
