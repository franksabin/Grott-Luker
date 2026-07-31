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
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'

const YESNO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]

const BLANK = {
  balance: '',
  currentFee: '',
  iraFee: '',
  age: '',
  employed: 'no',
  employerStock: 'no',
}

const SAMPLE = {
  balance: '450000',
  currentFee: '0.85',
  iraFee: '0.25',
  age: '58',
  employed: 'no',
  employerStock: 'no',
}

const HORIZON = 20
const GROWTH = 0.06

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
  const iraFee = toNumber(form.iraFee) / 100
  const age = toNumber(form.age)

  const current = feeDrag(balance, currentFee, HORIZON)
  const ira = feeDrag(balance, iraFee, HORIZON)
  const feeSavings = current.totalFees - ira.totalFees
  const balanceDelta = ira.ending - current.ending

  const annualCurrent = balance * currentFee
  const annualIra = balance * iraFee

  return {
    balance,
    annualCurrent,
    annualIra,
    currentFees: current.totalFees,
    iraFees: ira.totalFees,
    feeSavings,
    balanceDelta,
    age,
    stillEmployed: form.employed === 'yes',
    hasEmployerStock: form.employerStock === 'yes',
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
              <NumberField label="IRA fees" value={form.iraFee} onChange={set('iraFee')} suffix="%" info="Approximate annual fees of the IRA option you'd roll into." />
            </div>
            <NumberField label="Current age" value={form.age} onChange={set('age')} suffix="yrs" />
            <div className="field-row">
              <SegmentedField label="Still employed there?" value={form.employed} onChange={set('employed')} options={YESNO} />
              <SegmentedField label="Holds employer stock?" value={form.employerStock} onChange={set('employerStock')} options={YESNO} />
            </div>
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
              sectionTitle="Rollover Comparison"
              meta="Leave in plan vs. roll to IRA"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={`Estimated fee difference over ${HORIZON} years`}
              value={money(Math.abs(r.feeSavings))}
              note={r.feeSavings >= 0 ? 'Lower total fees by rolling to an IRA' : 'Lower total fees by leaving in the plan'}
            />
            <Narrative>
              On a {money(r.balance)} balance, the current plan’s fees run about{' '}
              {money(r.annualCurrent)} a year versus {money(r.annualIra)} in the
              IRA. Over {HORIZON} years of growth, that difference compounds to an
              estimated {money(Math.abs(r.feeSavings))} in {r.feeSavings >= 0 ? 'savings' : 'additional cost'}{' '}
              — but fees are only one factor. Review the considerations below
              before deciding.
            </Narrative>

            <div className="chart-block" style={{ marginTop: 12 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Total fees paid over {HORIZON} years
              </div>
              <BarCompare
                groups={[
                  { label: 'Leave in plan', bars: [{ label: 'Fees', value: r.currentFees, color: TONE.tax }] },
                  { label: 'Roll to IRA', bars: [{ label: 'Fees', value: r.iraFees, color: TONE.net }] },
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

      <Assumptions
        items={[
          `Fee projections grow the balance at an assumed ${percent(GROWTH * 100, 0)} per year over ${HORIZON} years and apply the fee percentages entered to each year's balance.`,
          'The considerations table is educational and general; creditor protection, the age-55 rule, and NUA treatment depend on your specific facts and state law.',
          'No investment performance difference between the plan and the IRA is assumed — only fees differ.',
          'This tool does not model Roth 401(k) balances, outstanding plan loans, or after-tax contributions.',
          'This is a decision-support illustration, not a recommendation to roll over or retain any account.',
        ]}
      />
    </ToolShell>
  )
}
