import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SelectField,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { RangeBar, BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { marginalOrdinaryRate, STANDARD_DEDUCTION } from '../lib/tax.js'

// Illustrative 401(k) + profit-sharing reference contribution for context.
const REFERENCE_401K = 70000

const ENTITY_OPTIONS = [
  { value: 'sole_prop', label: 'Sole proprietorship' },
  { value: 'llc', label: 'LLC' },
  { value: 'partnership', label: 'Partnership' },
  { value: 's_corp', label: 'S-Corporation' },
  { value: 'c_corp', label: 'C-Corporation' },
]

const PLAN_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '401k', label: '401(k) only' },
  { value: '401k_ps', label: '401(k) with profit sharing' },
  { value: 'sep', label: 'SEP or SIMPLE IRA' },
]

// Illustrative age-based contribution ranges. Actual limits are set annually
// by an enrolled actuary and depend on compensation and plan design.
const AGE_RANGES = [
  { max: 39, low: 50000, high: 100000 },
  { max: 44, low: 80000, high: 140000 },
  { max: 49, low: 110000, high: 185000 },
  { max: 54, low: 150000, high: 225000 },
  { max: 59, low: 190000, high: 275000 },
  { max: 64, low: 235000, high: 320000 },
  { max: 200, low: 270000, high: 340000 },
]

const BLANK = {
  age: '',
  income: '',
  entity: 's_corp',
  employees: '',
  existingPlan: 'none',
}

const SAMPLE = {
  age: '55',
  income: '750000',
  entity: 's_corp',
  employees: '4',
  existingPlan: '401k_ps',
}

function bandForAge(age) {
  return AGE_RANGES.find((b) => age <= b.max) || AGE_RANGES[AGE_RANGES.length - 1]
}

function compute(form) {
  const age = toNumber(form.age)
  const income = toNumber(form.income)
  const employees = toNumber(form.employees)
  const band = bandForAge(age || 45)

  // Contributions cannot exceed compensation; scale the range down if income
  // is below the illustrative band.
  const capHigh = income > 0 ? Math.min(band.high, income) : band.high
  const capLow = income > 0 ? Math.min(band.low, income) : band.low
  const low = Math.min(capLow, capHigh)
  const high = capHigh

  const marginal = marginalOrdinaryRate(
    Math.max(0, income - STANDARD_DEDUCTION.married),
    'married'
  )

  const savingsLow = low * marginal
  const savingsHigh = high * marginal

  const incomeSupports = income >= 300000
  const ageTypical = age >= 45

  return {
    age,
    income,
    employees,
    band,
    low,
    high,
    marginal,
    savingsLow,
    savingsHigh,
    incomeSupports,
    ageTypical,
  }
}

export default function CashBalance() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const ready = toNumber(form.age) > 0 && toNumber(form.income) > 0

  return (
    <ToolShell
      title="Cash Balance Plan Analyzer"
      subtitle="An educational look at when businesses commonly evaluate Cash Balance Plans, with illustrative contribution and deduction ranges based on the characteristics you enter."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Business & Owner Profile">
            <div className="field-row">
              <NumberField
                label="Owner age"
                value={form.age}
                onChange={set('age')}
                suffix="yrs"
                info="Age matters because Cash Balance Plans allow larger contributions as the owner approaches retirement — there are fewer years to fund a target benefit."
              />
              <MoneyField
                label="Annual income"
                value={form.income}
                onChange={set('income')}
                info="Earned income or W-2 compensation from the business. Contributions are limited by compensation."
              />
            </div>
            <div className="field-row">
              <SelectField
                label="Entity type"
                value={form.entity}
                onChange={set('entity')}
                options={ENTITY_OPTIONS}
              />
              <NumberField
                label="Number of employees"
                value={form.employees}
                onChange={set('employees')}
                info="Non-owner employees generally must receive contributions as well, which affects the overall cost and design of a plan."
              />
            </div>
            <SelectField
              label="Existing retirement plans"
              value={form.existingPlan}
              onChange={set('existingPlan')}
              options={PLAN_OPTIONS}
              info="Cash Balance Plans are frequently layered on top of an existing 401(k) with profit sharing (a 'combo' design)."
            />
          </Panel>

          <Note title="How these plans work">
            A Cash Balance Plan is a type of IRS-qualified defined-benefit plan.
            Each participant has a hypothetical account that grows by an annual
            pay credit and an interest credit. Because the target is a future
            benefit, allowable contributions are generally much larger than a
            401(k) alone — and increase with age. Contributions are typically
            tax-deductible to the business.
          </Note>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Illustrative Ranges"
              meta="Based on the profile entered"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="Potential annual contribution range"
              value={`${money(r.low)} – ${money(r.high)}`}
              note={ready ? `Based on owner age ${r.age}` : 'Enter owner age and annual income to personalize'}
            />

            <Narrative>
              Businesses with characteristics similar to the profile entered
              commonly evaluate Cash Balance Plan contributions in the range of{' '}
              {money(r.low)} to {money(r.high)} per year, with a comparable
              deduction opportunity and estimated tax savings of{' '}
              {money(r.savingsLow)} to {money(r.savingsHigh)} at an assumed{' '}
              {percent(r.marginal * 100, 0)} marginal rate. These figures are
              illustrative and educational only.
            </Narrative>

            <div className="result-list">
              <ResultRow
                label="Estimated deduction opportunity"
                info="Employer contributions to a qualified plan are generally deductible to the business. The deduction is approximately the contribution amount."
                raw={`${money(r.low)} – ${money(r.high)}`}
              />
              <ResultRow
                label="Estimated tax savings"
                info="The deduction multiplied by an estimated marginal tax rate. This is illustrative only."
                raw={`${money(r.savingsLow)} – ${money(r.savingsHigh)}`}
              />
              <ResultRow
                label="Assumed marginal tax rate"
                raw={percent(r.marginal * 100, 0)}
                sub
              />
            </div>

            <div className="chart-block" style={{ marginTop: 20 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 10 }}>
                Illustrative contribution range
              </div>
              <RangeBar low={r.low} high={r.high} reference={REFERENCE_401K} />
              <p className="chart-caption">
                Vertical marker shows an illustrative 401(k) with profit sharing
                ({money(REFERENCE_401K)}) for context.
              </p>
              <div style={{ marginTop: 18 }}>
                <BarCompare
                  height={150}
                  legend={false}
                  groups={[
                    { label: '401(k) + profit sharing', bars: [{ label: '401(k)', value: REFERENCE_401K, color: TONE.cost }] },
                    { label: 'Cash Balance (illustrative)', bars: [{ label: 'Cash Balance', value: r.high, color: TONE.navy }] },
                  ]}
                />
              </div>
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>

          <Panel title="Educational Context">
                <p style={{ marginTop: 0 }}>
                  Businesses with characteristics similar to what you entered
                  commonly evaluate Cash Balance Plans. Firms that most often
                  explore them tend to share several traits:
                </p>
                <ul className="assumptions">
                  <li>
                    Consistent, strong profitability that can support
                    contributions year after year.
                  </li>
                  <li>
                    Owners typically age 45 or older who want to set aside
                    substantially more than a 401(k) allows.
                  </li>
                  <li>
                    A relatively small number of employees, or a workforce where
                    the required staff contributions remain manageable.
                  </li>
                  <li>
                    An existing 401(k) and profit-sharing plan that a Cash
                    Balance Plan can be layered on top of.
                  </li>
                </ul>
                <p style={{ marginBottom: 0 }} className="small muted">
                  {r.incomeSupports
                    ? 'The income level entered is within the range businesses commonly cite when evaluating these plans.'
                    : 'At lower income levels, the contribution ranges above are constrained by compensation, and the fixed cost of maintaining a plan is a larger consideration.'}
                  {r.employees > 20
                    ? ' With a larger employee count, required contributions for staff become a more significant part of the total cost and warrant detailed plan design.'
                    : ''}
                </p>
              </Panel>
        </div>
      </div>

      <Assumptions
        items={[
          'Contribution ranges are illustrative and age-based. Actual limits are certified annually by an enrolled actuary and depend on compensation, plan design, and IRS limits.',
          'Contributions are assumed not to exceed the owner’s compensation; ranges are scaled down when income is below the illustrative band.',
          'Estimated tax savings apply an assumed marginal ordinary rate (married filing jointly) to the deduction and are illustrative only.',
          'Required contributions for non-owner employees are not calculated here and can materially affect total cost.',
          'This tool is educational. It does not recommend any strategy or plan and does not constitute tax or investment advice.',
        ]}
      />
    </ToolShell>
  )
}
