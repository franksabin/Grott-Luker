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
import { money, toNumber } from '../lib/format.js'
import { selfEmploymentTax, TAX_YEAR } from '../lib/tax.js'

// 2025 limits (indexed annually — verify each January).
const LIMITS = {
  deferral401k: 23500,
  catchUp401k: 7500,
  superCatchUp401k: 11250, // ages 60–63
  total415c: 70000,
  compCap: 350000,
  simpleDeferral: 16500,
  simpleCatchUp: 3500,
  simpleSuperCatchUp: 5250, // ages 60–63
  simpleMatch: 0.03,
  sepRate: 0.25,
}

const ENTITY = [
  { value: 'se', label: 'Sole prop / LLC (Schedule C)' },
  { value: 'scorp', label: 'S-corp (W-2 owner)' },
]

const BLANK = { entity: 'se', earnings: '', age: '', employees: '0' }
const SAMPLE = { entity: 'se', earnings: '185000', age: '52', employees: '0' }

function compute(form) {
  const entity = form.entity === 'scorp' ? 'scorp' : 'se'
  const earnings = Math.max(0, toNumber(form.earnings))
  const age = toNumber(form.age)
  const employees = Math.max(0, Math.round(toNumber(form.employees)))

  // Compensation base for employer contributions.
  // Schedule C: net SE earnings less half of SE tax; employer % is 25% of comp after the
  // contribution itself, which works out to 20% of adjusted net earnings.
  const seTax = entity === 'se' ? selfEmploymentTax(earnings) : 0
  const adjNet = entity === 'se' ? Math.max(0, earnings - seTax / 2) : earnings
  const comp = Math.min(adjNet, LIMITS.compCap)
  const employerRate = entity === 'se' ? 0.2 : LIMITS.sepRate
  const employerMax = comp * employerRate

  const catch401 = age >= 60 && age <= 63 ? LIMITS.superCatchUp401k : age >= 50 ? LIMITS.catchUp401k : 0
  const catchSimple = age >= 60 && age <= 63 ? LIMITS.simpleSuperCatchUp : age >= 50 ? LIMITS.simpleCatchUp : 0

  // SEP
  const sep = { id: 'sep', label: 'SEP IRA', employer: Math.min(employerMax, LIMITS.total415c), employee: 0 }
  sep.total = sep.employer

  // Solo 401(k)
  const deferral = Math.min(comp, LIMITS.deferral401k + catch401)
  const employer401 = Math.min(employerMax, Math.max(0, LIMITS.total415c - Math.min(comp, LIMITS.deferral401k)))
  const solo = { id: 'solo', label: 'Solo 401(k)', employee: deferral, employer: Math.min(employer401, Math.max(0, LIMITS.total415c + catch401 - deferral)) }
  solo.total = solo.employee + solo.employer

  // SIMPLE IRA
  const simpleDef = Math.min(comp, LIMITS.simpleDeferral + catchSimple)
  const simple = { id: 'simple', label: 'SIMPLE IRA', employee: simpleDef, employer: comp * LIMITS.simpleMatch }
  simple.total = simple.employee + simple.employer

  const plans = [sep, solo, simple]
  const best = plans.reduce((a, b) => (b.total > a.total ? b : a), plans[0])
  return { entity, earnings, age, employees, seTax, adjNet, comp, employerRate, catch401, catchSimple, sep, solo, simple, plans, best }
}

export default function RetirementPlanComparison() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const hasEmployees = r.employees > 0

  return (
    <ToolShell
      title="Retirement Plan Comparison"
      subtitle="SEP IRA vs. Solo 401(k) vs. SIMPLE IRA for a self-employed owner — the maximum deductible contribution under each from net earnings and age, and what changes once there are employees."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Owner">
            <SegmentedField label="How the business pays the owner" value={form.entity} onChange={set('entity')} options={ENTITY} />
            <MoneyField
              label={r.entity === 'se' ? 'Net self-employment earnings (Schedule C profit)' : 'Owner W-2 wages'}
              value={form.earnings}
              onChange={set('earnings')}
              info={r.entity === 'se' ? 'Net profit before the retirement contribution and before the deduction for half of self-employment tax.' : 'Only W-2 wages count as compensation for plan purposes — S-corp distributions do not.'}
            />
            <div className="field-row">
              <NumberField label="Owner age" value={form.age} onChange={set('age')} hint={r.catch401 ? `Catch-up eligible: +${money(r.catch401)} 401(k) · +${money(r.catchSimple)} SIMPLE` : undefined} />
              <NumberField label="Employees (other than owner/spouse)" value={form.employees} onChange={set('employees')} info="Common-law employees working 1,000+ hours. Changes which plans are available and what they cost." />
            </div>
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="Maximum Contribution by Plan" meta={`Tax year ${TAX_YEAR} limits · compensation base ${money(r.comp)}`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock label="Largest deductible contribution" value={money(r.best.total)} note={`${r.best.label}${r.best.employee ? ` · ${money(r.best.employee)} employee + ${money(r.best.employer)} employer` : ''}`} />
            <Narrative>
              On {money(r.earnings)} of {r.entity === 'se' ? 'net self-employment earnings' : 'W-2 wages'}
              {r.entity === 'se' ? ` (${money(r.adjNet)} after half of self-employment tax)` : ''}, a SEP allows {money(r.sep.total)}; a Solo 401(k) allows {money(r.solo.total)} by adding a {money(r.solo.employee)} employee deferral to the {money(r.solo.employer)} employer contribution; a SIMPLE allows {money(r.simple.total)}.
              {r.solo.total > r.sep.total ? ` The Solo 401(k) advantage over the SEP (${money(r.solo.total - r.sep.total)}) is the employee deferral — it matters most at moderate income, and it disappears once compensation is high enough that the employer piece alone reaches the ${money(LIMITS.total415c)} cap.` : ''}
              {hasEmployees ? ` With ${r.employees} employee${r.employees > 1 ? 's' : ''}, a Solo 401(k) is off the table, a SEP must contribute the same percentage for every eligible employee, and a SIMPLE requires the 3% match (or 2% non-elective) for all — the owner's numbers above don't include those costs.` : ' With no employees, all three are available and the comparison above is the whole picture.'}
            </Narrative>

            <div className="chart-block">
              <BarCompare height={170} groups={r.plans.map((p) => ({ label: p.label, bars: [{ label: 'Employee', value: p.employee, color: TONE.accent }, { label: 'Employer', value: p.employer, color: TONE.navy }] }))} />
            </div>

            <div className="result-list">
              <ResultRow label={`SEP IRA — ${Math.round(r.employerRate * 100)}% of compensation`} value={r.sep.total} total={r.best.id === 'sep'} />
              <ResultRow label={`Solo 401(k) — ${money(r.solo.employee)} deferral + employer`} value={r.solo.total} total={r.best.id === 'solo'} />
              <ResultRow label={`SIMPLE IRA — ${money(r.simple.employee)} deferral + 3% match`} value={r.simple.total} total={r.best.id === 'simple'} />
            </div>

            <div className="panel-title" style={{ border: 'none', marginTop: 18, paddingBottom: 6 }}>Practical differences</div>
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead><tr><th></th><th>SEP IRA</th><th>Solo 401(k)</th><th>SIMPLE IRA</th></tr></thead>
              <tbody>
                <tr><td>Set-up deadline</td><td>Return due date incl. extensions</td><td>Return due date (deferrals need year-end election)</td><td>October 1</td></tr>
                <tr><td>Employees</td><td>Same % for all eligible</td><td>Owner (and spouse) only</td><td>Match 3% or give 2% to all</td></tr>
                <tr><td>Roth option</td><td>Yes (since 2023)</td><td>Yes</td><td>Yes (since 2023)</td></tr>
                <tr><td>Loans</td><td>No</td><td>Yes, if plan allows</td><td>No</td></tr>
                <tr><td>Annual filing</td><td>None</td><td>Form 5500-EZ once assets exceed $250k</td><td>None</td></tr>
                <tr><td>Best when</td><td>Simplicity; high income; late decision</td><td>Maximize at moderate income; want Roth or loans</td><td>Small payroll; modest contributions</td></tr>
              </tbody>
            </table>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Beyond these three">
        Once an owner wants to put away materially more than {money(LIMITS.total415c)} a year and has steady profits, a defined-benefit or cash balance plan is the next conversation — see the Cash Balance Plan Analyzer.
      </Note>

      <Assumptions
        items={[
          `${TAX_YEAR} limits: 401(k) deferral ${money(LIMITS.deferral401k)} (+${money(LIMITS.catchUp401k)} at 50, +${money(LIMITS.superCatchUp401k)} at 60–63); total ${money(LIMITS.total415c)}; SIMPLE deferral ${money(LIMITS.simpleDeferral)} (+${money(LIMITS.simpleCatchUp)} / +${money(LIMITS.simpleSuperCatchUp)}); compensation cap ${money(LIMITS.compCap)}.`,
          'Schedule C employer contributions use 20% of net earnings after half of self-employment tax (the 25%-of-compensation rule solved for the self-employed).',
          'S-corp figures use W-2 wages only; distributions are not compensation.',
          'Employee-coverage costs for SEP and SIMPLE plans with staff are not computed here.',
          'Deadlines and features are summarized; plan documents and payroll timing govern.',
        ]}
      />
    </ToolShell>
  )
}
